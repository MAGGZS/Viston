'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronRight, Eraser, Eye, EyeOff, ListChecks, Monitor, Pencil, RefreshCw, Smartphone, X } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { IconeDaPasta } from '@/app/components/ajuda/IconeDaPasta';
import { Badge, Button, Modal, Skeleton, Toggle } from '@/app/components/ui';
import { CONTENT_ID } from '@/app/components/mobile/kit';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { EditarItemModal } from '@/app/components/ajuda/EditarItemModal';
import { SelosDoTutorial } from '@/app/components/ajuda/SelosDoTutorial';
import {
  useHelpSync,
  useHelpTree,
  usePublishHelpFeaturesBatch,
  useReorderHelpFeatures,
  useReorderHelpFolders,
} from '@/app/hooks/useAjuda';
import {
  FILTRO_DESPUBLICADOS,
  contagensDaArvore,
  formatarDuracao,
  moverNaOrdem,
  opcoesDoFiltro,
  passaNoFiltro,
} from '@/app/lib/ajuda';
import { avisarErro, mensagemDoErro } from '@/app/lib/erros';
import { useToastStore } from '@/app/store/toast';
import { T, R, W, NUM } from '@/app/lib/theme';

/**
 * Tutoriais, tela 1 do admin: a árvore da central inteira.
 *
 * Pastas com as funcionalidades dentro, cada uma com dois selos: se está no ar
 * (publicada ou não) e como está o vídeo (sem vídeo, em dia, desatualizado).
 * As contagens no topo, numa fileira só, são também o filtro: o trabalho do
 * admin aqui é achar o que falta gravar ou o que ficou desatualizado, e um
 * clique no número leva só àquilo. Um filtro de cada vez. "Despublicados"
 * entra na mesma fileira só quando há algum fora do ar.
 *
 * Na mesma fileira, à direita, "Selecionar" liga o modo de seleção: cada
 * funcionalidade e cada pasta ganham uma caixa de marcar, e uma barra que
 * flutua no rodapé publica ou despublica as marcadas de uma vez (ver
 * `BarraDaSelecao`).
 *
 * O que entra e sai da árvore é o roteiro (tutoriais/roteiros.md), levado ao
 * banco pelo seed. Daqui não se cria nem apaga nada: só se ordena, se ajusta
 * título e resumo, e se abre a funcionalidade para enviar o vídeo.
 */
