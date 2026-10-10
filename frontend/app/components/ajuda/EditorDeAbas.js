'use client';
import { useCallback, useRef, useState } from 'react';
import { Crosshair, Pencil } from 'lucide-react';
import { Button, Input, Textarea } from '@/app/components/ui';
import { useUpdateHelpStep } from '@/app/hooks/useAjuda';
import { formatarInicio } from '@/app/lib/ajuda';
import { mensagemDoErro } from '@/app/lib/erros';
import { useToastStore } from '@/app/store/toast';
import { T, R, W, NUM } from '@/app/lib/theme';

/**
 * As abas da funcionalidade, com o ajuste fino de cada uma.
 *
 * A lista mostra onde o vídeo vai entrar: cada aba com o título, o texto e o
 * segundo em que começa. Sem vídeo, o tempo fica vazio ("Sem tempo"); depois do
 * envio, ele vem do `passos.json`. O ajuste é para quando a aba cai meio
 * segundo antes ou depois da fala: o admin pausa a pré-visualização no ponto
 * certo e usa "Usar o tempo atual do vídeo", que grava o `currentTime` na hora
 * (decisão do proprietário): pausar no ponto certo já é a conferência, e um
 * "Salvar" a mais depois disso era um passo fácil de esquecer. Título, texto e
 * o tempo digitado à mão continuam indo no "Salvar".
 *
 * O foco acompanha o formulário: abrir leva ao "Título", fechar (salvando ou
 * não) devolve ao lápis da mesma aba, e não ao topo da página.
 *
 * `videoRef` é o mesmo `<video>` da pré-visualização (o player do usuário),
 * para que o tempo copiado seja exatamente o que o admin está vendo.
 */
