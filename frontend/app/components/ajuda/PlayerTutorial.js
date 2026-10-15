'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ListOrdered } from 'lucide-react';
import { Button } from '@/app/components/ui';
import { SELO_TEXTO, formatarInicio, indiceDaAbaNoTempo, progressoDaAba } from '@/app/lib/ajuda';
import { falasCronometradas, falasDoTrecho, indiceDaFala } from '@/app/lib/pacoteDoVideo';
import { T, R, W } from '@/app/lib/theme';

/**
 * O player de um tutorial: o vídeo, o passo a passo e o texto narrado.
 *
 * É o mesmo componente na Tela 3 do usuário e na pré-visualização do admin, e
 * isso é o requisito, não economia: o admin confere se cada passo cai no ponto
 * certo do vídeo, e só confere de verdade se o que ele vê é exatamente o que a
 * pessoa vai ver.
 *
 * Com vídeo, o formato é contínuo: uma narração só, e cada passo é um ponto
 * (`start_s`) dentro dela. Por isso não há abas para trocar, e sim um passo a
 * passo que anda sozinho:
 * - o passo atual é o último com `start_s <= currentTime` (`indiceDaAbaNoTempo`);
 * - a linha de capítulos debaixo do vídeo tem um trecho por passo, e o trecho
 *   do passo atual enche conforme ele passa;
 * - o texto do passo aparece frase a frase, acompanhando a fala: a frase dita
 *   agora acesa e com o marca-texto andando sob ela, a anterior apagada, as
 *   próximas mais apagadas ainda. As frases saem das falas da `legenda.vtt`
 *   (lidas da `<track>`); sem elas, de uma estimativa pelo tamanho do texto;
 * - clicar num passo, ou num trecho da linha, leva o vídeo àquele ponto.
 *
 * Sem vídeo (`video_url` nulo), o tutorial é o passo a passo em texto, com
 * navegação manual: a lista de passos é uma tablist vertical, com o mesmo
 * desenho da lista do vídeo, e o painel mostra o passo escolhido.
 *
 * `passo` é o índice pedido de fora (o `?passo=N` da URL); `onPassoChange`
 * avisa cada troca, para a página manter a URL em dia. `videoRef` dá ao admin o
 * `<video>`, de onde sai o "Usar o tempo atual do vídeo".
 */
export function PlayerTutorial({ feature, passo = 0, onPassoChange, videoRef, onUrlsVencidas, tituloNivel = 'h2' }) {
  const steps = useMemo(() => feature?.steps ?? [], [feature?.steps]);
  const total = steps.length;
  const temVideo = Boolean(feature?.video_url);

  const [ativa, setAtiva] = useState(() => Math.min(passo, Math.max(total - 1, 0)));

  // O passo pedido de fora, ajustado no próprio render (e não num efeito, pela
  // regra react-hooks/set-state-in-effect): num efeito, o passo velho chegaria
  // a aparecer por um quadro.
  const [pedidoVisto, setPedidoVisto] = useState(passo);
  if (passo !== pedidoVisto) {
    setPedidoVisto(passo);
    if (passo >= 0 && passo < total) setAtiva(passo);
  }

  if (total === 0) {
    return <p style={{ color: T.mute, fontSize: 14 }}>Este tutorial ainda não tem passos.</p>;
  }

  const props = { feature, steps, total, ativa, setAtiva, passo, onPassoChange, tituloNivel };
  return temVideo ? (
    <PassoAPassoComVideo {...props} videoRef={videoRef} onUrlsVencidas={onUrlsVencidas} />
  ) : (
    <PassoAPassoEmTexto {...props} />
  );
}

/* ── Com vídeo: o passo a passo que anda sozinho ──────────────────────────── */