export default function TutoriaisAdminPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useHelpTree();
  const [filtroEscolhido, setFiltro] = useState('TODOS');
  const [sincronizando, setSincronizando] = useState(false);
  const [selecionando, setSelecionando] = useState(false);
  const [marcados, setMarcados] = useState(() => new Set());
  const selecionarEl = useRef(null);
  const arvoreEl = useRef(null);
  const mainEl = useRef(null);
  // Quem pediu a saída do modo: o foco só volta ao "Selecionar" quando a saída
  // foi um gesto (Cancelar, Escape, o próprio botão, ou o fim de um lote).
  const devolverFoco = useRef(false);

  const folders = data?.folders ?? [];
  const opcoes = opcoesDoFiltro(contagensDaArvore(data));
  // O chip de despublicados some quando o último volta ao ar; o filtro que
  // apontava para ele volta a "Todos" em vez de deixar a árvore vazia sem
  // nenhum botão marcado.
  const filtro = opcoes.some((o) => o.id === filtroEscolhido) ? filtroEscolhido : 'TODOS';

  // A seleção vale só para o que está à vista: trocar o filtro com algo
  // marcado não pode fazer o lote mexer em tutoriais que o admin não vê.
  const visiveis = folders.flatMap((f) => f.features).filter((f) => passaNoFiltro(f, filtro));
  const escolhidos = visiveis.filter((f) => marcados.has(f.id)).map((f) => f.id);

  const entrar = () => {
    setMarcados(new Set());
    setSelecionando(true);
  };
  const sair = () => {
    devolverFoco.current = true;
    setSelecionando(false);
    setMarcados(new Set());
  };
  const alternar = (id) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  /** Marca ou desmarca vários de uma vez: a caixa da pasta. */
  const marcarVarios = (ids, marcar) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => (marcar ? novo.add(id) : novo.delete(id)));
      return novo;
    });

  // Entrar leva o foco à primeira caixa; sair devolve ao "Selecionar".
  useEffect(() => {
    if (selecionando) {
      arvoreEl.current?.querySelector('input[type="checkbox"]')?.focus();
    } else if (devolverFoco.current) {
      devolverFoco.current = false;
      selecionarEl.current?.focus();
    }
  }, [selecionando]);

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-page">
        <AdminSidebar />
        <main
          ref={mainEl}
          id={CONTENT_ID}
          className="flex-1 px-6 py-8 overflow-auto"
          // Com a barra da seleção flutuando no rodapé, a última pasta ganha
          // folga para não ficar escondida embaixo dela.
          style={{ minWidth: 0, paddingBottom: selecionando ? 120 : undefined }}
        >
          <div className="anim-fade-down flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-ink">Tutoriais</h1>
              <p className="text-mute text-sm mt-0.5" style={{ maxWidth: 640 }}>
                As pastas e funcionalidades da central de ajuda. Abra uma funcionalidade para enviar o vídeo,
                ajustar as abas e publicar ou despublicar.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setSincronizando(true)} style={{ flexShrink: 0 }}>
              <RefreshCw size={15} aria-hidden="true" /> Sincronizar catálogo
            </Button>
          </div>

          {isLoading ? (
            <div aria-busy="true" aria-label="Carregando os tutoriais" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Skeleton style={{ height: 44, width: 520 }} />
              {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 160, borderRadius: R.card }} />)}
            </div>
          ) : isError ? (
            <Caixa>
              <p style={{ color: T.text, fontWeight: W.title }}>Não deu para carregar os tutoriais.</p>
              <p style={{ color: T.mute, fontSize: 14, marginTop: 4 }}>{mensagemDoErro(error)}</p>
              <Button variant="secondary" onClick={() => refetch()} loading={isFetching} style={{ marginTop: 14 }}>
                Tentar de novo
              </Button>
            </Caixa>
          ) : folders.length === 0 ? (
            <Caixa>
              <p style={{ color: T.text, fontWeight: W.title }}>A central ainda está vazia no banco.</p>
              <p style={{ color: T.mute, fontSize: 14, marginTop: 4, lineHeight: 1.6 }}>
                O catálogo do roteiro ainda não foi levado para cá. Sincronize para criar as pastas, as
                funcionalidades e as abas. As funcionalidades novas nascem publicadas, com os passos em
                texto, e o vídeo entra depois.
              </p>
              <Button onClick={() => setSincronizando(true)} style={{ marginTop: 14 }}>
                <RefreshCw size={15} aria-hidden="true" /> Sincronizar catálogo
              </Button>
            </Caixa>
          ) : (
            <>
              <div className="anim-fade-up flex flex-wrap items-center justify-between gap-3 mb-6" style={{ maxWidth: 1080 }}>
                <FiltroDeContagem opcoes={opcoes} valor={filtro} onChange={setFiltro} />
                <Button
                  ref={selecionarEl}
                  variant="secondary"
                  aria-pressed={selecionando}
                  onClick={selecionando ? sair : entrar}
                  style={{ flexShrink: 0, ...(selecionando ? { background: T.accentSoft, color: T.accentInk } : null) }}
                >
                  <ListChecks size={16} aria-hidden="true" /> Selecionar
                </Button>
              </div>
              <div ref={arvoreEl}>
                <Arvore
                  folders={folders}
                  filtro={filtro}
                  selecao={selecionando ? { marcados, alternar, marcarVarios } : null}
                />
              </div>
              {selecionando && (
                <BarraDaSelecao
                  areaRef={mainEl}
                  escolhidos={escolhidos}
                  visiveis={visiveis}
                  onTodos={() => marcarVarios(visiveis.map((f) => f.id), true)}
                  onLimpar={() => setMarcados(new Set())}
                  onSair={sair}
                />
              )}
            </>
          )}
        </main>
      </div>

      <SincronizarModal open={sincronizando} onClose={() => setSincronizando(false)} />
    </RouteGuard>
  );
}

function Caixa({ children }) {
  return (
    <div style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: 20, maxWidth: 640 }}>
      {children}
    </div>
  );
}

