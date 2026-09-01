'use client';
import { useEffect, useRef, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Camera,
  Check,
  CheckCheck,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { Button, Dialog, Skeleton } from '@/app/components/ui';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { useUnsavedField } from '@/app/hooks/useUnsavedGuard';
import {
  useTicketUpdates,
  useAddTicketUpdate,
  useEditTicketUpdate,
  useRemoveTicketUpdate,
} from '@/app/hooks/useApi';
import { comprimirImagem } from '@/app/lib/imagem';
import { T, R, W } from '@/app/lib/theme';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';

/**
 * Os estados em que existe manutenção a contar.
 *
 * Aberta e encaminhada ficam de fora: não há trabalho ainda, e uma linha do
 * tempo vazia nessas telas só ocuparia espaço prometendo o que não existe. O
 * espelho da regra está em `ticket.service.ts`.
 */
const COM_LINHA_DO_TEMPO = [
  'EM_ANDAMENTO',
  'AGUARDANDO_TERCEIRO',
  'AGUARDANDO_FECHAMENTO',
  'CONCLUIDO',
];

export function temLinhaDoTempo(status) {
  return COM_LINHA_DO_TEMPO.includes(status);
}

/**
 * Onde ainda se escreve.
 *
 * A conclusão informada fecha a linha, e fecha para todo mundo — inclusive para
 * o moderador. O que o responsável entregou é o que o moderador vai validar, e
 * uma linha que continua crescendo depois da entrega não é mais a entrega.
 *
 * Quem precisa acrescentar cancela a conclusão, e o chamado volta a andar (ver
 * `CancelarConclusaoBox`). O espelho da regra está em `ticket.service.ts`.
 */
const ACEITA_ESCRITA = ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO'];

const MAX_FOTOS = 4;

/** Largura da coluna do fio, e o ponto que corre por ela. */
const PONTO = 11;
const COLUNA = 26;

/**
 * O dia por extenso, com o nome do dia da semana na frente.
 *
 * "Terça, 12 de agosto" e não "12/08": manutenção acontece em dias de trabalho,
 * e saber que a peça chegou numa terça e o teste foi na sexta diz mais sobre o
 * ritmo do serviço do que os números sozinhos. O ano só aparece quando não é
 * este — repetido em toda linha, ele vira ruído.
 */
function diaPorExtenso(date) {
  const formato =
    date.getFullYear() === new Date().getFullYear()
      ? "EEEE, d 'de' MMMM"
      : "EEEE, d 'de' MMMM 'de' yyyy";

  const texto = format(date, formato, { locale: ptBR });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Uma linha do fio: o ponto e o traço que desce dele.
 *
 * O traço é de cada linha, e não um só correndo por trás de tudo: um fio
 * contínuo teria de passar por baixo dos pontos, e para isso os pontos vazados
 * precisariam do fundo da superfície em que estão — que é `T.bg` na página e
 * `T.card` dentro das caixas. Em pedaços, o desenho não pergunta onde está.
 */
function Fio({ variante = 'passado', ultimo = false, children }) {
  const ponto = {
    // A ponta viva: onde o serviço está agora.
    atual: { background: T.accent },
    // O que já passou.
    passado: { background: T.chip, boxShadow: `inset 0 0 0 1px ${T.line}` },
    // O que ainda vai ser escrito — o compositor.
    aberto: { background: 'transparent', border: `1px dashed ${T.faint}` },
    // Os dois compassos do fim, que não são anotação de ninguém.
    marco: { background: T.accentSoft },
    // O dia: o fio atravessa, sem parar em ponto nenhum.
    vazio: null,
  }[variante];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${PONTO}px 1fr`, columnGap: COLUNA - PONTO }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {ponto ? (
          <span
            aria-hidden="true"
            style={{
              width: PONTO, height: PONTO, borderRadius: 999, flexShrink: 0,
              // Desce até a altura da primeira linha de texto ao lado.
              marginTop: 4,
              ...ponto,
            }}
          />
        ) : (
          <span aria-hidden="true" style={{ height: 4 }} />
        )}
        {!ultimo && (
          <span aria-hidden="true" style={{ width: 1, flex: 1, background: T.line, marginTop: 5 }} />
        )}
      </div>
      <div style={{ minWidth: 0, paddingBottom: ultimo ? 0 : 18 }}>{children}</div>
    </div>
  );
}

/**
 * As fotos de uma atualização, em miniatura.
 *
 * `<img>` puro, sem `next/image`, pela mesma razão do avatar (ver `Avatar`): a
 * foto já sobe reduzida a 1600px pelo aparelho, e o `next/image` exigiria
 * cadastrar o host do storage na configuração do Next — sem contar que a prévia
 * do que ainda não foi enviado é uma data URL, que ele não sabe otimizar.
 */
function Fotos({ fotos, onAbrir }) {
  if (!fotos?.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      {fotos.map((url, i) => (
        <button
          key={url}
          type="button"
          onClick={() => onAbrir(url)}
          aria-label={`Ver foto ${i + 1} de ${fotos.length}`}
          style={{
            width: 72, height: 72, borderRadius: R.control, overflow: 'hidden',
            border: 'none', padding: 0, cursor: 'pointer', background: T.chip, flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </button>
      ))}
    </div>
  );
}

/**
 * A foto em tamanho de tela.
 *
 * `<dialog>` como todas as caixas do produto, e não uma camada própria: a foto
 * abre por cima da caixa do moderador, e é a *top layer* do elemento nativo que
 * a põe acima de outro `<dialog>` sem ninguém contar camadas. Vêm junto o
 * Escape, o clique no fundo e o foco preso — que num visor de foto é o que faz
 * a volta cair de novo na miniatura de onde se saiu.
 */
function FotoAmpliada({ url, onClose }) {
  if (!url) return null;

  return (
    <Dialog onClose={onClose} className="dialog--full" aria-label="Foto da atualização">
      <div
        className="anim-scale-in"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100vw', height: '100dvh', padding: 20,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: R.card }}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar foto"
          style={{
            position: 'absolute', top: 'calc(16px + env(safe-area-inset-top))', right: 16,
            width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: T.chip, color: T.text, boxShadow: T.cardRing,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={18} />
        </button>
      </div>
    </Dialog>
  );
}

/** A hora e o autor, a linha de cima de cada anotação. */
function Cabecalho({ hora, autor, editado }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ color: T.text, fontSize: 12, fontWeight: W.strong, fontVariantNumeric: 'tabular-nums' }}>
        {hora}
      </span>
      <span style={{ color: T.faint, fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {autor}
        {editado && ' · editada'}
      </span>
    </div>
  );
}

/**
 * Uma anotação da linha do tempo.
 *
 * Editar e apagar aparecem só na última, e só para quem a escreveu: o que já
 * tem outra linha embaixo foi lido, e reescrevê-lo faria o registro deixar de
 * valer como registro. A regra é conferida no servidor; aqui ela só decide se o
 * botão existe.
 */
function Anotacao({ update, atual, ultimo, podeAlterar, ticketId, onAbrirFoto }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(update.description);
  const [apagando, setApagando] = useState(false);
  const campoRef = useRef(null);

  const editar = useEditTicketUpdate(ticketId);
  const remover = useRemoveTicketUpdate(ticketId);
  const { show: toast } = useToastStore();

  // O toque em "Editar" é que pede o teclado: sem isto, no telefone é preciso
  // tocar de novo no campo que acabou de abrir. Não é `autoFocus` porque aquele
  // atributo dispararia também na hidratação da página.
  useEffect(() => {
    if (editando) campoRef.current?.focus();
  }, [editando]);

  const quando = new Date(update.created_at);

  async function salvar() {
    const limpo = texto.trim();
    if (!limpo) {
      toast('Escreva o que foi feito', 'error');
      return;
    }

    try {
      await editar.mutateAsync({ updateId: update.id, description: limpo });
      setEditando(false);
      toast('Atualização corrigida', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao corrigir a atualização', 'error');
    }
  }

  async function apagar() {
    try {
      await remover.mutateAsync(update.id);
      setApagando(false);
      toast('Atualização apagada', 'info');
    } catch (e) {
      setApagando(false);
      toast(e?.response?.data?.error?.message || 'Erro ao apagar a atualização', 'error');
    }
  }

  return (
    <Fio variante={atual ? 'atual' : 'passado'} ultimo={ultimo}>
      <Cabecalho
        hora={format(quando, 'HH:mm', { locale: ptBR })}
        autor={update.author}
        editado={!!update.edited_at}
      />

      {editando ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            ref={campoRef}
            style={{
              background: T.chip, border: `1px solid ${T.line}`, borderRadius: R.control,
              padding: '11px 13px', color: T.text, fontSize: 16, outline: 'none',
              width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={salvar} loading={editar.isPending} style={{ flex: 1, padding: '10px 14px' }}>
              <Check size={14} /> Salvar
            </Button>
            <Button
              variant="secondary"
              onClick={() => { setTexto(update.description); setEditando(false); }}
              style={{ padding: '10px 14px' }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p style={{ color: T.text, fontSize: 14, lineHeight: 1.65, marginTop: 5, whiteSpace: 'pre-wrap' }}>
          {update.description}
        </p>
      )}

      {!editando && <Fotos fotos={update.photos} onAbrir={onAbrirFoto} />}

      {podeAlterar && !editando && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <Button variant="ghost" onClick={() => setEditando(true)} style={{ padding: '6px 10px', fontSize: 12 }}>
            <Pencil size={12} /> Editar
          </Button>
          <Button variant="ghost" onClick={() => setApagando(true)} style={{ padding: '6px 10px', fontSize: 12 }}>
            <Trash2 size={12} /> Apagar
          </Button>
        </div>
      )}

      <ConfirmModal
        open={apagando}
        title="Apagar esta atualização?"
        message="O texto e as fotos saem da linha do tempo, e isso não tem volta."
        confirmLabel="Apagar"
        loading={remover.isPending}
        onConfirm={apagar}
        onCancel={() => setApagando(false)}
      />
    </Fio>
  );
}

/**
 * Um dos dois compassos do fim: a conclusão informada e o fechamento.
 *
 * Não são anotação de ninguém — são o que os carimbos do chamado já diziam,
 * lidos no lugar onde eles acontecem. Sem eles a linha do tempo parava no
 * penúltimo passo e o desfecho ficava numa grade de datas do outro lado da
 * tela.
 */
function Marco({ titulo, texto, quando, ultimo }) {
  return (
    <Fio variante="marco" ultimo={ultimo}>
      <div style={{ background: T.accentSoft, borderRadius: R.control, padding: '11px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCheck size={14} color={T.accentInk} style={{ flexShrink: 0 }} />
          <p style={{ color: T.text, fontSize: 12, fontWeight: W.strong }}>{titulo}</p>
        </div>
        <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>
          {format(new Date(quando), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
        </p>
        {texto && (
          <p style={{
            color: T.text, fontSize: 13, lineHeight: 1.6, marginTop: 8, whiteSpace: 'pre-wrap',
            borderTop: `1px solid ${T.line}`, paddingTop: 8,
          }}>
            {texto}
          </p>
        )}
      </div>
    </Fio>
  );
}

/**
 * Onde se escreve o próximo passo.
 *
 * Fica no fio, com um ponto tracejado no lugar exato onde a próxima anotação
 * vai nascer: a linha continua para dentro do campo. Não é caixa à parte nem
 * botão flutuante — escrever aqui é a continuação natural da leitura, e é o
 * gesto mais frequente desta tela.
 *
 * "O lugar exato" muda com a ordem escolhida: no topo quando a lista abre pelas
 * mais recentes, no pé quando abre pelas mais antigas. É por isso que `ultimo`
 * vem de fora — quem sabe se sobrou fio embaixo é a lista, não ele.
 */
function Compositor({ ticketId, ultimo = true }) {
  const [texto, setTexto] = useState('');
  const [fotos, setFotos] = useState([]);
  const [preparando, setPreparando] = useState(false);
  const fileRef = useRef(null);

  const adicionar = useAddTicketUpdate(ticketId);
  const { show: toast } = useToastStore();

  // O que está escrito e não foi registrado é perda de verdade: quem digitou no
  // subsolo do prédio não vai digitar de novo.
  useUnsavedField(texto.trim().length > 0 || fotos.length > 0);

  async function escolherFotos(event) {
    const escolhidas = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!escolhidas.length) return;

    const cabem = MAX_FOTOS - fotos.length;
    if (cabem <= 0) {
      toast(`No máximo ${MAX_FOTOS} fotos por atualização`, 'error');
      return;
    }

    setPreparando(true);
    const prontas = [];

    for (const file of escolhidas.slice(0, cabem)) {
      try {
        prontas.push(await comprimirImagem(file));
      } catch (e) {
        toast(e.message || 'Não foi possível abrir essa imagem', 'error');
      }
    }

    setFotos((atuais) => [...atuais, ...prontas]);
    setPreparando(false);

    if (escolhidas.length > cabem) {
      toast(`Só as ${cabem === 1 ? 'primeira' : `${cabem} primeiras`} entraram — o limite é ${MAX_FOTOS}`, 'info');
    }
  }

  async function registrar() {
    const limpo = texto.trim();
    if (!limpo) {
      toast('Escreva o que foi feito', 'error');
      return;
    }

    try {
      await adicionar.mutateAsync({ description: limpo, photos: fotos });
      setTexto('');
      setFotos([]);
      toast('Atualização registrada', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao registrar a atualização', 'error');
    }
  }

  return (
    <Fio variante="aberto" ultimo={ultimo}>
      <label style={{ display: 'block' }}>
        <span style={{ color: T.mute, fontSize: 12 }}>O que foi feito agora?</span>
        <textarea
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Troquei a válvula e testei por 20 minutos…"
          style={{
            background: T.chip, border: `1px solid ${T.line}`, borderRadius: R.control,
            padding: '12px 14px', color: T.text, fontSize: 16, outline: 'none',
            width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
            marginTop: 7,
          }}
        />
      </label>

      {fotos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {fotos.map((foto, i) => (
            <div key={foto.slice(-40) + i} className="anim-pop-in" style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto}
                alt=""
                style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: R.control, display: 'block' }}
              />
              <button
                type="button"
                onClick={() => setFotos((atuais) => atuais.filter((_, j) => j !== i))}
                aria-label={`Tirar a foto ${i + 1}`}
                style={{
                  position: 'absolute', top: -6, right: -6,
                  width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: T.chip, color: T.text, boxShadow: T.cardRing,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={escolherFotos}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          loading={preparando}
          disabled={fotos.length >= MAX_FOTOS}
          style={{ padding: '11px 14px' }}
        >
          <Camera size={15} />
          {fotos.length > 0 ? `${fotos.length}/${MAX_FOTOS}` : 'Fotos'}
        </Button>
        <Button onClick={registrar} loading={adicionar.isPending} style={{ flex: 1 }}>
          Registrar
        </Button>
      </div>
    </Fio>
  );
}

/**
 * A linha do tempo da manutenção.
 *
 * Antes disto, o que se fazia num chamado cabia num campo só: `done_report`,
 * escrito no fim e sobrescrito a cada edição. Manutenção que leva dias não cabe
 * nele — a peça que chegou na quarta e o teste da sexta viravam um parágrafo ou
 * nada. Aqui cada passo tem hora própria, e o conjunto é o que o moderador lê
 * antes de fechar.
 *
 * O que dá estrutura é o **dia**, e não a contagem. Ninguém procura "a terceira
 * atualização"; procura o que aconteceu na terça. Por isso a data encabeça os
 * grupos e a hora abre cada linha — e por isso não há numeração.
 *
 * A mesma peça serve às três telas que a mostram: a página da ocorrência, a
 * caixa do moderador em processamento e a do histórico. Quem decide se o
 * compositor aparece é `podeEscrever`; quem decide de verdade é o servidor.
 */
export function LinhaDoTempo({ ticket, podeEscrever = false }) {
  const { user } = useAuthStore();
  const [foto, setFoto] = useState(null);

  const mostra = temLinhaDoTempo(ticket?.status);
  const { data, isLoading } = useTicketUpdates(ticket?.id, mostra);

  if (!ticket || !mostra) return null;

  const updates = data?.updates ?? [];
  const escrevendo = podeEscrever && ACEITA_ESCRITA.includes(ticket.status);

  const marcos = [
    ticket.done_at && {
      chave: 'done',
      titulo: 'Conclusão informada',
      texto: ticket.done_report,
      quando: ticket.done_at,
    },
    ticket.closed_at && {
      chave: 'closed',
      titulo: `Finalizado por ${ticket.closed_by?.name ?? 'moderador'}`,
      // Sem texto: a anotação do moderador não é o fechamento — ela pode ter
      // sido escrita no meio da execução, e tem bloco próprio nas caixas que a
      // mostram. Repeti-la aqui diria que ela foi escrita agora.
      texto: null,
      quando: ticket.closed_at,
    },
  ].filter(Boolean);

  /**
   * Tudo o que aconteceu, numa sequência só, ordenada pelo relógio.
   *
   * Anotações e marcos entram na mesma lista e são ordenados juntos, pelo
   * instante: são a mesma história contada por bocas diferentes, e uma
   * conclusão informada às 14h vem depois da anotação das 11h — não depois de
   * todas as anotações que existirem. Enquanto as duas listas eram desenhadas
   * uma após a outra, isso valia por acaso, e deixaria de valer no dia em que
   * alguém escrevesse depois de concluir.
   */
  const passos = [
    ...updates.map((update) => ({
      chave: update.id,
      tipo: 'anotacao',
      quando: new Date(update.created_at),
      update,
    })),
    ...marcos.map((marco) => ({
      chave: marco.chave,
      tipo: 'marco',
      quando: new Date(marco.quando),
      marco,
    })),
  ].sort((a, b) => a.quando - b.quando);

  // A ponta viva é a última anotação — a menos que o chamado já tenha desfecho,
  // e aí quem fala pelo fim é o marco.
  const ultimaAnotacao = updates.at(-1)?.id ?? null;

  /**
   * As linhas na ordem em que serão desenhadas, com os dias intercalados.
   *
   * Do mais recente ao mais antigo, sempre. Quem abre um chamado que já corre
   * há dias quer saber em que pé ele está agora, e não recomeçar a história do
   * princípio — o que decide o próximo passo é o último. Não há controle para
   * inverter: a linha é curta, cabe numa tela, e um botão de ordem aqui seria
   * uma pergunta a mais numa peça que existe para responder uma só. Escolher
   * ordem é coisa de lista de arquivo, e ali ela existe (ver `FiltrosChamados`,
   * nos finalizados).
   *
   * O dia entra quando muda em relação ao passo anterior — e é o que faz o
   * cabeçalho continuar certo de cabeça para baixo: lendo do mais novo, "sexta"
   * abre a sexta e "quinta" abre a quinta, mais abaixo.
   *
   * O compositor abre a lista, e não a fecha: a próxima anotação nasce em cima,
   * e o campo tem de estar onde ela vai aparecer. É a linha continuando para
   * dentro do que se digita.
   */
  const ordenados = [...passos].reverse();

  const linhas = [];
  if (escrevendo) linhas.push({ chave: 'compositor', tipo: 'compositor' });

  ordenados.forEach((passo, i) => {
    const anterior = ordenados[i - 1];
    if (!anterior || !isSameDay(passo.quando, anterior.quando)) {
      linhas.push({ chave: `dia-${passo.chave}`, tipo: 'dia', quando: passo.quando });
    }
    linhas.push(passo);
  });

  return (
    <div>
      <h3 style={{ color: T.mute, fontSize: 12, marginBottom: 14 }}>Andamento da manutenção</h3>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map((i) => (
            <Skeleton key={i} className="anim-fade-in" style={{ height: 66, borderRadius: R.control }} />
          ))}
        </div>
      )}

      {!isLoading && passos.length === 0 && (
        <p style={{ color: T.faint, fontSize: 13, lineHeight: 1.6, marginBottom: escrevendo ? 18 : 0 }}>
          {escrevendo
            ? 'Nada registrado ainda. A primeira anotação abre a linha do tempo — e é ela que libera concluir.'
            : 'O responsável ainda não registrou nenhum passo desta manutenção.'}
        </p>
      )}

      {!isLoading && (
        <div>
          {linhas.map((linha, i) => {
            const ultimo = i === linhas.length - 1;

            if (linha.tipo === 'dia') {
              return (
                <Fio key={linha.chave} variante="vazio" ultimo={ultimo}>
                  <p style={{ color: T.faint, fontSize: 12, paddingBottom: 2 }}>{diaPorExtenso(linha.quando)}</p>
                </Fio>
              );
            }

            if (linha.tipo === 'compositor') {
              return <Compositor key={linha.chave} ticketId={ticket.id} ultimo={ultimo} />;
            }

            if (linha.tipo === 'marco') {
              return (
                <Marco
                  key={linha.chave}
                  titulo={linha.marco.titulo}
                  texto={linha.marco.texto}
                  quando={linha.marco.quando}
                  ultimo={ultimo}
                />
              );
            }

            const ehUltimaAnotacao = linha.update.id === ultimaAnotacao;

            return (
              <Anotacao
                key={linha.chave}
                update={linha.update}
                ticketId={ticket.id}
                atual={ehUltimaAnotacao && marcos.length === 0}
                ultimo={ultimo}
                // Só a última, só de quem a escreveu, e só enquanto o chamado
                // aceita escrita — depois de concluído nada mais se altera.
                podeAlterar={
                  escrevendo && ehUltimaAnotacao && !!user?.id && linha.update.author_id === user.id
                }
                onAbrirFoto={setFoto}
              />
            );
          })}
        </div>
      )}

      <FotoAmpliada url={foto} onClose={() => setFoto(null)} />
    </div>
  );
}
