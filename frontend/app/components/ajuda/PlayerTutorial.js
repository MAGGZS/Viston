'use client';
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Captions, ListOrdered, Search, X } from 'lucide-react';
import { SELO_TEXTO, formatarInicio, indiceDaAbaNoTempo, progressoDaAba } from '@/app/lib/ajuda';
import { falasCronometradas, indiceDaFala } from '@/app/lib/pacoteDoVideo';

/**
 * O player de um tutorial: o vídeo e a transcrição da narração, passo a passo.
 *
 * É o mesmo componente na Tela 3 do usuário e na pré-visualização do admin, e
 * isso é o requisito, não economia: o admin confere se cada passo cai no ponto
 * certo do vídeo, e só confere de verdade se o que ele vê é exatamente o que a
 * pessoa vai ver.
 *
 * Com vídeo, o formato é contínuo: uma narração só, e cada passo é um ponto
 * (`start_s`) dentro dela. Por isso não há abas nem "próximo passo", e sim a
 * transcrição inteira, que anda sozinha:
 * - o passo atual é o último com `start_s <= currentTime` (`indiceDaAbaNoTempo`);
 * - a linha de capítulos debaixo do vídeo tem um trecho por passo, e o trecho
 *   do passo atual enche conforme ele passa;
 * - abaixo (ou ao lado, com vídeo em pé), a transcrição: todas as falas do
 *   vídeo, agrupadas por passo, com a dita agora destacada e seguida pela
 *   rolagem. As falas saem da `legenda.vtt` (lidas da `<track>`); sem elas, de
 *   uma estimativa pelo tamanho do texto;
 * - clicar numa fala, num passo ou num trecho da linha leva o vídeo àquele ponto;
 * - a busca filtra as falas, e o botão de legenda liga e desliga a legenda
 *   desenhada sobre o vídeo.
 *
 * Sem vídeo (`video_url` nulo), o tutorial é o passo a passo em texto: todos os
 * passos à vista, no mesmo desenho de cartões, e escolher um o marca como atual.
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
    return <p style={{ color: 'var(--color-mute)', fontSize: 14 }}>Este tutorial ainda não tem passos.</p>;
  }

  const props = { feature, steps, total, ativa, setAtiva, passo, onPassoChange, tituloNivel };
  return temVideo ? (
    <PassoAPassoComVideo {...props} videoRef={videoRef} onUrlsVencidas={onUrlsVencidas} />
  ) : (
    <PassoAPassoEmTexto {...props} />
  );
}

/* ── Busca sem acento e sem caixa ─────────────────────────────────────────── */

const semAcento = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** O termo como a busca o compara: sem acento, sem caixa e com espaços simples. */
const termoDaBusca = (s) => semAcento(s).replace(/\s+/g, ' ').trim();

/**
 * O texto partido nos trechos que batem com o termo (`{ texto, bate }`), ou
 * `null` quando nada bate. A comparação é sem acento, mas o recorte volta ao
 * texto original: "camera" acha e realça "câmera" inteira.
 */
function partesDaBusca(texto, termo) {
  if (!termo) return null;
  const original = String(texto ?? '');
  let normal = '';
  const origem = [];
  for (let i = 0; i < original.length; i++) {
    const n = semAcento(original[i]);
    for (let j = 0; j < n.length; j++) {
      normal += n[j];
      origem.push(i);
    }
  }
  let achou = normal.indexOf(termo);
  if (achou < 0) return null;
  const partes = [];
  let desde = 0;
  while (achou >= 0) {
    const de = origem[achou];
    const ate = origem[achou + termo.length - 1] + 1;
    if (de > desde) partes.push({ texto: original.slice(desde, de), bate: false });
    partes.push({ texto: original.slice(de, ate), bate: true });
    desde = ate;
    achou = normal.indexOf(termo, achou + termo.length);
  }
  if (desde < original.length) partes.push({ texto: original.slice(desde), bate: false });
  return partes;
}