/**
 * O filtro: um controle segmentado, uma pílula só com um segmento por corte.
 *
 * Botões de alternância (`aria-pressed`), e não abas: o que muda é o que a
 * árvore mostra, e a árvore continua sendo a mesma região da tela. Contagem
 * zero continua clicável e mostra zero: esconder o "Desatualizado 0" tiraria do
 * admin justamente a confirmação de que não há nada desatualizado. A exceção é
 * "Despublicados", que só existe quando há algum (ver `opcoesDoFiltro`), e vem
 * depois de um fio, porque corta pela publicação e não pelo vídeo.
 *
 * O realce do segmento ligado é uma peça só, que desliza por `transform` de um
 * segmento ao outro. Ela é medida depois da pintura; até lá (e no teste, onde
 * nada tem tamanho) quem pinta o fundo é o próprio segmento ligado, então a
 * pílula nunca aparece sem nada aceso.
 */
function FiltroDeContagem({ opcoes, valor, onChange }) {
  const grupoEl = useRef(null);
  const [realce, setRealce] = useState(null);
  const [animado, setAnimado] = useState(false);
  const numeros = opcoes.map((o) => `${o.id}:${o.n}`).join();

  useLayoutEffect(() => {
    const grupo = grupoEl.current;
    if (!grupo) return undefined;
    const medir = () => {
      const ligado = grupo.querySelector('[aria-pressed="true"]');
      setRealce(ligado && ligado.offsetWidth ? { x: ligado.offsetLeft, w: ligado.offsetWidth } : null);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(medir);
    observador.observe(grupo);
    return () => observador.disconnect();
  }, [valor, numeros]);

  // A primeira posição entra parada; só as trocas seguintes deslizam.
  useEffect(() => {
    if (!realce || animado) return undefined;
    const quadro = requestAnimationFrame(() => setAnimado(true));
    return () => cancelAnimationFrame(quadro);
  }, [realce, animado]);

  return (
    <div
      ref={grupoEl}
      role="group"
      aria-label="Filtrar tutoriais"
      className={`filtro-seg${realce ? ' is-medido' : ''}${animado ? ' is-animado' : ''}`}
    >
      {realce && (
        <span
          aria-hidden="true"
          className="filtro-seg__realce"
          style={{ width: realce.w, transform: `translateX(${realce.x}px)` }}
        />
      )}
      {opcoes.map((o) => {
        const on = o.id === valor;
        return (
          <span key={o.id} style={{ display: 'contents' }}>
            {o.id === FILTRO_DESPUBLICADOS && <span aria-hidden="true" className="filtro-seg__fio" />}
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.id)}
              className={`filtro-seg__btn${on ? ' is-on' : ''}`}
            >
              {o.label}
              <span className={`filtro-seg__n${o.alerta && o.n > 0 ? ' is-alerta' : ''}`}>{o.n}</span>
            </button>
          </span>
        );
      })}
    </div>
  );
}

/**
 * A caixa de marcar do produto: o `<input>` nativo continua lá, invisível e
 * cobrindo a área de 44 px, e é ele que recebe clique, teclado e leitor de
 * tela. Por cima, só o desenho: a caixa, o visto que se traça em 160 ms e o
 * traço do meio-marcado. O estado meio-marcado só existe por propriedade do
 * DOM (não há atributo), por isso o efeito.
 */
