'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Check, FileCheck2, FolderOpen, Files, Upload } from 'lucide-react';
import { Button } from '@/app/components/ui';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { pedirUrlsDeEnvio, useCommitHelpVideo } from '@/app/hooks/useAjuda';
import { ARQUIVOS_DO_PACOTE, conferirPassos, formatarTamanho, separarArquivosDoPacote } from '@/app/lib/ajuda';
import { enviarPacote, ErroDeEnvio } from '@/app/lib/envioDoPacote';
import { codigoDoErro, mensagemDoErro } from '@/app/lib/erros';
import { useToastStore } from '@/app/store/toast';
import { T, R, W, NUM } from '@/app/lib/theme';

/** Lê o texto de um arquivo; `Blob.text()` onde existe, `FileReader` onde não. */
function lerTexto(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ''));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsText(file);
  });
}

/**
 * "Enviar vídeo": escolher o pacote, conferir, subir e confirmar.
 *
 * O pacote é a pasta que a esteira de gravação gera, com quatro arquivos
 * (`video.mp4`, `legenda.vtt`, `capa.jpg`, `passos.json`). O caminho é:
 *
 * 1. Escolher. A pasta inteira (`webkitdirectory`), que é o gesto natural para
 *    "este pacote aqui", ou os quatro arquivos soltos, para o navegador que não
 *    escolhe pasta e para quem prefere.
 * 2. Conferir aqui mesmo, sem rede: os quatro nomes, os tamanhos, e o
 *    `passos.json` contra a funcionalidade aberta. Pacote de outra
 *    funcionalidade é recusado antes de subir, com o nome da certa e o link até
 *    ela. Os oito megas só saem quando o pacote é deste lugar.
 * 3. Subir direto para o Storage, um arquivo de cada vez, com a barra de
 *    progresso (ver app/lib/envioDoPacote.js).
 * 4. Confirmar (`commit`). O servidor confere tudo de novo, inclusive o que só
 *    ele sabe conferir (o MP4 é H.264 de verdade, a legenda é WebVTT), e só
 *    então troca o vídeo. Falhou, o vídeo anterior continua no ar, e a frase do
 *    servidor diz qual arquivo marcar.
 *
 * Substituir o vídeo pede confirmação; o primeiro envio, não, porque não há o
 * que perder.
 */