function Realce({ texto, termo }) {
  const partes = useMemo(() => partesDaBusca(texto, termo), [texto, termo]);
  if (!partes) return texto;
  return partes.map((p, i) =>
    p.bate ? (
      <mark key={i} className="ajuda-realce">
        {p.texto}
      </mark>
    ) : (
      p.texto
    )
  );
}

/** Liga (`showing`) ou esconde (`hidden`) a legenda desenhada sobre o vídeo; as falas continuam carregadas. */
function mostrarLegenda(trackElement, mostrar) {
  const track = trackElement?.track;
  if (track) track.mode = mostrar ? 'showing' : 'hidden';
}

const tempoCurto = (s) => formatarInicio(s).replace(/,\d$/, '');

/* ── Com vídeo: o vídeo e a transcrição que anda sozinha ──────────────────── */

/** Por quanto tempo a transcrição para de seguir a fala depois de a pessoa rolar ou buscar. */
const PAUSA_DO_SEGUIR_MS = 4000;

function PassoAPassoComVideo({ feature, steps, total, ativa, setAtiva, passo, onPassoChange, videoRef, onUrlsVencidas, tituloNivel }) {
  const base = useId();
  const [tempo, setTempo] = useState(() => (typeof steps[ativa]?.start_s === 'number' ? steps[ativa].start_s : 0));
  const [duracaoLida, setDuracaoLida] = useState(null);
  const [falasDaLegenda, setFalasDaLegenda] = useState(null);
  const [anuncio, setAnuncio] = useState('');
  // A orientação vem do próprio vídeo quando os metadados chegam; até lá, o
  // aparelho da gravação é o melhor palpite (celular grava em pé).
  const [emPe, setEmPe] = useState(feature?.device === 'MOBILE');
  const [legendaNoVideo, setLegendaNoVideo] = useState(true);
  const [busca, setBusca] = useState('');

  const videoEl = useRef(null);
  const trackEl = useRef(null);
  const listaEl = useRef(null);
  const seguirSoDepois = useRef(0);
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

  /** Clicar numa fala: o vídeo vai ao começo dela, e o passo dela vira o atual. */
  const irParaFala = (fala, indice) => {
    if (indice !== ativaRef.current) trocarPasso(indice);
    const video = videoEl.current;
    if (!video) return;
    buscar(video, fala.inicio);
    setTempo(fala.inicio);
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
    if (video?.videoWidth > 0 && video?.videoHeight > 0) setEmPe(video.videoWidth < video.videoHeight);
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

  // O botão de legenda manda no modo da `<track>`: `hidden` some com a legenda
  // do vídeo mas mantém as falas carregadas, e a transcrição continua.
  useEffect(() => {
    mostrarLegenda(trackEl.current, legendaNoVideo);
  }, [legendaNoVideo, feature?.captions_url]);

  // E o menu de legenda do próprio player do navegador manda no botão.
  useEffect(() => {
    const faixas = videoEl.current?.textTracks;
    if (!faixas?.addEventListener) return undefined;
    const aoMudar = () => {
      const track = trackEl.current?.track;
      if (track) setLegendaNoVideo(track.mode === 'showing');
    };
    faixas.addEventListener('change', aoMudar);
    return () => faixas.removeEventListener('change', aoMudar);
  }, [feature?.captions_url]);

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

  /**
   * As falas agrupadas por passo. Cada fala vai para o passo em que ela começa,
   * pela mesma conta que acha o passo atual: assim a fala acesa está sempre
   * debaixo do passo aceso. Um passo sem fala (sem tempo, ou sem texto na
   * legenda) mostra o próprio texto no lugar.
   */
  const grupos = useMemo(() => {
    const lista = steps.map((step, i) => ({ step, i, falas: [] }));
    (falas ?? []).forEach((f, k) => {
      if (!f.texto) return;
      lista[indiceDaAbaNoTempo(steps, f.inicio)]?.falas.push({ ...f, k });
    });
    return lista;
  }, [steps, falas]);

  const termo = termoDaBusca(busca);
  const visiveis = useMemo(() => {
    if (!termo) return grupos.map((g) => ({ ...g, mostrar: g.falas, corpo: g.falas.length === 0 }));
    const bate = (s) => semAcento(s).replace(/\s+/g, ' ').includes(termo);
    return grupos
      .map((g) => {
        const tituloBate = bate(g.step.title);
        const mostrar = tituloBate ? g.falas : g.falas.filter((f) => bate(f.texto));
        const corpo = g.falas.length === 0 && Boolean(g.step.body) && (tituloBate || bate(g.step.body));
        return { ...g, mostrar, corpo, achou: tituloBate || mostrar.length > 0 || corpo };
      })
      .filter((g) => g.achou);
  }, [grupos, termo]);

  const falaAtual = indiceDaFala(falas, tempo);
  const progresso = progressoDaAba(steps, ativa, tempo, duracao);

  /**
   * A transcrição segue a fala: quando a atual sai da área visível, a lista
   * rola até ela. Só a lista rola, nunca a página (por isso a conta à mão, e
   * não `scrollIntoView`, que rolaria a página junto). Enquanto há busca, ou
   * logo depois de a pessoa rolar, não segue: ela está lendo outra parte.
   */
  useEffect(() => {
    const lista = listaEl.current;
    if (!lista || termo || Date.now() < seguirSoDepois.current) return;
    const alvo = lista.querySelector('[data-fala-atual]') ?? lista.querySelector('[data-passo-atual]');
    if (!alvo) return;
    const caixa = lista.getBoundingClientRect();
    const r = alvo.getBoundingClientRect();
    if (caixa.height === 0) return;
    const folga = 48;
    if (r.top >= caixa.top + folga && r.bottom <= caixa.bottom - 12) return;
    const topo = Math.max(0, lista.scrollTop + (r.top - caixa.top) - Math.min(caixa.height * 0.3, 96));
    const reduzido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (typeof lista.scrollTo === 'function') lista.scrollTo({ top: topo, behavior: reduzido ? 'auto' : 'smooth' });
    else lista.scrollTop = topo;
  }, [falaAtual, ativa, termo]);

  const pausarSeguir = () => {
    seguirSoDepois.current = Date.now() + PAUSA_DO_SEGUIR_MS;
  };

  // Rolar a lista à mão (roda, dedo, teclado ou barra) pausa o seguir. Ouvintes
  // nativos e passivos: a rolagem não espera o React.
  const semResultado = visiveis.length === 0;
  useEffect(() => {
    const lista = listaEl.current;
    if (!lista) return undefined;
    const pausar = () => {
      seguirSoDepois.current = Date.now() + PAUSA_DO_SEGUIR_MS;
    };
    const aoTeclar = (e) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) pausar();
    };
    // `focusin`: quem anda pela lista com Tab está lendo ali; `pointerdown`:
    // arrastar a barra de rolagem não dispara `wheel` nem `touchmove`.
    const eventos = [
      ['wheel', pausar, { passive: true }],
      ['touchmove', pausar, { passive: true }],
      ['pointerdown', pausar, { passive: true }],
      ['focusin', pausar, undefined],
      ['keydown', aoTeclar, undefined],
    ];
    eventos.forEach(([nome, fn, opcoes]) => lista.addEventListener(nome, fn, opcoes));
    return () => eventos.forEach(([nome, fn]) => lista.removeEventListener(nome, fn));
  }, [semResultado]);

  // As falas e os cabeçalhos são memorizados (o `timeupdate` re-renderiza o
  // player umas quatro vezes por segundo); recebem ações estáveis, que leem a
  // versão atual de `irPara` e `irParaFala` por ref.
  const acoes = useRef({});
  useEffect(() => {
    acoes.current = { irPara, irParaFala };
  });
  const aoIrPasso = useCallback((indice) => acoes.current.irPara?.(indice), []);
  const aoIrFala = useCallback((fala, indice) => acoes.current.irParaFala?.(fala, indice), []);

  const achados = termo ? visiveis.reduce((n, g) => n + g.mostrar.length + (g.corpo ? 1 : 0), 0) : 0;

  const limparBusca = () => {
    setBusca('');
    pausarSeguir();
  };

  const Titulo = tituloNivel;
  const buscaId = `${base}-busca`;
  const temLegenda = Boolean(feature.captions_url);

  return (
    <div className="ajuda-player ajuda-player--video" data-orientacao={emPe ? 'em-pe' : 'deitado'}>
      <div className="ajuda-player__grade">
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
            {temLegenda && (
              <track ref={trackEl} kind="captions" srcLang="pt-BR" label="Português" src={feature.captions_url} default onLoad={lerFalas} />
            )}
          </video>
        </div>

        <LinhaDeCapitulos steps={steps} ativa={ativa} progresso={progresso} duracao={duracao} onIr={irPara} />

        <section className="ajuda-roteiro" aria-label="Transcrição do vídeo">
          <div className="ajuda-roteiro__barra">
            {temLegenda && (
              <button
                type="button"
                className="ajuda-roteiro__legenda"
                aria-pressed={legendaNoVideo}
                title={legendaNoVideo ? 'Esconder a legenda do vídeo' : 'Mostrar a legenda no vídeo'}
                onClick={() => setLegendaNoVideo((v) => !v)}
              >
                <Captions size={20} aria-hidden="true" />
                <span className="sr-only">Legenda no vídeo</span>
              </button>
            )}
            <div className="ajuda-roteiro__campo">
              <Search size={17} aria-hidden="true" className="ajuda-roteiro__lupa" />
              <label htmlFor={buscaId} className="sr-only">
                Buscar na legenda
              </label>
              <input
                id={buscaId}
                type="search"
                className="ajuda-busca ajuda-busca--legenda"
                placeholder="Buscar na legenda"
                autoComplete="off"
                spellCheck={false}
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  pausarSeguir();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && busca) {
                    e.preventDefault();
                    e.stopPropagation();
                    limparBusca();
                  }
                }}
              />
              {busca && (
                <button type="button" className="ajuda-roteiro__limpar" aria-label="Limpar a busca na legenda" onClick={limparBusca}>
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <p className="sr-only" role="status">
            {termo
              ? achados === 0
                ? 'Nenhum trecho encontrado.'
                : achados === 1
                  ? '1 trecho encontrado.'
                  : `${achados} trechos encontrados.`
              : ''}
          </p>

          {semResultado ? (
            <p className="ajuda-roteiro__vazio">
              Nenhum trecho encontrado para “{busca.trim()}”.
              <button type="button" onClick={limparBusca}>
                Limpar a busca
              </button>
            </p>
          ) : (
            <ol
              ref={listaEl}
              className="ajuda-roteiro__lista"
              aria-label="Passos do tutorial"
            >
              {visiveis.map(({ step: s, i, mostrar, corpo }) => {
                const on = i === ativa;
                return (
                  <li key={s.id ?? i} className={`ajuda-roteiro__grupo${on ? ' is-on' : ''}`}>
                    <Titulo className="ajuda-roteiro__passo" data-passo-atual={on ? '' : undefined}>
                      <CabecaDoPasso
                        indice={i}
                        titulo={s.title}
                        inicio={s.start_s}
                        on={on}
                        feito={i < ativa}
                        termo={termo}
                        onIr={aoIrPasso}
                      />
                    </Titulo>
                    {mostrar.length > 0 && (
                      <ol className="ajuda-deixas">
                        {mostrar.map((f) => {
                          const estado =
                            f.k === falaAtual ? 'agora' : f.k < falaAtual ? (f.k === falaAtual - 1 ? 'antes' : 'dita') : 'vem';
                          // Só a fala atual recebe um `andou` que muda com o tempo; as
                          // outras, um valor fixo, e por isso não re-renderizam.
                          const andou =
                            estado === 'agora'
                              ? Math.min(1, Math.max(0, (tempo - f.inicio) / Math.max(0.001, f.fim - f.inicio)))
                              : estado === 'vem'
                                ? 0
                                : 1;
                          return (
                            <Fala key={`${f.inicio}-${f.k}`} fala={f} passo={i} estado={estado} andou={andou} termo={termo} onIr={aoIrFala} />
                          );
                        })}
                      </ol>
                    )}
                    {corpo && s.body && (
                      <p className="ajuda-deixa ajuda-deixa--corpo">
                        <Realce texto={s.body} termo={termo} />
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
    </div>
  );
}

/** Uma fala da transcrição. Memorizada: só re-renderiza quando o estado dela muda. */
const Fala = memo(function Fala({ fala, passo, estado, andou, termo, onIr }) {
  return (
    <li data-fala-atual={estado === 'agora' ? '' : undefined}>
      <button
        type="button"
        className={`ajuda-deixa is-${estado}`}
        aria-current={estado === 'agora' ? 'true' : undefined}
        onClick={() => onIr(fala, passo)}
      >
        <span className="ajuda-deixa__tempo">{tempoCurto(fala.inicio)}</span>
        {/* O invólucro é o item da grade; a fala fica em linha dentro dele, e o
            marca-texto acompanha as quebras de linha em vez de pintar um bloco. */}
        <span className="ajuda-deixa__texto">
          <span className={`ajuda-fala ajuda-fala--${estado}`} style={{ '--andou': andou }}>
            <Realce texto={fala.texto} termo={termo} />
          </span>
        </span>
      </button>
    </li>
  );
});

/** O cabeçalho de um passo na transcrição (e o cartão no modo texto): número, título e início. */
const CabecaDoPasso = memo(function CabecaDoPasso({ indice, titulo, inicio, on, feito, termo, onIr }) {
  return (
    <button
      type="button"
      className={`ajuda-cabeca${on ? ' is-on' : ''}${feito ? ' is-feito' : ''}`}
      aria-current={on ? 'step' : undefined}
      onClick={() => onIr(indice)}
    >
      <span className="ajuda-cabeca__num" aria-hidden="true">
        {indice + 1}
      </span>
      <span className="sr-only">{`Passo ${indice + 1}: `}</span>
      <span className="ajuda-cabeca__titulo">
        <Realce texto={titulo} termo={termo} />
      </span>
      {typeof inicio === 'number' && (
        <span className="ajuda-cabeca__tempo">
          <span className="sr-only">, começa em </span>
          {tempoCurto(inicio)}
        </span>
      )}
    </button>
  );
});

/**
 * A linha de capítulos: um trecho por passo, do tamanho dele no vídeo.
 *
 * Os trechos já passados ficam cheios, o atual enche com o tempo, e os
 * próximos ficam vazios. As frestas entre os trechos são as marcas dos
 * capítulos. É um atalho de ponteiro (clicar leva ao capítulo) e uma leitura
 * visual: fica fora do leitor de tela e do Tab, porque os passos da
 * transcrição já dão o mesmo caminho, com nome.
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

/* ── Sem vídeo: todos os passos em texto ──────────────────────────────────── */

function PassoAPassoEmTexto({ steps, total, ativa, setAtiva, onPassoChange, tituloNivel }) {
  const escolher = (indice) => {
    if (indice < 0 || indice >= total) return;
    setAtiva(indice);
    onPassoChange?.(indice);
  };

  const Titulo = tituloNivel;

  return (
    <div className="ajuda-player ajuda-player--texto">
      <p className="ajuda-modo-texto">
        <ListOrdered size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>{SELO_TEXTO}</span>
        <span aria-hidden="true" className="ajuda-modo-texto__sep">·</span>
        <span style={{ color: 'var(--color-mute)' }}>{total === 1 ? '1 passo' : `${total} passos`}</span>
      </p>

      <ol className="ajuda-roteiro ajuda-roteiro--texto" aria-label="Passos do tutorial">
        {steps.map((s, i) => {
          const on = i === ativa;
          return (
            <li key={s.id ?? i} className={`ajuda-cartao-passo${on ? ' is-on' : ''}`}>
              <Titulo className="ajuda-roteiro__passo">
                <CabecaDoPasso indice={i} titulo={s.title} on={on} feito={i < ativa} onIr={escolher} />
              </Titulo>
              {s.body && <p className="ajuda-narrado ajuda-narrado--texto">{s.body}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