function CaixaDeMarcar({ checked, indeterminate = false, onChange, ...aria }) {
  const el = useRef(null);
  useEffect(() => {
    if (el.current) el.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <span className="marcar">
      <input ref={el} type="checkbox" className="marcar__input" checked={checked} onChange={onChange} {...aria} />
      <span className="marcar__caixa" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path className="marcar__visto" d="M3 8.5l3.2 3.2L13 4.8" />
          <path className="marcar__traco" d="M4 8h8" />
        </svg>
      </span>
    </span>
  );
}

function Arvore({ folders, filtro, selecao }) {
  const reordenarPastas = useReorderHelpFolders();
  const { show: toast } = useToastStore();
  const [editando, setEditando] = useState(null);
  const filtrando = filtro !== 'TODOS';
  const podeMover = !filtrando && !selecao;

  const moverPasta = async (indice, direcao) => {
    const ids = moverNaOrdem(folders, indice, direcao);
    if (!ids) return;
    try {
      await reordenarPastas.mutateAsync(ids);
    } catch (e) {
      avisarErro(toast, e, 'Não foi possível reordenar as pastas.');
    }
  };

  const visiveis = folders
    .map((f, indice) => ({ folder: f, indice, features: filtrando ? f.features.filter((x) => passaNoFiltro(x, filtro)) : f.features }))
    .filter((x) => !filtrando || x.features.length > 0);

  return (
    <>
      {filtrando && visiveis.length === 0 ? (
        <p className="text-mute text-sm mb-4">Nenhuma funcionalidade com este filtro.</p>
      ) : selecao ? (
        <p className="text-mute text-sm mb-4">Durante a seleção, a ordem fica travada: saia da seleção para mover pastas e funcionalidades.</p>
      ) : filtrando ? (
        <p className="text-mute text-sm mb-4">Com um filtro ligado, a ordem fica travada: volte para &quot;Todos&quot; para mover pastas e funcionalidades.</p>
      ) : null}
      <div className="flex flex-col gap-4" style={{ maxWidth: 1080 }}>
        {visiveis.map(({ folder, indice, features }) => (
          <Pasta
            key={folder.id}
            folder={folder}
            features={features}
            primeira={indice === 0}
            ultima={indice === folders.length - 1}
            podeMover={podeMover}
            selecao={selecao}
            semFiltro={!filtrando}
            ocupado={reordenarPastas.isPending}
            onMover={(dir) => moverPasta(indice, dir)}
            onEditar={() => setEditando({ tipo: 'pasta', item: folder })}
            onEditarFeature={(f) => setEditando({ tipo: 'feature', item: f })}
          />
        ))}
      </div>

      <EditarItemModal editando={editando} onClose={() => setEditando(null)} />
    </>
  );
}

/**
 * Subir e descer, em botões.
 *
 * Arrastar seria mais rápido com o mouse e inalcançável pelo teclado; os dois
 * botões servem os dois, e o rótulo diz o que move ("Subir a pasta Inspetor"),
 * porque "Subir" sozinho, lido fora da linha, não diz o quê.
 *
 * O foco fica na linha que se moveu. Os dois botões ficam desabilitados
 * enquanto a nova ordem vai ao servidor, e o da ponta continua assim depois:
 * em qualquer um dos casos o botão clicado perderia o foco, e quem usa teclado
 * recomeçaria do topo. Terminada a gravação, o foco volta ao botão clicado ou,
 * se ele ficou desabilitado na ponta, vai ao da direção oposta.
 */
function BotoesDeOrdem({ nome, primeira, ultima, ocupado, onMover }) {
  const subirEl = useRef(null);
  const descerEl = useRef(null);
  const clicado = useRef(0);

  useEffect(() => {
    if (ocupado || clicado.current === 0) return;
    const subindo = clicado.current < 0;
    clicado.current = 0;
    const alvo = subindo ? (primeira ? descerEl.current : subirEl.current) : ultima ? subirEl.current : descerEl.current;
    alvo?.focus();
  }, [ocupado, primeira, ultima]);

  const mover = (direcao) => {
    clicado.current = direcao;
    onMover(direcao);
  };

  return (
    <span className="flex items-center gap-1">
      <button ref={subirEl} type="button" className="icone-btn icone-btn--compacto" aria-label={`Subir ${nome}`} disabled={primeira || ocupado} onClick={() => mover(-1)} style={{ opacity: primeira ? 0.35 : 1 }}>
        <ArrowUp size={15} aria-hidden="true" />
      </button>
      <button ref={descerEl} type="button" className="icone-btn icone-btn--compacto" aria-label={`Descer ${nome}`} disabled={ultima || ocupado} onClick={() => mover(1)} style={{ opacity: ultima ? 0.35 : 1 }}>
        <ArrowDown size={15} aria-hidden="true" />
      </button>
    </span>
  );
}

function Pasta({ folder, features, primeira, ultima, podeMover, selecao, semFiltro, ocupado, onMover, onEditar, onEditarFeature }) {
  const reordenar = useReorderHelpFeatures();
  const { show: toast } = useToastStore();
  const tituloId = useId();
  const ids = features.map((f) => f.id);
  const quantos = selecao ? ids.filter((id) => selecao.marcados.has(id)).length : 0;
  const todas = ids.length > 0 && quantos === ids.length;

  const moverFeature = async (indice, direcao) => {
    const ids = moverNaOrdem(folder.features, indice, direcao);
    if (!ids) return;
    try {
      await reordenar.mutateAsync({ folderId: folder.id, ids });
    } catch (e) {
      avisarErro(toast, e, 'Não foi possível reordenar as funcionalidades.');
    }
  };

  return (
    <section aria-labelledby={tituloId} className="anim-fade-up" style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: 16 }}>
      <header className="flex items-start gap-3">
        {selecao && ids.length > 0 && (
          // Marca as que a pasta mostra agora: com um filtro ligado, só as que
          // passam nele. O nome diz isso, porque "todos" sem contexto engana.
          <span style={{ margin: '-4px -6px -4px -8px' }}>
            <CaixaDeMarcar
              checked={todas}
              indeterminate={quantos > 0 && !todas}
              onChange={() => selecao.marcarVarios(ids, !todas)}
              aria-label={semFiltro ? `Todos os tutoriais de ${folder.title}` : `Todos os tutoriais de ${folder.title} neste filtro`}
            />
          </span>
        )}
        <span style={{ width: 36, height: 36, borderRadius: 999, background: T.accentSoft, color: T.accentInk, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconeDaPasta nome={folder.icon} size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id={tituloId} style={{ fontFamily: T.display, fontSize: 16, fontWeight: W.title, color: T.text }}>
            {folder.title}
            {folder.admin_only && <span style={{ marginLeft: 8 }}><Badge>Só admin</Badge></span>}
          </h2>
          {folder.description && <p style={{ color: T.mute, fontSize: 13, marginTop: 2, lineHeight: 1.5 }}>{folder.description}</p>}
        </div>
        {selecao ? (
          quantos > 0 && (
            <span style={{ ...NUM, color: T.accentInk, fontSize: 13, fontWeight: W.title, flexShrink: 0, alignSelf: 'center' }}>
              {quantos} de {ids.length}
            </span>
          )
        ) : (
          <span className="flex items-center gap-1" style={{ flexShrink: 0 }}>
            <button type="button" className="icone-btn icone-btn--compacto" aria-label={`Editar a pasta ${folder.title}`} title="Editar título e descrição" onClick={onEditar}>
              <Pencil size={15} aria-hidden="true" />
            </button>
            {podeMover && <BotoesDeOrdem nome={`a pasta ${folder.title}`} primeira={primeira} ultima={ultima} ocupado={ocupado} onMover={onMover} />}
          </span>
        )}
      </header>

      {features.length === 0 ? (
        <p style={{ color: T.mute, fontSize: 13, marginTop: 12 }}>Nenhuma funcionalidade nesta pasta.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {features.map((f) => {
            const indice = folder.features.findIndex((x) => x.id === f.id);
            return (
              <LinhaDaFeature
                key={f.id}
                feature={f}
                podeMover={podeMover}
                selecao={selecao}
                primeira={indice === 0}
                ultima={indice === folder.features.length - 1}
                ocupado={reordenar.isPending}
                onMover={(dir) => moverFeature(indice, dir)}
                onEditar={() => onEditarFeature(f)}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Aparelho, título, abas e duração: o miolo da linha, com ou sem seleção. */
function MioloDaFeature({ feature, tituloId }) {
  const Aparelho = feature.device === 'MOBILE' ? Smartphone : Monitor;
  const duracao = formatarDuracao(feature.duration_s);
  return (
    <>
      <Aparelho size={15} color={T.mute} aria-label={feature.device === 'MOBILE' ? 'Celular' : 'Computador'} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span id={tituloId} style={{ display: 'block', fontSize: 14, fontWeight: W.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {feature.title}
        </span>
        <span style={{ display: 'block', color: T.mute, fontSize: 12, marginTop: 2 }}>
          {feature.step_count} {feature.step_count === 1 ? 'aba' : 'abas'}
          {duracao ? ` · ${duracao}` : ''}
          {feature.summary ? ` · ${feature.summary}` : ''}
        </span>
      </span>
      {!feature.in_catalog && <Badge variant="warning">Fora do roteiro</Badge>}
      <SelosDoTutorial feature={feature} />
    </>
  );
}

function LinhaDaFeature({ feature, podeMover, selecao, primeira, ultima, ocupado, onMover, onEditar }) {
  const tituloId = useId();

  // No modo de seleção a linha inteira é o rótulo da caixa: clicar em
  // qualquer ponto marca. O link, o lápis e as setas saem, porque cada um
  // faria outra coisa no mesmo clique. O nome da caixa é só o título (por
  // `aria-labelledby`), e não a linha inteira com selos e duração.
  if (selecao) {
    const marcado = selecao.marcados.has(feature.id);
    return (
      <li>
        {/* O controle está dentro, em `CaixaDeMarcar`; a regra não enxerga através do componente. */}
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label className={`linha-sel${marcado ? ' is-marcada' : ''}`}>
          <CaixaDeMarcar checked={marcado} onChange={() => selecao.alternar(feature.id)} aria-labelledby={tituloId} />
          <MioloDaFeature feature={feature} tituloId={tituloId} />
        </label>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3" style={{ padding: '8px 4px 8px 10px', borderRadius: R.control, background: T.chip }}>
      <Link
        href={`/desktop/admin/tutoriais/${feature.id}`}
        className="link-acao flex items-center gap-3"
        style={{ flex: 1, minWidth: 0, color: T.text, padding: '4px 0' }}
      >
        <MioloDaFeature feature={feature} tituloId={tituloId} />
        <ChevronRight size={16} color={T.faint} aria-hidden="true" style={{ flexShrink: 0 }} />
      </Link>
      <span className="flex items-center gap-1" style={{ flexShrink: 0 }}>
        <button type="button" className="icone-btn icone-btn--compacto" aria-label={`Editar ${feature.title}`} title="Editar título e resumo" onClick={onEditar}>
          <Pencil size={15} aria-hidden="true" />
        </button>
        {podeMover && <BotoesDeOrdem nome={feature.title} primeira={primeira} ultima={ultima} ocupado={ocupado} onMover={onMover} />}
      </span>
    </li>
  );
}

/** "1 tutorial" ou "3 tutoriais". */
function tutoriais(n) {
  return `${n} ${n === 1 ? 'tutorial' : 'tutoriais'}`;
}

/**
 * A barra do modo de seleção: quantos estão marcados e o que fazer com eles.
 *
 * Flutua no rodapé da área principal, e não da janela: a barra lateral fica
 * de fora. Como a página rola pela janela, a barra é `fixed`, e a posição
 * horizontal acompanha o `<main>` medido (a barra lateral abre e recolhe).
 * Entra de baixo em 200 ms, por `transform` e opacidade; com menos movimento
 * pedido no sistema, só aparece.
 *
 * Uma linha só, sempre, em três grupos: sair e a contagem à esquerda, os
 * atalhos de marcar no meio, as duas ações à direita. Quando falta largura,
 * os textos somem antes de qualquer coisa quebrar (ver `.barra-sel` em
 * globals.css), e cada botão continua com nome por `aria-label`.
 *
 * "Selecionar todos" marca o que o filtro ligado mostra, e nada além: com
 * "Sem vídeo" ligado, são todos os sem vídeo. "Limpar" desmarca sem sair.
 *
 * Publicar e Despublicar ficam desabilitados com nada marcado, com o motivo
 * curto no `title` e na descrição acessível; a contagem vira "Nenhum
 * selecionado". Os dois pedem confirmação dizendo quantos. Publicar é
 * neutro (nada some para ninguém); despublicar é cautela, porque tira da
 * central e muda para onde o "?" das telas leva.
 *
 * `role="toolbar"`: as setas andam entre os botões, além do Tab. Escape sai
 * do modo, menos com uma caixa aberta: aí o Escape é dela.
 */
function BarraDaSelecao({ areaRef, escolhidos, visiveis, onTodos, onLimpar, onSair }) {
  const lote = usePublishHelpFeaturesBatch();
  const { show: toast } = useToastStore();
  const [pergunta, setPergunta] = useState(null);
  const [erro, setErro] = useState(null);
  const [faixa, setFaixa] = useState(null);
  const avisoId = useId();
  const n = escolhidos.length;
  const tudoMarcado = visiveis.length > 0 && n === visiveis.length;

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return undefined;
    const medir = () => {
      const { left, width } = area.getBoundingClientRect();
      setFaixa(width ? { left, width } : null);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(medir);
    observador.observe(area);
    return () => observador.disconnect();
  }, [areaRef]);

  useEffect(() => {
    if (pergunta) return undefined;
    const aoTeclar = (e) => {
      // Com qualquer caixa aberta (a de editar título, por exemplo), o Escape
      // fecha a caixa, e só ela.
      if (e.key !== 'Escape' || document.querySelector('dialog, [role="dialog"]')) return;
      onSair();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [pergunta, onSair]);

  const andarComSetas = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const botoes = [...e.currentTarget.querySelectorAll('button:not(:disabled)')];
    const atual = botoes.indexOf(document.activeElement);
    if (atual < 0) return;
    e.preventDefault();
    const passo = e.key === 'ArrowRight' ? 1 : -1;
    botoes[(atual + passo + botoes.length) % botoes.length].focus();
  };

  const confirmar = async () => {
    const published = pergunta === 'publicar';
    try {
      const r = await lote.mutateAsync({ ids: escolhidos, published });
      const mudaram = r?.updated ?? 0;
      const verbo = published ? 'publicado' : 'despublicado';
      toast(
        mudaram === 0
          ? `Os escolhidos já estavam ${verbo}s`
          : `${tutoriais(mudaram)} ${mudaram === 1 ? verbo : `${verbo}s`}` +
              (mudaram < n ? `; ${n - mudaram === 1 ? 'o outro já estava' : 'os outros já estavam'} assim` : '')
      );
      setPergunta(null);
      onSair();
    } catch (e) {
      // A caixa continua aberta, com a recusa dentro dela: o admin lê o motivo
      // e tenta de novo sem refazer a seleção.
      setErro(mensagemDoErro(e, published ? 'Não foi possível publicar os tutoriais.' : 'Não foi possível despublicar os tutoriais.'));
    }
  };
  const perguntar = (qual) => {
    setErro(null);
    setPergunta(qual);
  };
  const fecharPergunta = () => {
    setErro(null);
    setPergunta(null);
  };

  return (
    <>
      <div className="barra-sel-faixa" style={faixa ? { left: faixa.left, width: faixa.width } : undefined}>
        {/* O anúncio fica fora da barra: o leitor de tela lê a contagem nova
            sem reler a barra inteira a cada caixa marcada. */}
        <span aria-live="polite" className="sr-only">
          {n === 1 ? '1 tutorial selecionado' : `${n} tutoriais selecionados`}
        </span>
        <div role="toolbar" aria-label="Ações da seleção" className="barra-sel" onKeyDown={andarComSetas}>
          <button type="button" className="icone-btn icone-btn--compacto" aria-label="Sair da seleção" title="Sair da seleção (Esc)" onClick={onSair}>
            <X size={18} aria-hidden="true" />
          </button>
          <span className="barra-sel__conta">
            {n === 0 ? (
              <span className="barra-sel__vazio">Nenhum selecionado</span>
            ) : (
              <>
                <span className="barra-sel__n">{n}</span>{' '}
                <span className="barra-sel__txt">{n === 1 ? 'selecionado' : 'selecionados'}</span>
              </>
            )}
          </span>
          <span aria-hidden="true" className="barra-sel__fio" />
          <button
            type="button"
            className="barra-sel__link"
            aria-label="Selecionar todos"
            title="Selecionar todos"
            onClick={onTodos}
            disabled={visiveis.length === 0 || tudoMarcado}
          >
            <ListChecks size={16} aria-hidden="true" />
            <span className="barra-sel__txt">Selecionar todos</span>
          </button>
          <button type="button" className="barra-sel__link" aria-label="Limpar" title="Limpar a seleção" onClick={onLimpar} disabled={n === 0}>
            <Eraser size={16} aria-hidden="true" />
            <span className="barra-sel__txt">Limpar</span>
          </button>
          <span className="barra-sel__mola" />
          <span id={avisoId} className="sr-only">Marque um tutorial</span>
          <Button
            variant="secondary"
            className="barra-sel__acao"
            aria-label="Despublicar"
            title={n === 0 ? 'Marque um tutorial' : undefined}
            aria-describedby={n === 0 ? avisoId : undefined}
            onClick={() => perguntar('despublicar')}
            disabled={n === 0}
            style={{ padding: '0 14px', height: 40, flexShrink: 0 }}
          >
            <EyeOff size={16} aria-hidden="true" />
            <span className="barra-sel__txt">Despublicar</span>
          </Button>
          <Button
            className="barra-sel__acao"
            aria-label="Publicar"
            title={n === 0 ? 'Marque um tutorial' : undefined}
            aria-describedby={n === 0 ? avisoId : undefined}
            onClick={() => perguntar('publicar')}
            disabled={n === 0}
            style={{ padding: '0 16px', height: 40, flexShrink: 0 }}
          >
            <Eye size={16} aria-hidden="true" />
            <span className="barra-sel__txt">Publicar</span>
          </Button>
        </div>
      </div>

      {/* As confirmações ficam fora da faixa de propósito: a faixa tem
          `pointer-events: none` (só a barra recebe clique), e o `<dialog>`
          herda isso mesmo indo para a camada do topo. Dentro dela, o botão
          de confirmar não recebia o clique e o lote nunca saía. */}
      <ConfirmModal
        open={pergunta === 'publicar'}
        title={`Publicar ${tutoriais(n)}?`}
        message={`${n === 1 ? 'O tutorial escolhido passa' : `Os ${tutoriais(n)} escolhidos passam`} a aparecer na central de ajuda para todo mundo que enxerga a pasta de cada um. Sem vídeo, aparecem só com os passos em texto. O que já estava publicado fica como está.`}
        confirmLabel="Publicar"
        confirmVariant="primary"
        tone="neutral"
        loading={lote.isPending}
        loadingLabel="Publicando..."
        loadingAnnouncement={`Publicando ${tutoriais(n)}`}
        error={erro}
        onConfirm={confirmar}
        onCancel={fecharPergunta}
      />
      <ConfirmModal
        open={pergunta === 'despublicar'}
        title={`Despublicar ${tutoriais(n)}?`}
        message={`${n === 1 ? 'O tutorial escolhido sai' : `Os ${tutoriais(n)} escolhidos saem`} da central de ajuda, e o "?" das telas que apontam para ${n === 1 ? 'ele' : 'eles'} passa a levar à pasta. Vídeos e ajustes continuam aqui.`}
        confirmLabel="Despublicar"
        confirmVariant="primary"
        tone="danger"
        loading={lote.isPending}
        loadingLabel="Despublicando..."
        loadingAnnouncement={`Despublicando ${tutoriais(n)}`}
        error={erro}
        onConfirm={confirmar}
        onCancel={fecharPergunta}
      />
    </>
  );
}

/**
 * Sincronizar o catálogo.
 *
 * Sem a opção ligada, é seguro e idempotente: cria o que falta e ajusta ícone,
 * cargos e número de abas, sem tocar em vídeo, ordem, resumo, publicação ou
 * tempos. O que é criado nasce publicado (o tutorial vale sem vídeo), e o
 * texto da caixa diz isso, porque sincronizar passa a pôr coisa no ar. A opção de reescrever títulos e textos desfaz os ajustes manuais, por
 * isso ela começa desligada e a confirmação muda de tom quando ela é ligada.
 */
function SincronizarModal({ open, onClose }) {
  const [textos, setTextos] = useState(false);
  const sync = useHelpSync();
  const { show: toast } = useToastStore();

  const fechar = () => {
    if (sync.isPending) return;
    setTextos(false);
    onClose();
  };

  const confirmar = async () => {
    try {
      const r = await sync.mutateAsync({ textos });
      const criadas = (r?.funcionalidades?.criadas ?? 0) + (r?.pastas?.criadas ?? 0) + (r?.abas?.criadas ?? 0);
      const atualizadas = (r?.funcionalidades?.atualizadas ?? 0) + (r?.pastas?.atualizadas ?? 0) + (r?.abas?.atualizadas ?? 0);
      toast(criadas + atualizadas === 0 ? 'Catálogo já estava em dia' : `Catálogo sincronizado: ${criadas} criados, ${atualizadas} atualizados`);
      fechar();
    } catch (e) {
      avisarErro(toast, e, 'Não foi possível sincronizar o catálogo.');
    }
  };

  return (
    <Modal open={open} onClose={fechar} title="Sincronizar catálogo" maxWidth={480}>
      <div className="flex flex-col gap-4">
        <p style={{ color: T.text, fontSize: 14, lineHeight: 1.6 }}>
          Leva o roteiro do deploy atual para a central: cria pastas, funcionalidades e abas que faltam e
          ajusta ícones, cargos e número de abas. Funcionalidades novas nascem publicadas, só com os passos em
          texto, até o vídeo chegar. Vídeos, ordem, resumos, publicação e tempos das que já existem ficam como
          estão: o que foi despublicado continua despublicado.
        </p>
        <Toggle checked={textos} onChange={setTextos} label="Também reescrever títulos e textos das abas a partir do roteiro" />
        {textos && (
          <p role="alert" style={{ color: T.danger, fontSize: 13, lineHeight: 1.5 }}>
            Isso desfaz os ajustes manuais de título e texto feitos aqui. Use depois de mudar a narração no roteiro.
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="secondary" style={{ flex: 1 }} onClick={fechar} disabled={sync.isPending}>Voltar</Button>
          <Button variant={textos ? 'danger' : 'primary'} style={{ flex: 1 }} loading={sync.isPending} onClick={confirmar}>
            Sincronizar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