export function EditorDeAbas({ feature, videoRef }) {
  const [aberta, setAberta] = useState(null);
  const temVideo = Boolean(feature.video_url);
  // A aba cujo lápis recebe o foco quando aparecer de novo.
  const voltarAoLapis = useRef(null);
  const fechar = (id) => {
    voltarAoLapis.current = id;
    setAberta(null);
  };

  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {feature.steps.map((step) => (
        <li key={step.id} style={{ background: T.chip, borderRadius: R.control, padding: '12px 14px' }}>
          {aberta === step.id ? (
            <FormularioDaAba
              feature={feature}
              step={step}
              temVideo={temVideo}
              videoRef={videoRef}
              onFechar={() => fechar(step.id)}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ color: T.mute, fontSize: 13, ...NUM, minWidth: 18, paddingTop: 1 }}>{step.order}.</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: T.text, fontSize: 14, fontWeight: W.strong }}>{step.title}</p>
                <p className="line-clamp-2" style={{ color: T.mute, fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>{step.body}</p>
              </div>
              <span style={{ color: typeof step.start_s === 'number' ? T.text : T.mute, fontSize: 13, ...NUM, whiteSpace: 'nowrap', paddingTop: 1 }}>
                {typeof step.start_s === 'number' ? formatarInicio(step.start_s) : 'Sem tempo'}
              </span>
              <button
                type="button"
                ref={(el) => {
                  if (el && voltarAoLapis.current === step.id) {
                    voltarAoLapis.current = null;
                    el.focus();
                  }
                }}
                className="icone-btn icone-btn--compacto"
                aria-label={`Ajustar a aba ${step.order}, ${step.title}`}
                title="Ajustar título, texto e início"
                onClick={() => setAberta(step.id)}
                style={{ marginTop: -8 }}
              >
                <Pencil size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function FormularioDaAba({ feature, step, temVideo, videoRef, onFechar }) {
  const salvarAba = useUpdateHelpStep(feature.id);
  const { show: toast } = useToastStore();
  const [titulo, setTitulo] = useState(step.title);
  const [corpo, setCorpo] = useState(step.body);
  const [inicio, setInicio] = useState(typeof step.start_s === 'number' ? String(step.start_s) : '');
  const [erro, setErro] = useState(null);
  const [gravandoTempo, setGravandoTempo] = useState(false);
  // Abriu pelo lápis: o foco vai ao primeiro campo. Ref estável, para correr só
  // na montagem, e não a cada tecla.
  const focarAoAbrir = useCallback((el) => el?.focus(), []);

  /**
   * Grava na hora o tempo em que a pré-visualização está.
   *
   * Só o `start_s` vai no PATCH: título e texto editados e ainda não salvos
   * continuam no formulário, esperando o "Salvar".
   */
  const usarTempoAtual = async () => {
    if (gravandoTempo) return;
    const t = videoRef?.current?.currentTime;
    if (typeof t !== 'number' || !Number.isFinite(t)) return;
    // Milissegundo, que é a precisão que o servidor guarda.
    const segundos = Math.round(t * 1000) / 1000;
    setInicio(String(segundos));
    setErro(null);
    setGravandoTempo(true);
    try {
      await salvarAba.mutateAsync({ id: step.id, start_s: segundos });
      toast(`Aba ${step.order} começa em ${formatarInicio(segundos)}`);
    } catch (err) {
      setErro({ campo: 'inicio', msg: mensagemDoErro(err, 'Não deu para gravar o tempo. Tente de novo.') });
    } finally {
      setGravandoTempo(false);
    }
  };

  const salvar = async (e) => {
    e.preventDefault();
    setErro(null);
    const corpoReq = {};
    if (titulo.trim() !== step.title) corpoReq.title = titulo.trim();
    if (corpo.trim() !== step.body) corpoReq.body = corpo.trim();
    if (temVideo) {
      const novo = inicio.trim() === '' ? null : Number(inicio.replace(',', '.'));
      if (novo !== null && (!Number.isFinite(novo) || novo < 0)) {
        setErro({ campo: 'inicio', msg: 'O tempo de início precisa ser um número de segundos, zero ou mais.' });
        return;
      }
      if (novo !== step.start_s) corpoReq.start_s = novo;
    }
    if (!titulo.trim()) return setErro({ campo: 'titulo', msg: 'O título não pode ficar vazio.' });
    if (!corpo.trim()) return setErro({ campo: 'corpo', msg: 'O texto não pode ficar vazio.' });
    if (Object.keys(corpoReq).length === 0) {
      onFechar();
      return;
    }
    try {
      await salvarAba.mutateAsync({ id: step.id, ...corpoReq });
      toast(`Aba ${step.order} atualizada`);
      onFechar();
    } catch (err) {
      const msg = mensagemDoErro(err);
      const caminho = err?.response?.data?.error?.details?.[0]?.path;
      const campo =
        caminho === 'title' ? 'titulo' : caminho === 'body' ? 'corpo' : caminho === 'start_s' || /tempo de início/i.test(msg) ? 'inicio' : 'geral';
      setErro({ campo, msg });
    }
  };

  const erroDe = (campo) => (erro?.campo === campo ? erro.msg : undefined);

  return (
    <form onSubmit={salvar} noValidate aria-label={`Ajustar a aba ${step.order}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ color: T.mute, fontSize: 12 }}>Aba {step.order}</p>
      <Input ref={focarAoAbrir} label="Título" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} error={erroDe('titulo')} />
      <Textarea label="Texto" rows={4} maxLength={2000} value={corpo} onChange={(e) => setCorpo(e.target.value)} error={erroDe('corpo')} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ width: 180 }}>
          <Input
            label="Início (segundos)"
            inputMode="decimal"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            disabled={!temVideo || gravandoTempo}
            error={erroDe('inicio')}
            placeholder={temVideo ? 'Ex.: 12,5' : ''}
          />
        </div>
        {/* Sem `loading` durante a gravação: ele desabilita o botão, e o botão
            desabilitado perde o foco de quem acabou de clicar nele. */}
        <Button
          variant="secondary"
          onClick={usarTempoAtual}
          disabled={!temVideo || (salvarAba.isPending && !gravandoTempo)}
          aria-busy={gravandoTempo || undefined}
        >
          <Crosshair size={15} aria-hidden="true" /> {gravandoTempo ? 'Gravando o tempo...' : 'Usar o tempo atual do vídeo'}
        </Button>
      </div>
      {!temVideo && (
        <p style={{ color: T.mute, fontSize: 12 }}>Envie o vídeo antes de ajustar os tempos.</p>
      )}
      {erro?.campo === 'geral' && <p role="alert" style={{ color: T.danger, fontSize: 13 }}>{erro.msg}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" onClick={onFechar} disabled={salvarAba.isPending}>Cancelar</Button>
        <Button type="submit" loading={salvarAba.isPending && !gravandoTempo} disabled={gravandoTempo}>Salvar</Button>
      </div>
    </form>
  );
}