function PassoAPassoComVideo({ feature, steps, total, ativa, setAtiva, passo, onPassoChange, videoRef, onUrlsVencidas, tituloNivel }) {
  const base = useId();
  const [tempo, setTempo] = useState(() => (typeof steps[ativa]?.start_s === 'number' ? steps[ativa].start_s : 0));
  const [duracaoLida, setDuracaoLida] = useState(null);
  const [falasDaLegenda, setFalasDaLegenda] = useState(null);
  const [anuncio, setAnuncio] = useState('');

  const videoEl = useRef(null);
  const trackEl = useRef(null);
  // Enquanto um seek pedido pelo passo não termina, o `timeupdate` ainda informa
  // o tempo antigo, e devolveria o destaque para onde estava antes.
  const buscando = useRef(false);
  const ativaRef = useRef(ativa);
  // O último passo que o próprio player avisou para fora. A página escreve esse
  // passo na URL, a URL volta como `passo`, e sem esta marca o eco seria tratado
  // como pedido novo: o vídeo voltaria ao começo do capítulo a cada troca.
  const avisado = useRef(null);
  useEffect(() => {
    ativaRef.current = ativa;
  }, [ativa]);

  const duracao = duracaoLida ?? (typeof feature?.duration_s === 'number' ? feature.duration_s : null);

  const ligarVideo = useCallback(
    (el) => {
      videoEl.current = el;
      if (videoRef) videoRef.current = el;
    },
    [videoRef]
  );

  /**
   * Põe o vídeo num tempo e marca a busca em andamento. A marca só vale com os
   * metadados carregados (`readyState >= 1`): antes disso não há `seeked`, e
   * ela ficaria presa, com o passo a passo parado para sempre.
   */
  const buscar = useCallback((video, inicio) => {
    buscando.current = video.readyState >= 1;
    try {
      video.currentTime = inicio;
    } catch {
      buscando.current = false;
    }
  }, []);

  const levarVideo = useCallback(
    (indice) => {
      const video = videoEl.current;
      const inicio = steps[indice]?.start_s;
      if (!video || typeof inicio !== 'number') return;
      buscar(video, inicio);
      setTempo(inicio);
    },
    [steps, buscar]
  );

  // O passo pedido pela URL também move o vídeo. A dependência é o tempo do
  // passo pedido, e não a lista inteira: cada releitura da funcionalidade traz
  // uma lista nova, e o vídeo voltaria ao passo da URL sem ninguém ter pedido.
  const inicioPedido = steps[passo]?.start_s;
  useEffect(() => {
    const video = videoEl.current;
    if (!video || passo < 0 || typeof inicioPedido !== 'number') return;
    if (passo === avisado.current) return;
    buscar(video, inicioPedido);
  }, [passo, inicioPedido, buscar]);

  const trocarPasso = (indice) => {
    setAtiva(indice);
    avisado.current = indice;
    onPassoChange?.(indice);
    // Só a troca é anunciada, e não o andar dentro do passo: um leitor de tela
    // lendo o tempo a cada quarto de segundo tornaria o vídeo inaudível.
    setAnuncio(`Passo ${indice + 1} de ${total}: ${steps[indice]?.title ?? ''}`);
  };

  const irPara = (indice) => {
    if (indice < 0 || indice >= total) return;
    if (indice !== ativaRef.current) trocarPasso(indice);
    levarVideo(indice);
  };

  const aoAndar = () => {
    const video = videoEl.current;
    if (!video || buscando.current) return;
    const t = video.currentTime;
    setTempo(t);
    const indice = indiceDaAbaNoTempo(steps, t);
    if (indice !== ativaRef.current && typeof steps[indice]?.start_s === 'number') trocarPasso(indice);
  };

  const aoTerminarBusca = () => {
    buscando.current = false;
    aoAndar();
  };

  const aoCarregar = () => {
    const video = videoEl.current;
    if (video && Number.isFinite(video.duration) && video.duration > 0) setDuracaoLida(video.duration);
    if (ativaRef.current > 0) levarVideo(ativaRef.current);
    else buscando.current = false;
  };

  /**
   * A URL assinada venceu com a tela aberta (vale quatro horas). Quem busca a
   * funcionalidade de novo é a página, dona da consulta; só depois do
   * vencimento, porque um erro de rede comum não se resolve com outra URL.
   */
  const aoFalhar = () => {
    const vence = feature?.urls_expire_at ? Date.parse(feature.urls_expire_at) : NaN;
    if (Number.isFinite(vence) && Date.now() >= vence - 60 * 1000) onUrlsVencidas?.();
  };

  /**
   * As falas da legenda, lidas da `<track>` quando ela termina de carregar.
   * O navegador já as interpretou (é o mesmo arquivo que desenha a legenda no
   * vídeo), e ler daqui poupa baixar e interpretar o `.vtt` de novo.
   */
  const lerFalas = useCallback(() => {
    const cues = trackEl.current?.track?.cues;
    if (!cues || cues.length === 0) return;
    setFalasDaLegenda(
      Array.from(cues).map((c) => ({
        inicio: c.startTime,
        fim: c.endTime,
        texto: String(c.text ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
      }))
    );
  }, []);
  // A `<track>` pode ter carregado antes de o React ligar o `onLoad`.
  useEffect(() => {
    lerFalas();
  }, [lerFalas, feature?.captions_url]);

  // Sem legenda lida, as falas saem do texto dos passos, pela mesma conta que
  // monta a legenda de um vídeo enviado sozinho. Só com todos os tempos.
  const falasEstimadas = useMemo(() => {
    if (!duracao || steps.some((s) => typeof s.start_s !== 'number')) return null;
    return falasCronometradas(
      steps.map((s) => s.body),
      steps.map((s) => s.start_s),
      duracao
    );
  }, [steps, duracao]);
  const falas = falasDaLegenda ?? falasEstimadas;

  const step = steps[Math.min(ativa, total - 1)];
  const inicioAtiva = step?.start_s;
  const proximoInicio = steps.slice(ativa + 1).find((s) => typeof s.start_s === 'number')?.start_s;
  const fimAtiva = typeof proximoInicio === 'number' ? proximoInicio : duracao;
  const falasDoPasso = typeof inicioAtiva === 'number' ? falasDoTrecho(falas, inicioAtiva, proximoInicio) : [];
  const falaAtual = indiceDaFala(falasDoPasso, tempo);
  const progresso = progressoDaAba(steps, ativa, tempo, duracao);

  const Titulo = tituloNivel;
  const tituloId = `${base}-agora`;

  return (
    <div className="ajuda-player ajuda-player--video">
      <div className="ajuda-palco" data-dispositivo={feature?.device === 'MOBILE' ? 'celular' : 'computador'}>
        {/*
          `crossOrigin="anonymous"`: a legenda mora no Storage, outro domínio,
          e sem ele o navegador baixa a `<track>` mas se recusa a usá-la.
          `preload="metadata"` baixa só o começo: quem abre o tutorial para ler
          não paga o vídeo inteiro. A `<track>` só entra com a legenda em mãos.
        */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={ligarVideo}
          controls
          preload="metadata"
          poster={feature.poster_url ?? undefined}
          playsInline
          crossOrigin="anonymous"
          src={feature.video_url}
          aria-label={`Vídeo do tutorial: ${feature.title}`}
          onTimeUpdate={aoAndar}
          onSeeked={aoTerminarBusca}
          onLoadedMetadata={aoCarregar}
          onError={aoFalhar}
        >
          {feature.captions_url && (
            <track ref={trackEl} kind="captions" srcLang="pt-BR" label="Português" src={feature.captions_url} default onLoad={lerFalas} />
          )}
        </video>
      </div>

      <LinhaDeCapitulos steps={steps} ativa={ativa} progresso={progresso} duracao={duracao} onIr={irPara} />

      <section aria-labelledby={tituloId} className="ajuda-agora">
        <p className="ajuda-agora__rotulo">
          Passo {ativa + 1} de {total}
          {typeof inicioAtiva === 'number' && typeof fimAtiva === 'number' && (
            <span className="ajuda-agora__tempo"> · {formatarInicio(inicioAtiva).replace(/,\d$/, '')}</span>
          )}
        </p>
        <Titulo id={tituloId} className="ajuda-agora__titulo" style={{ fontFamily: T.display, fontWeight: W.title }}>
          {step.title}
        </Titulo>
        <TextoNarrado key={step.id ?? ativa} texto={step.body} falas={falasDoPasso} atual={falaAtual} tempo={tempo} />
      </section>

      <ol className="ajuda-passos" aria-label="Passos do tutorial">
        {steps.map((s, i) => {
          const on = i === ativa;
          const feito = i < ativa;
          return (
            <li key={s.id ?? i}>
              <button
                type="button"
                className={`ajuda-passo${on ? ' is-on' : ''}${feito ? ' is-feito' : ''}`}
                aria-current={on ? 'step' : undefined}
                onClick={() => irPara(i)}
              >
                <span className="ajuda-passo__num" aria-hidden="true">{i + 1}</span>
                <span className="sr-only">{`Passo ${i + 1}: `}</span>
                <span className="ajuda-passo__titulo">{s.title}</span>
                {typeof s.start_s === 'number' && (
                  <span className="ajuda-passo__tempo">
                    <span className="sr-only">, começa em </span>
                    {formatarInicio(s.start_s).replace(/,\d$/, '')}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <p className="sr-only" aria-live="polite">{anuncio}</p>
    </div>
  );
}

/**
 * A linha de capítulos: um trecho por passo, do tamanho dele no vídeo.
 *
 * Os trechos já passados ficam cheios, o atual enche com o tempo, e os
 * próximos ficam vazios. As frestas entre os trechos são as marcas dos
 * capítulos. É um atalho de ponteiro (clicar leva ao capítulo) e uma leitura
 * visual: fica fora do leitor de tela e do Tab, porque a lista de passos logo
 * abaixo já dá o mesmo caminho, com nome.
 */
function LinhaDeCapitulos({ steps, ativa, progresso, duracao, onIr }) {
  const marcados = steps.map((s, i) => ({ i, inicio: s.start_s })).filter((m) => typeof m.inicio === 'number');
  if (!duracao || marcados.length === 0) return null;
  return (
    <div className="ajuda-capitulos" aria-hidden="true">
      {marcados.map((m, j) => {
        const fim = j + 1 < marcados.length ? marcados[j + 1].inicio : duracao;
        const tamanho = Math.max(0.001, fim - m.inicio);
        const cheio = m.i < ativa ? 1 : m.i === ativa ? progresso : 0;
        return (
          <button
            key={m.i}
            type="button"
            tabIndex={-1}
            className={`ajuda-capitulo${m.i === ativa ? ' is-on' : ''}`}
            style={{ flexGrow: tamanho }}
            title={`${m.i + 1}. ${steps[m.i].title}`}
            onClick={() => onIr(m.i)}
          >
            <span className="ajuda-capitulo__cheio" style={{ transform: `scaleX(${cheio})` }} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * O texto do passo, frase a frase, acompanhando a fala.
 *
 * Com as falas cronometradas, cada uma vira um trecho: a dita agora fica
 * acesa, com o marca-texto andando por baixo no ritmo da fala; a anterior
 * apagada; as que vêm, mais apagadas. A troca é por transição de cor e do
 * tamanho do fundo, e não de bloco: a leitura escorre de uma frase para a
 * outra. Com movimento reduzido, o marca-texto aparece inteiro, sem andar.
 *
 * Sem falas (passo sem tempo), é o texto corrido, como no modo texto.
 */
function TextoNarrado({ texto, falas, atual, tempo }) {
  if (!falas || falas.length === 0) {
    return <p className="ajuda-narrado">{texto}</p>;
  }
  return (
    <p className="ajuda-narrado">
      {falas.map((f, i) => {
        const estado = i === atual ? 'agora' : i < atual ? i === atual - 1 ? 'antes' : 'dita' : 'vem';
        const duracao = Math.max(0.001, f.fim - f.inicio);
        const andou = i === atual ? Math.min(1, Math.max(0, (tempo - f.inicio) / duracao)) : i < atual ? 1 : 0;
        return (
          <span key={`${f.inicio}-${i}`}>
            <span className={`ajuda-fala ajuda-fala--${estado}`} style={{ '--andou': andou }}>
              {f.texto}
            </span>
            {i < falas.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </p>
  );
}

/* ── Sem vídeo: passo a passo em texto, navegação manual ──────────────────── */

function PassoAPassoEmTexto({ steps, total, ativa, setAtiva, onPassoChange, tituloNivel }) {
  const base = useId();
  const abasEl = useRef([]);
  const anteriorEl = useRef(null);
  const proximoEl = useRef(null);
  const painelEl = useRef(null);

  const irPara = (indice, { focar = false } = {}) => {
    if (indice < 0 || indice >= total) return;
    setAtiva(indice);
    onPassoChange?.(indice);
    if (focar) abasEl.current[indice]?.focus();
  };

  /**
   * Chegando à ponta, o botão clicado vira `disabled` e perderia o foco: ele
   * vai para o botão do outro lado, o próximo gesto provável; com um passo só,
   * para o painel.
   */
  const andarPeloBotao = (direcao) => {
    const destino = ativa + direcao;
    if (destino < 0 || destino >= total) return;
    irPara(destino);
    const naPonta = direcao < 0 ? destino === 0 : destino === total - 1;
    if (!naPonta) return;
    const outro = direcao < 0 ? proximoEl.current : anteriorEl.current;
    if (outro && total > 1) outro.focus();
    else painelEl.current?.focus();
  };

  // Padrão WAI-ARIA de tablist, vertical e com ativação automática.
  const aoTeclar = (e) => {
    const mapa = {
      ArrowRight: (ativa + 1) % total,
      ArrowDown: (ativa + 1) % total,
      ArrowLeft: (ativa - 1 + total) % total,
      ArrowUp: (ativa - 1 + total) % total,
      Home: 0,
      End: total - 1,
    };
    if (!(e.key in mapa)) return;
    e.preventDefault();
    irPara(mapa[e.key], { focar: true });
  };

  const step = steps[Math.min(ativa, total - 1)];
  const Titulo = tituloNivel;
  const painelId = `${base}-painel`;
  const abaId = (i) => `${base}-aba-${i}`;

  return (
    <div className="ajuda-player ajuda-player--texto">
      <p className="ajuda-modo-texto">
        <ListOrdered size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>{SELO_TEXTO}</span>
        <span aria-hidden="true" className="ajuda-modo-texto__sep">·</span>
        <span style={{ color: T.mute }}>{total === 1 ? '1 passo' : `${total} passos`}</span>
      </p>

      <div
        ref={painelEl}
        id={painelId}
        role="tabpanel"
        aria-labelledby={abaId(ativa)}
        tabIndex={0}
        className="ajuda-agora ajuda-painel"
        style={{ borderRadius: R.card }}
      >
        <p className="ajuda-agora__rotulo">Passo {ativa + 1} de {total}</p>
        {total > 1 && (
          // A trilha repete o "Passo N de M" em forma de caminho, e por isso
          // fica fora do leitor de tela.
          <div aria-hidden="true" className="ajuda-trilha">
            {steps.map((s, i) => (
              <span key={s.id ?? i} className={`ajuda-trilha__seg${i <= ativa ? ' is-feito' : ''}`} />
            ))}
          </div>
        )}
        <Titulo className="ajuda-agora__titulo" style={{ fontFamily: T.display, fontWeight: W.title }}>
          {step.title}
        </Titulo>
        <p className="ajuda-narrado ajuda-narrado--texto">{step.body}</p>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <Button variant="secondary" ref={anteriorEl} onClick={() => andarPeloBotao(-1)} disabled={ativa === 0} style={{ flex: '1 1 140px' }}>
            <ArrowLeft size={16} aria-hidden="true" /> Passo anterior
          </Button>
          <Button variant="primary" ref={proximoEl} onClick={() => andarPeloBotao(1)} disabled={ativa === total - 1} style={{ flex: '1 1 140px' }}>
            Próximo passo <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label="Passos do tutorial" aria-orientation="vertical" className="ajuda-passos">
        {steps.map((s, i) => {
          const on = i === ativa;
          return (
            <button
              key={s.id ?? i}
              ref={(el) => {
                abasEl.current[i] = el;
              }}
              id={abaId(i)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={painelId}
              tabIndex={on ? 0 : -1}
              className={`ajuda-passo${on ? ' is-on' : ''}${i < ativa ? ' is-feito' : ''}`}
              onClick={() => irPara(i)}
              onKeyDown={aoTeclar}
            >
              <span className="ajuda-passo__num" aria-hidden="true">{i + 1}</span>
              <span className="sr-only">{`Passo ${i + 1}: `}</span>
              <span className="ajuda-passo__titulo">{s.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
