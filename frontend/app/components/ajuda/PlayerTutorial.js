'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ListOrdered } from 'lucide-react';
import { Button } from '@/app/components/ui';
import { SELO_TEXTO, indiceDaAbaNoTempo, progressoDaAba } from '@/app/lib/ajuda';
import { T, R, W } from '@/app/lib/theme';

/**
 * O player de um tutorial: o vídeo, uma aba por passo e o texto do passo.
 *
 * É o mesmo componente na Tela 3 do usuário e na pré-visualização do admin, e
 * isso é o requisito, não economia: o admin confere se cada aba cai no ponto
 * certo do vídeo, e só confere de verdade se o que ele vê é exatamente o que a
 * pessoa vai ver. Duas versões do player bastariam para a pré-visualização
 * passar e a tela do usuário errar.
 *
 * O vídeo e as abas andam juntos nos dois sentidos:
 * - clicar numa aba leva o vídeo ao `start_s` dela;
 * - durante a reprodução, a aba ativa é a última com `start_s <= currentTime`
 *   (ver `indiceDaAbaNoTempo`), recalculada a cada `timeupdate`.
 *
 * As abas seguem o padrão WAI-ARIA de tablist com ativação automática: a seta
 * move o foco e já troca o passo, Home e End vão às pontas. A ativação é
 * automática porque trocar de aba é barato (o texto já está carregado e o
 * vídeo só muda de posição), e é o que o padrão recomenda nesse caso.
 *
 * Aba sem `start_s` (tempo apagado pelo admin) continua funcionando só com o
 * texto: o clique troca o painel e deixa o vídeo onde está.
 *
 * Tutorial sem vídeo (`video_url` nulo) é tutorial completo, e não tela
 * quebrada: desde 2026-10-10 ele vai ao ar só com os passos em texto, e o
 * vídeo, quando chegar, aparece no topo (ver tutoriais/API.md). Nesse modo não
 * há `<video>`, nem `<track>`, nem fio de progresso, nem espaço guardado para um
 * palco que não vem: o selo "Passo a passo em texto" abre a tela, as abas e os
 * botões andam pelos passos, e trocar de aba só troca o texto. A trilha de
 * segmentos no painel faz o papel que o vídeo fazia, o de mostrar quanto do
 * caminho já foi.
 *
 * `passo` é o índice pedido de fora, que vem do `?passo=N` da URL. Mudou (um
 * resultado de busca para outra aba do mesmo tutorial, por exemplo), o player
 * vai até lá. `onPassoChange` avisa cada troca, para a página manter a URL em
 * dia. `videoRef` dá ao admin o `<video>`, de onde sai o "Usar o tempo atual".
 */
