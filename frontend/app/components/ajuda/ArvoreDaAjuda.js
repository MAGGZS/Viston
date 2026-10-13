'use client';
import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, ListOrdered, Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { IconeDaPasta } from '@/app/components/ajuda/IconeDaPasta';
import { CampoDeBusca, ResultadosDaBusca, situacaoDaBusca } from '@/app/components/ajuda/BuscaAjuda';
import { Skeleton } from '@/app/components/ui';
import { useHelpFolderContents, useHelpFolders, useHelpSearch } from '@/app/hooks/useAjuda';
import { useDebouncedValue } from '@/app/hooks/useDebouncedValue';
import { cartaoSemVideo } from '@/app/lib/ajuda';
import { mensagemDoErro } from '@/app/lib/erros';

/** Sem acento e sem caixa: "codigo" acha "Código". */
function normalizar(texto) {
  return (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * A coluna da esquerda da central no computador: a busca e, embaixo, as pastas
 * em árvore, como a barra lateral de arquivos de um editor.
 *
 * Cada pasta é um cargo. As do seu cargo vêm primeiro e abertas; as outras
 * vêm recolhidas, sob "Outros cargos". Quem é o quê vem pronto da API
 * (`mine`), como na central do telefone. Os tutoriais de uma pasta só são
 * pedidos quando ela abre, e a consulta é a mesma da tela da pasta: abrir na
 * árvore e clicar na pasta não pede nada duas vezes.
 *
 * A árvore mora no layout (ver `AjudaShell`), e não em cada página: trocar de
 * tutorial não a desmonta, então o que a pessoa abriu e fechou continua como
 * estava, e a rolagem da coluna também. A pasta da tela aberta sempre abre
 * (quem chega por um link ou pela busca vê onde está), e fica aberta depois.
 *
 * O teclado segue o padrão de árvore da WAI-ARIA (APG, "navigation treeview"):
 * a árvore é uma parada só do Tab, com o foco em um item por vez; as setas
 * para cima e para baixo andam pelos itens visíveis, a da direita abre a pasta
 * (ou entra nela, se já aberta), a da esquerda fecha (ou sobe para a pasta, se
 * o foco está num tutorial), Home e End vão às pontas, e Enter segue o link.
 *
 * Com algo digitado, a árvore mostra só o que casa: a pasta cujo nome casa vem
 * inteira, e das outras ficam os tutoriais cujo título casa ou que têm um
 * passo que fala do termo (esses vêm da mesma busca do servidor, que embaixo
 * lista os passos, com o link direto para a aba).
 */
export function ArvoreDaAjuda() {
  const params = useParams() ?? {};
  const pastaAtiva = params.pasta ?? null;
  const tutorialAtivo = params.funcionalidade ?? null;

  const pastasQ = useHelpFolders();
  // A API já não manda pasta vazia; o filtro fica para uma resposta antiga em
  // cache, como na central do telefone.
  const pastas = (pastasQ.data?.folders ?? []).filter((p) => (p.feature_count ?? 0) > 0);

  const [termo, setTermo] = useState('');
  const q = useDebouncedValue(termo, 300).trim();
  const filtrando = q.length >= 2 && termo.trim().length >= 2;
  const busca = useHelpSearch(q);

  // O que a pessoa abriu ou fechou à mão. Sem escolha, vale o padrão: aberta
  // se é do seu cargo. A pasta da tela aberta entra aqui como aberta, e não
  // como padrão: ao sair dela para outra pasta, ela continua aberta.
  const [escolhas, setEscolhas] = useState(() => (pastaAtiva ? { [pastaAtiva]: true } : {}));
  const [pastaVista, setPastaVista] = useState(pastaAtiva);
  if (pastaVista !== pastaAtiva) {
    setPastaVista(pastaAtiva);
    if (pastaAtiva && escolhas[pastaAtiva] !== true) setEscolhas({ ...escolhas, [pastaAtiva]: true });
  }

  // Durante a busca tudo o que casa vem aberto; fechar uma pasta ali vale só
  // para aquele termo, e não mexe no que a pessoa tinha aberto antes de buscar.
  const [fechadasNaBusca, setFechadasNaBusca] = useState({});
  const [termoVisto, setTermoVisto] = useState(q);
  if (termoVisto !== q) {
    setTermoVisto(q);
    setFechadasNaBusca({});
  }

  const aberta = (p) => (filtrando ? !fechadasNaBusca[p.slug] : (escolhas[p.slug] ?? Boolean(p.mine)));
  const alternar = (slug, abrir) => {
    if (filtrando) setFechadasNaBusca((f) => ({ ...f, [slug]: !abrir }));
    else setEscolhas((e) => ({ ...e, [slug]: abrir }));
  };

  const conteudos = useHelpFolderContents(pastas.map((p) => ({ slug: p.slug, enabled: filtrando || aberta(p) })));

  // Os passos achados só valem quando são deste termo: `keepPreviousData`
  // segura a lista anterior enquanto a nova chega, e ela filtraria a árvore
  // pelo termo velho.
  const passos = filtrando && busca.data && !busca.isPlaceholderData ? (busca.data.results ?? []) : [];
  const comPasso = new Set(passos.map((r) => `${r.folder_slug}/${r.feature_slug}`));
  const nq = normalizar(q);

  const visiveis = [];
  pastas.forEach((p, i) => {
    const r = conteudos[i];
    const features = r?.data?.features ?? [];
    const carregando = Boolean(r?.isLoading);
    const erro = Boolean(r?.isError);
    if (!filtrando) {
      visiveis.push({ pasta: p, features, carregando, erro, refetch: r?.refetch });
      return;
    }
    const pastaCasa = normalizar(p.title).includes(nq);
    const casam = pastaCasa
      ? features
      : features.filter((f) => normalizar(f.title).includes(nq) || comPasso.has(`${p.slug}/${f.slug}`));
    if (pastaCasa || casam.length > 0) {
      visiveis.push({ pasta: p, features: casam, carregando: pastaCasa && carregando, erro: false });
    }
  });

  const minhas = visiveis.filter((v) => v.pasta.mine);
  const outras = visiveis.filter((v) => !v.pasta.mine);
  const secoes = [
    minhas.length > 0 && { id: 'seu-cargo', titulo: 'Seu cargo', itens: minhas },
    outras.length > 0 && { id: 'outros', titulo: minhas.length > 0 ? 'Outros cargos' : 'Pastas', itens: outras },
  ].filter(Boolean);

  // Os itens visíveis, na ordem da tela: é por eles que as setas andam.
  const nos = [];
  for (const s of secoes) {
    for (const v of s.itens) {
      const idPasta = `p:${v.pasta.slug}`;
      const estaAberta = aberta(v.pasta);
      nos.push({ id: idPasta, tipo: 'pasta', slug: v.pasta.slug, aberta: estaAberta });
      if (estaAberta) {
        for (const f of v.features) nos.push({ id: `t:${v.pasta.slug}/${f.slug}`, tipo: 'tutorial', pai: idPasta });
      }
    }
  }

  const idAtivo = tutorialAtivo && pastaAtiva ? `t:${pastaAtiva}/${tutorialAtivo}` : pastaAtiva ? `p:${pastaAtiva}` : null;
  const [foco, setFoco] = useState(null);
  // A parada do Tab é o último item focado; se ele sumiu (pasta fechada,
  // filtro), é o item da tela aberta, e na falta dele o primeiro.
  const focavel = nos.some((n) => n.id === foco)
    ? foco
    : nos.some((n) => n.id === idAtivo)
      ? idAtivo
      : nos[0]?.id;

  const refs = useRef(new Map());
  const mover = (no) => {
    if (!no) return;
    setFoco(no.id);
    refs.current.get(no.id)?.focus();
  };

  const aoTeclar = (e) => {
    const id = e.target.closest?.('[data-no]')?.dataset.no;
    const i = nos.findIndex((n) => n.id === id);
    if (i < 0) return;
    const no = nos[i];
    switch (e.key) {
      case 'ArrowDown':
        mover(nos[i + 1]);
        break;
      case 'ArrowUp':
        mover(nos[i - 1]);
        break;
      case 'Home':
        mover(nos[0]);
        break;
      case 'End':
        mover(nos[nos.length - 1]);
        break;
      case 'ArrowRight':
        if (no.tipo === 'pasta') {
          if (!no.aberta) alternar(no.slug, true);
          else if (nos[i + 1]?.pai === no.id) mover(nos[i + 1]);
        }
        break;
      case 'ArrowLeft':
        if (no.tipo === 'pasta') {
          if (no.aberta) alternar(no.slug, false);
        } else {
          mover(nos.find((n) => n.id === no.pai));
        }
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const registrar = (id) => (el) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  const situacao = situacaoDaBusca(termo, q, busca, filtrando ? visiveis.reduce((n, v) => n + v.features.length, 0) : null);

  return (
    <>
      <CampoDeBusca
        termo={termo}
        onTermo={setTermo}
        rotulo="Buscar nos tutoriais"
        rotuloVisivel={false}
        placeholder="Buscar nos tutoriais"
        situacao={situacao}
        compacto
        className="ajuda-lateral__busca"
      />

      {pastasQ.isLoading ? (
        <div aria-busy="true" aria-label="Carregando as pastas" className="ajuda-arvore">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 30, borderRadius: 10, marginBottom: 6 }} />
          ))}
        </div>
      ) : pastasQ.isError ? (
        <div className="ajuda-arvore__aviso" role="alert">
          <p>{mensagemDoErro(pastasQ.error, 'Não deu para carregar as pastas.')}</p>
          <button type="button" className="link-acao" onClick={() => pastasQ.refetch()}>
            <RefreshCw size={13} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      ) : pastas.length === 0 ? (
        <p className="ajuda-arvore__aviso">A central ainda está vazia.</p>
      ) : nos.length > 0 ? (
        // O foco é dos itens (tabindex móvel), e não da árvore: o padrão da
        // APG põe o Tab num item só, e a árvore só escuta as teclas que sobem.
        // eslint-disable-next-line jsx-a11y/interactive-supports-focus
        <div role="tree" aria-label="Pastas e tutoriais" className="ajuda-arvore" onKeyDown={aoTeclar}>
          {secoes.map((s) => (
            <SecaoDaArvore
              key={s.id}
              secao={s}
              aberta={aberta}
              alternar={alternar}
              filtrando={filtrando}
              idAtivo={idAtivo}
              focavel={focavel}
              aoFocar={setFoco}
              registrar={registrar}
            />
          ))}
        </div>
      ) : null}

      {passos.length > 0 && <PassosAchados passos={passos} />}
    </>
  );
}