export function EnvioDoPacote({ feature, arvore }) {
  const commit = useCommitHelpVideo(feature.id);
  const qc = useQueryClient();
  const { show: toast } = useToastStore();
  const [pacote, setPacote] = useState(null);
  const [erro, setErro] = useState(null);
  const [fase, setFase] = useState('escolher');
  const [progresso, setProgresso] = useState({ fracao: 0, arquivo: null });
  const [confirmando, setConfirmando] = useState(false);
  const envioAtual = useRef(null);
  // A tela ainda está aberta? Conferido depois de cada `await`: o pedido das
  // URLs leva um vaivém ao servidor, e quem sai da tela nesse meio tempo não
  // pode ter o upload começando sozinho depois, sem tela para confirmá-lo.
  const montado = useRef(false);
  const pastaId = useId();
  const arquivosId = useId();
  const erroId = useId();
  const temVideo = Boolean(feature.video_url);

  // Sair da tela no meio do envio cancela o upload: os arquivos iriam para um
  // diretório temporário que ninguém mais vai confirmar.
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      envioAtual.current?.cancelar();
    };
  }, []);

  const escolher = async (e) => {
    const lista = e.target.files;
    setErro(null);
    setPacote(null);
    setFase('escolher');
    if (!lista || lista.length === 0) return;

    const { arquivos, erro: problema, arquivoComErro } = separarArquivosDoPacote(lista);
    // O campo volta a vazio: escolher a mesma pasta de novo, depois de corrigir
    // um arquivo nela, precisa disparar `change` outra vez.
    e.target.value = '';
    if (problema) {
      setErro({ msg: problema, arquivo: arquivoComErro });
      return;
    }

    let conferencia;
    try {
      conferencia = conferirPassos(await lerTexto(arquivos['passos.json']), feature, arvore);
    } catch {
      setErro({ msg: 'Não deu para ler o passos.json escolhido.', arquivo: 'passos.json' });
      return;
    }
    if (!conferencia.ok) {
      setErro({ msg: conferencia.erro, arquivo: 'passos.json', destino: conferencia.destino });
      return;
    }

    setPacote({ arquivos, passos: conferencia.passos });
    setFase('pronto');
  };

  const enviar = async () => {
    setConfirmando(false);
    setErro(null);
    setFase('enviando');
    setProgresso({ fracao: 0, arquivo: null });

    try {
      const urls = await pedirUrlsDeEnvio(feature.id);
      if (!montado.current) return;
      const envio = enviarPacote({
        urls,
        arquivos: pacote.arquivos,
        onProgresso: (fracao, arquivo) => setProgresso({ fracao, arquivo }),
      });
      envioAtual.current = envio;
      await envio.promessa;
      envioAtual.current = null;
      if (!montado.current) return;

      setFase('conferindo');
      await commit.mutateAsync(urls.upload_id);
      toast(temVideo ? 'Vídeo substituído' : 'Vídeo enviado');
      setPacote(null);
      setFase('escolher');
    } catch (err) {
      envioAtual.current = null;
      if (!montado.current) return;
      setFase('pronto');
      if (err instanceof ErroDeEnvio) {
        setErro({ msg: err.message, arquivo: err.arquivo });
        return;
      }
      const codigo = codigoDoErro(err);
      /*
       * Dois casos em que o vídeo novo pode já estar no ar, e a tela precisa
       * reler a funcionalidade antes de oferecer outro envio:
       * - `500` no commit: a conexão pode ter caído depois da transação, e o
       *   servidor mantém os arquivos novos se já apontou para eles;
       * - `UPLOAD_JA_CONFIRMADO`: este envio já é o vídeo atual.
       * O pacote escolhido continua na tela; enviar de novo pede URLs novas.
       */
      const releu = err?.response?.status >= 500 || codigo === 'UPLOAD_JA_CONFIRMADO';
      if (releu) qc.invalidateQueries({ queryKey: ['help-admin', 'feature', feature.id] });
      const detalhes = err?.response?.data?.error?.details;
      const destino =
        codigo === 'PACOTE_DE_OUTRA_FUNCIONALIDADE' && detalhes?.feature_id
          ? { id: detalhes.feature_id, titulo: detalhes.titulo }
          : null;
      const msg = mensagemDoErro(err, 'Não deu para enviar o pacote. Tente de novo.');
      setErro({
        msg: releu
          ? `${msg} A funcionalidade foi recarregada: confira a pré-visualização antes de enviar de novo. Um novo envio pede endereços novos.`
          : msg,
        arquivo: detalhes?.arquivo ?? null,
        destino,
      });
    }
  };

  const ocupado = fase === 'enviando' || fase === 'conferindo';
  const porcento = Math.round(progresso.fracao * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ color: T.mute, fontSize: 13, lineHeight: 1.6 }}>
        Escolha a pasta do pacote gerado para <strong style={{ color: T.text, fontWeight: W.strong }}>{feature.folder?.slug}/{feature.slug}</strong>.
        Ela tem quatro arquivos: video.mp4, legenda.vtt, capa.jpg e passos.json.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label htmlFor={pastaId} className="btn btn--secondary ajuda-escolha" aria-disabled={ocupado || undefined}>
          <FolderOpen size={16} aria-hidden="true" /> Escolher a pasta do pacote
          <input
            id={pastaId}
            type="file"
            className="sr-only"
            disabled={ocupado}
            onChange={escolher}
            aria-describedby={erro ? erroId : undefined}
            {...{ webkitdirectory: '', directory: '' }}
          />
        </label>
        <label htmlFor={arquivosId} className="btn btn--ghost ajuda-escolha" aria-disabled={ocupado || undefined}>
          <Files size={16} aria-hidden="true" /> Ou escolher os 4 arquivos
          <input
            id={arquivosId}
            type="file"
            multiple
            accept=".mp4,.vtt,.jpg,.jpeg,.json,video/mp4,text/vtt,image/jpeg,application/json"
            className="sr-only"
            disabled={ocupado}
            onChange={escolher}
            aria-describedby={erro ? erroId : undefined}
          />
        </label>
      </div>

      {pacote && (
        <ul aria-label="Arquivos do pacote" style={{ listStyle: 'none', margin: 0, background: T.chip, borderRadius: R.control, padding: '10px 14px' }}>
          {ARQUIVOS_DO_PACOTE.map((a) => (
            <li key={a.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: T.text, padding: '4px 0' }}>
              <Check size={14} color={T.success} aria-hidden="true" />
              <span style={{ flex: 1 }}>{a.nome}</span>
              <span style={{ color: T.mute, ...NUM }}>{formatarTamanho(pacote.arquivos[a.nome].size)}</span>
            </li>
          ))}
          <li style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: T.mute, padding: '6px 0 2px' }}>
            <FileCheck2 size={14} color={T.success} aria-hidden="true" />
            Pacote desta funcionalidade, com {pacote.passos.abas.length === 1 ? '1 aba' : `${pacote.passos.abas.length} abas`}.
          </li>
        </ul>
      )}

      {ocupado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            role="progressbar"
            aria-label="Envio do pacote"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={fase === 'conferindo' ? 100 : porcento}
            aria-valuetext={fase === 'conferindo' ? 'Arquivos enviados, conferindo o pacote' : `${porcento}% enviado`}
            style={{ height: 8, background: T.chip, borderRadius: 999, overflow: 'hidden' }}
          >
            <div
              className="ajuda-progresso"
              style={{ height: '100%', background: T.accent, transformOrigin: 'left center', transform: `scaleX(${fase === 'conferindo' ? 1 : progresso.fracao})` }}
            />
          </div>
          {/* A porcentagem fica só à vista e no `aria-valuetext` da barra: num
              `aria-live`, o leitor de tela anunciaria cada ponto percentual. O
              que se anuncia é a troca de fase e de arquivo. */}
          <p aria-hidden="true" style={{ color: T.mute, fontSize: 13, ...NUM }}>
            {fase === 'conferindo'
              ? 'Arquivos enviados. Conferindo o pacote no servidor...'
              : `Enviando${progresso.arquivo ? ` ${progresso.arquivo}` : ''}: ${porcento}%`}
          </p>
          <p aria-live="polite" className="sr-only">
            {fase === 'conferindo'
              ? 'Arquivos enviados. Conferindo o pacote no servidor.'
              : progresso.arquivo
                ? `Enviando ${progresso.arquivo}.`
                : 'Começando o envio.'}
          </p>
        </div>
      )}

      {erro && (
        <div id={erroId} role="alert" style={{ background: T.dangerSoft, borderRadius: R.control, padding: '12px 14px', color: T.danger, fontSize: 13, lineHeight: 1.55 }}>
          {erro.arquivo && <strong style={{ display: 'block', marginBottom: 2 }}>{erro.arquivo}</strong>}
          {erro.msg}
          {erro.destino?.id && (
            <span style={{ display: 'block', marginTop: 8 }}>
              <Link href={`/desktop/admin/tutoriais/${erro.destino.id}`} className="link-acao" style={{ color: T.text, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Abrir {erro.destino.titulo ? `"${erro.destino.titulo}"` : 'a funcionalidade certa'}
              </Link>
            </span>
          )}
        </div>
      )}

      {pacote && (
        <div>
          <Button onClick={() => (temVideo ? setConfirmando(true) : enviar())} loading={ocupado} disabled={ocupado}>
            <Upload size={16} aria-hidden="true" /> {temVideo ? 'Substituir vídeo' : 'Enviar vídeo'}
          </Button>
        </div>
      )}

      <ConfirmModal
        open={confirmando}
        title="Substituir o vídeo?"
        message={
          `O vídeo atual dá lugar ao do pacote escolhido, e os tempos das abas passam a ser os do pacote novo. ` +
          `Títulos e textos das abas ficam como estão.` +
          (feature.published ? ' O tutorial continua publicado, já com o vídeo novo.' : '')
        }
        confirmLabel="Substituir"
        confirmVariant="primary"
        tone="danger"
        onConfirm={enviar}
        onCancel={() => setConfirmando(false)}
      />
    </div>
  );
}