export function PlayerTutorial({ feature, passo = 0, onPassoChange, videoRef, onUrlsVencidas, tituloNivel = 'h2' }) {
  const steps = useMemo(() => feature?.steps ?? [], [feature?.steps]);
  const total = steps.length;
  const temVideo = Boolean(feature?.video_url);
  const base = useId();

  const [ativa, setAtiva] = useState(() => Math.min(passo, Math.max(total - 1, 0)));
  const [progresso, setProgresso] = useState(0);

  // O passo pedido de fora. Ajustado no próprio render, e não num efeito, pelo
  // mesmo motivo do resto do projeto (react-hooks/set-state-in-effect): num
  // efeito, a aba velha chegaria a aparecer por um quadro.
  const [pedidoVisto, setPedidoVisto] = useState(passo);
  if (passo !== pedidoVisto) {
    setPedidoVisto(passo);
    if (passo >= 0 && passo < total) setAtiva(passo);
  }

  const videoEl = useRef(null);
  const listaEl = useRef(null);
  const abasEl = useRef([]);
  // Enquanto um seek pedido pela aba não termina, o `timeupdate` ainda informa
  // o tempo antigo, e devolveria a aba ativa para onde ela estava: a aba
  // piscaria de volta antes de o vídeo chegar.
  const buscando = useRef(false);
  const ativaRef = useRef(ativa);
  // O último passo que o próprio player avisou para fora. A página escreve esse
  // passo na URL, a URL volta como `passo`, e sem esta marca o player trataria
  // o eco como um pedido novo: levaria o vídeo de volta ao começo do capítulo a
  // cada troca durante a reprodução, um tranco a cada passo.
  const avisado = useRef(null);
  // Os botões do painel. Na ponta, o botão clicado fica desabilitado e o foco
  // cairia no `body`: quem navega pelo teclado perderia o lugar.
  const anteriorEl = useRef(null);
  const proximoEl = useRef(null);
  const painelEl = useRef(null);
  useEffect(() => {
    ativaRef.current = ativa;
  }, [ativa]);

  const ligarVideo = useCallback(
    (el) => {
      videoEl.current = el;
      if (videoRef) videoRef.current = el;
    },
    [videoRef]
  );

  /**
   * Põe o vídeo num tempo e marca a busca em andamento.
   *
   * A marca só vale com os metadados já carregados (`readyState >= 1`). Antes
   * disso o navegador guarda o tempo pedido e não dispara `seeked`, e a marca
   * ficaria presa: o `timeupdate` seria ignorado para sempre e as abas parariam
   * de acompanhar a reprodução. Sem metadados, o `onLoadedMetadata` refaz a ida.
   */
  const buscar = useCallback((video, inicio) => {
    const pronto = video.readyState >= 1;
    buscando.current = pronto;
    try {
      video.currentTime = inicio;
    } catch {
      // Alguns navegadores recusam o seek antes do `loadedmetadata`.
      buscando.current = false;
    }
  }, []);

  /** Leva o vídeo ao começo de uma aba, quando ela tem tempo. */
  const levarVideo = useCallback(
    (indice) => {
      const video = videoEl.current;
      const inicio = steps[indice]?.start_s;
      if (!video || typeof inicio !== 'number') return;
      buscar(video, inicio);
    },
    [steps, buscar]
  );

  // O passo pedido pela URL também move o vídeo. Isto é efeito de verdade
  // (mexe no elemento de mídia), e não estado: por isso mora num efeito.
  //
  // A dependência é o tempo do passo pedido, e não a lista de passos inteira:
  // cada releitura da funcionalidade traz uma lista nova, e o vídeo voltaria ao
  // passo da URL no meio da reprodução sem ninguém ter pedido.
  const inicioPedido = steps[passo]?.start_s;
  useEffect(() => {
    const video = videoEl.current;
    if (!video || passo < 0 || typeof inicioPedido !== 'number') return;
    if (passo === avisado.current) return;
    buscar(video, inicioPedido);
  }, [passo, inicioPedido, buscar]);

  const irPara = (indice, { focar = false } = {}) => {
    if (indice < 0 || indice >= total) return;
    setAtiva(indice);
    setProgresso(0);
    avisado.current = indice;
    onPassoChange?.(indice);
    levarVideo(indice);
    if (focar) abasEl.current[indice]?.focus();
  };

  /**
   * A aba ativa sempre à vista, no telefone.
   *
   * As abas rolam na horizontal, e a reprodução avança sozinha de uma para a
   * outra: sem isto, a aba acesa sairia pela direita e a pessoa perderia de
   * vista em que passo está. A rolagem é da lista, e não `scrollIntoView`: este
   * último rola também a página na vertical, e puxaria a tela para cima toda
   * vez que o vídeo trocasse de capítulo.
   */
  useEffect(() => {
    const lista = listaEl.current;
    const aba = abasEl.current[ativa];
    if (!lista || !aba) return;
    const folga = 16;
    let destino = null;
    if (aba.offsetLeft - folga < lista.scrollLeft) destino = aba.offsetLeft - folga;
    else if (aba.offsetLeft + aba.offsetWidth + folga > lista.scrollLeft + lista.clientWidth) {
      destino = aba.offsetLeft + aba.offsetWidth + folga - lista.clientWidth;
    }
    if (destino === null) return;
    const reduzir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (typeof lista.scrollTo === 'function') lista.scrollTo({ left: Math.max(0, destino), behavior: reduzir ? 'auto' : 'smooth' });
    else lista.scrollLeft = Math.max(0, destino);
  }, [ativa]);

  /**
   * Marca de que lado há aba escondida, para o fade aparecer só ali.
   *
   * Direto no atributo, e não em estado: a rolagem dispara dezenas de vezes por
   * segundo, e um render a cada uma só para trocar uma máscara de CSS seria
   * trabalho jogado fora. Mede na montagem, a cada rolagem e quando a largura
   * muda (girar o telefone, redimensionar a janela).
   */
  useEffect(() => {
    const lista = listaEl.current;
    if (!lista) return undefined;
    const medir = () => {
      const esq = lista.scrollLeft > 1;
      const dir = lista.scrollLeft + lista.clientWidth < lista.scrollWidth - 1;
      const sobra = esq && dir ? 'ambos' : esq ? 'esq' : dir ? 'dir' : '';
      if (sobra) lista.dataset.sobra = sobra;
      else delete lista.dataset.sobra;
    };
    medir();
    lista.addEventListener('scroll', medir, { passive: true });
    let observador = null;
    if (typeof ResizeObserver === 'function') {
      observador = new ResizeObserver(medir);
      observador.observe(lista);
    } else {
      window.addEventListener('resize', medir);
    }
    return () => {
      lista.removeEventListener('scroll', medir);
      if (observador) observador.disconnect();
      else window.removeEventListener('resize', medir);
    };
  }, [total]);

  const aoAndar = () => {
    const video = videoEl.current;
    if (!video || buscando.current) return;
    const t = video.currentTime;
    const indice = indiceDaAbaNoTempo(steps, t);
    if (indice !== ativaRef.current) {
      setAtiva(indice);
      avisado.current = indice;
      onPassoChange?.(indice);
    }
    setProgresso(progressoDaAba(steps, indice, t, video.duration || feature?.duration_s));
  };

  const aoTerminarBusca = () => {
    buscando.current = false;
    aoAndar();
  };

  /**
   * A URL assinada venceu com a tela aberta.
   *
   * Ela vale quatro horas, e uma aba esquecida aberta passa disso. O contrato
   * pede para buscar a funcionalidade de novo e trocar as URLs; quem busca é a
   * página, que é dona da consulta. Só depois do vencimento: um erro de rede
   * comum com a URL ainda válida não se resolve pedindo outra.
   */
  const aoFalhar = () => {
    const vence = feature?.urls_expire_at ? Date.parse(feature.urls_expire_at) : NaN;
    if (Number.isFinite(vence) && Date.now() >= vence - 60 * 1000) onUrlsVencidas?.();
  };

  const aoCarregar = () => {
    if (ativaRef.current > 0) levarVideo(ativaRef.current);
    else buscando.current = false;
  };

  /**
   * Os botões "Passo anterior" e "Próximo passo".
   *
   * Chegando à ponta, o botão clicado vira `disabled` e perde o foco. O foco
   * vai para o botão do outro lado, que é o próximo gesto provável; com um
   * passo só (os dois desabilitados), vai para o painel.
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

  if (total === 0) {
    return (
      <p style={{ color: T.mute, fontSize: 14 }}>Este tutorial ainda não tem passos.</p>
    );
  }

  const step = steps[Math.min(ativa, total - 1)];
  const Titulo = tituloNivel;
  const painelId = `${base}-painel`;
  const abaId = (i) => `${base}-aba-${i}`;

  return (
    <div className="ajuda-player" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {temVideo ? (
        <div className="ajuda-palco" data-dispositivo={feature?.device === 'MOBILE' ? 'celular' : 'computador'}>
          {/*
            `crossOrigin="anonymous"`: a legenda mora no Storage, outro domínio,
            e sem ele o navegador baixa a `<track>` mas se recusa a usá-la.

            `preload="metadata"` baixa só o começo (duração e dimensões): quem
            abre o tutorial para ler o texto de um passo não paga o vídeo
            inteiro.

            A `<track>` só entra com a legenda em mãos: uma `<track>` sem `src`
            é legenda nenhuma, e ainda gera um pedido inválido. O pacote sempre
            traz a legenda (ver EnvioDoPacote), então na prática ela está lá;
            a regra do lint não enxerga a condição.
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
              <track kind="captions" srcLang="pt-BR" label="Português" src={feature.captions_url} default />
            )}
          </video>
        </div>
      ) : (
        <p className="ajuda-modo-texto">
          <ListOrdered size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>{SELO_TEXTO}</span>
          <span aria-hidden="true" className="ajuda-modo-texto__sep">·</span>
          <span style={{ color: T.mute }}>{total === 1 ? '1 passo' : `${total} passos`}</span>
        </p>
      )}

      {/* As abas. A lista rola na horizontal quando não cabe, e o fade das
          pontas (ver `.ajuda-abas` no globals.css) é o que avisa que há mais
          passos para o lado. */}
      <div
        ref={listaEl}
        role="tablist"
        aria-label="Passos do tutorial"
        aria-orientation="horizontal"
        className="ajuda-abas"
      >
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
              className={`ajuda-aba${on ? ' is-on' : ''}`}
              onClick={() => irPara(i)}
              onKeyDown={aoTeclar}
            >
              <span className="ajuda-aba__num" aria-hidden="true">{i + 1}.</span>
              <span className="sr-only">{`Passo ${i + 1}: `}</span>
              {s.title}
              {on && temVideo && typeof s.start_s === 'number' && (
                <span
                  aria-hidden="true"
                  className="ajuda-aba__fio"
                  style={{ transform: `scaleX(${progresso})` }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        ref={painelEl}
        id={painelId}
        role="tabpanel"
        aria-labelledby={abaId(ativa)}
        tabIndex={0}
        className="ajuda-painel"
        style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: '18px 18px 16px' }}
      >
        <p style={{ color: T.mute, fontSize: 12, letterSpacing: '0.02em' }}>
          Passo {ativa + 1} de {total}
        </p>
        {!temVideo && total > 1 && (
          // A trilha repete o "Passo N de M" em forma de caminho, e por isso
          // fica fora do leitor de tela: ele já leu a frase acima.
          <div aria-hidden="true" className="ajuda-trilha">
            {steps.map((s, i) => (
              <span key={s.id ?? i} className={`ajuda-trilha__seg${i <= ativa ? ' is-feito' : ''}`} />
            ))}
          </div>
        )}
        <Titulo style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 17, color: T.text, marginTop: 4, lineHeight: 1.3 }}>
          {step.title}
        </Titulo>
        <p style={{ color: T.text, fontSize: 15, lineHeight: 1.65, marginTop: 10, whiteSpace: 'pre-line' }}>
          {step.body}
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            ref={anteriorEl}
            onClick={() => andarPeloBotao(-1)}
            disabled={ativa === 0}
            style={{ flex: '1 1 140px' }}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Passo anterior
          </Button>
          <Button
            variant="primary"
            ref={proximoEl}
            onClick={() => andarPeloBotao(1)}
            disabled={ativa === total - 1}
            style={{ flex: '1 1 140px' }}
          >
            Próximo passo <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