/**
 * "Seu cargo" ou "Outros cargos": um grupo da árvore com o rótulo dele. O
 * rótulo é o nome do grupo para o leitor de tela, que o anuncia ao entrar.
 */
function SecaoDaArvore({ secao, aberta, alternar, filtrando, idAtivo, focavel, aoFocar, registrar }) {
  const rotuloId = useId();
  return (
    <div role="group" aria-labelledby={rotuloId} className="ajuda-arvore__secao">
      <p id={rotuloId} className="ajuda-arvore__rotulo">{secao.titulo}</p>
      <ul role="none" className="ajuda-arvore__lista">
        {secao.itens.map((v, i) => (
          <PastaDaArvore
            key={v.pasta.id}
            item={v}
            posicao={i + 1}
            total={secao.itens.length}
            aberta={aberta(v.pasta)}
            alternar={alternar}
            filtrando={filtrando}
            idAtivo={idAtivo}
            focavel={focavel}
            aoFocar={aoFocar}
            registrar={registrar}
          />
        ))}
      </ul>
    </div>
  );
}

function PastaDaArvore({ item, posicao, total, aberta, alternar, filtrando, idAtivo, focavel, aoFocar, registrar }) {
  const { pasta, features, carregando, erro, refetch } = item;
  const id = `p:${pasta.slug}`;
  const ativa = idAtivo === id;
  const contemAtivo = Boolean(idAtivo?.startsWith(`t:${pasta.slug}/`));
  // Na busca, o número é do que casou; fora dela, o total publicado.
  const n = filtrando ? features.length : (pasta.feature_count ?? features.length);

  return (
    <li role="none">
      <Link
        href={`/ajuda/${pasta.slug}`}
        role="treeitem"
        data-no={id}
        ref={registrar(id)}
        tabIndex={focavel === id ? 0 : -1}
        aria-level={1}
        aria-setsize={total}
        aria-posinset={posicao}
        aria-expanded={aberta}
        aria-selected={ativa ? true : undefined}
        aria-current={ativa ? 'page' : undefined}
        data-contem-ativo={contemAtivo || undefined}
        className="ajuda-no ajuda-no--pasta"
        onFocus={() => aoFocar(id)}
        onClick={() => {
          if (!aberta) alternar(pasta.slug, true);
        }}
      >
        {/* A seta abre e fecha sem navegar. Fica fora do leitor de tela e do
            Tab: para eles, abrir e fechar são as setas do teclado, e o
            `aria-expanded` do item diz o estado. */}
        <span
          className="ajuda-no__seta"
          aria-hidden="true"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            alternar(pasta.slug, !aberta);
          }}
        >
          <ChevronRight size={14} />
        </span>
        <IconeDaPasta nome={pasta.icon} size={16} className="ajuda-no__icone" />
        <span className="ajuda-no__titulo">{pasta.title}</span>
        <span className="ajuda-no__conta" aria-hidden="true">{n}</span>
        <span className="sr-only">, {n === 1 ? '1 tutorial' : `${n} tutoriais`}</span>
      </Link>

      {aberta && (carregando || erro || features.length > 0) && (
        <ul role="group" aria-busy={carregando || undefined} className="ajuda-arvore__grupo">
          {carregando ? (
            [0, 1].map((i) => (
              <li key={i} role="none" style={{ padding: '4px 8px 4px 30px' }}>
                <Skeleton style={{ height: 18, borderRadius: 6 }} />
              </li>
            ))
          ) : erro ? (
            <li role="none" className="ajuda-arvore__aviso ajuda-arvore__aviso--dentro">
              Não deu para abrir esta pasta.{' '}
              <button type="button" className="link-acao" onClick={() => refetch?.()}>Tentar de novo</button>
            </li>
          ) : (
            features.map((f, i) => (
              <TutorialDaArvore
                key={f.id ?? f.slug}
                pasta={pasta.slug}
                feature={f}
                posicao={i + 1}
                total={features.length}
                idAtivo={idAtivo}
                focavel={focavel}
                aoFocar={aoFocar}
                registrar={registrar}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

/**
 * Um tutorial na árvore. O ícone diz o formato: o aparelho em que foi gravado,
 * ou a lista numerada quando ainda é só passo a passo em texto, o mesmo
 * critério do cartão (ver `cartaoSemVideo`).
 */
function TutorialDaArvore({ pasta, feature, posicao, total, idAtivo, focavel, aoFocar, registrar }) {
  const id = `t:${pasta}/${feature.slug}`;
  const ativo = idAtivo === id;
  const Icone = cartaoSemVideo(feature) ? ListOrdered : feature.device === 'MOBILE' ? Smartphone : Monitor;

  return (
    <li role="none">
      <Link
        href={`/ajuda/${pasta}/${feature.slug}`}
        role="treeitem"
        data-no={id}
        ref={registrar(id)}
        tabIndex={focavel === id ? 0 : -1}
        aria-level={2}
        aria-setsize={total}
        aria-posinset={posicao}
        aria-selected={ativo ? true : undefined}
        aria-current={ativo ? 'page' : undefined}
        className="ajuda-no ajuda-no--tutorial"
        onFocus={() => aoFocar(id)}
      >
        <Icone size={14} aria-hidden="true" className="ajuda-no__icone" />
        <span className="ajuda-no__titulo">{feature.title}</span>
      </Link>
    </li>
  );
}

/** Os passos que a busca do servidor achou, com o link direto para a aba. */
function PassosAchados({ passos }) {
  const rotuloId = useId();
  return (
    <section aria-labelledby={rotuloId} className="ajuda-lateral__passos">
      <h2 id={rotuloId} className="ajuda-arvore__rotulo">Nos passos</h2>
      <ResultadosDaBusca resultados={passos} compacto rotulo="Passos encontrados" />
    </section>
  );
}
