'use client';
import { Suspense, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Info, RefreshCw } from 'lucide-react';
import { CabecalhoAjuda, EstadoDaAjuda, useComArvore } from '@/app/components/ajuda/AjudaShell';
import { CampoDeBusca, ResultadosDaBusca, situacaoDaBusca } from '@/app/components/ajuda/BuscaAjuda';
import { ListaDeTutoriais } from '@/app/components/ajuda/CartaoDoTutorial';
import { IconeDaPasta } from '@/app/components/ajuda/IconeDaPasta';
import { Badge, Button, Skeleton } from '@/app/components/ui';
import { useHelpFolderContents, useHelpFolders, useHelpSearch } from '@/app/hooks/useAjuda';
import { useDebouncedValue } from '@/app/hooks/useDebouncedValue';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useAuthStore } from '@/app/store/auth';
import { isViewerOnly } from '@/app/lib/roles';
import { mensagemDoErro } from '@/app/lib/erros';
import { T, R, W } from '@/app/lib/theme';

/**
 * Tela 1 da central: as pastas, uma por cargo, e a busca.
 *
 * As pastas do cargo da pessoa vêm primeiro, em "Seu cargo", e as outras
 * depois, em "Outros cargos". Quem é o quê vem pronto da API (`mine`), com a
 * regra inteira no servidor: o gestor tem a pasta de gestor, a conta comum tem
 * a de cada papel que ocupa em algum prédio, e quem ainda não tem prédio tem
 * "Primeiros passos". Recalcular isso aqui seria ter a regra em dois lugares.
 *
 * As outras pastas continuam à vista, e não escondidas: o inspetor que vai ser
 * promovido a moderador quer saber o que muda, e o gestor quer ver o que a
 * equipe dele aprende. A exceção é a pasta sem nenhum tutorial publicado, que
 * não aparece (decisão do proprietário): aberta, ela não teria nada.
 *
 * `?aviso=indisponivel` chega quando o "?" de uma tela apontou para um tutorial
 * de uma pasta que ainda não tem nada publicado: o tutorial manda para a pasta,
 * e a pasta, vazia, manda para cá (ver as duas páginas de baixo).
 *
 * No computador, a busca e as pastas moram na árvore à esquerda (ver
 * `ArvoreDaAjuda`), e esta tela vira o começo: uma linha de boas-vindas e os
 * tutoriais do seu cargo, prontos para abrir. Repetir aqui a grade de pastas
 * seria mostrar duas vezes, lado a lado, a mesma lista.
 */
export default function AjudaPage() {
  const comArvore = useComArvore();
  if (comArvore) {
    return (
      <Suspense fallback={null}>
        <InicioNaMesa />
      </Suspense>
    );
  }
  return (
    <>
      <Suspense fallback={null}>
        <Topo />
      </Suspense>
      <Busca />
    </>
  );
}

/**
 * O cabeçalho e o aviso do "?".
 *
 * A volta leva ao perfil, que é de onde se entra na central. O visualizador no
 * telefone é a exceção: o perfil (como toda tela fora da central) mostra a ele
 * o aviso de "só pelo computador", então a volta é o voltar do navegador, que
 * o devolve a esse mesmo aviso, de onde ele veio. Sem nada para trás no
 * histórico (link aberto direto), não há volta que leve a algum lugar útil, e
 * o botão não aparece.
 */
function Topo() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const aviso = searchParams?.get('aviso') === 'indisponivel';
  const { user } = useAuthStore();
  const isDesktop = useIsDesktop();

  let voltar = { href: '/perfil', label: 'o perfil' };
  if (isViewerOnly(user) && !isDesktop) {
    // Só no cliente: a guarda não monta o conteúdo antes de o perfil chegar.
    const temHistorico = typeof window !== 'undefined' && window.history.length > 1;
    voltar = temHistorico ? { aoClicar: () => router.back(), label: 'a tela anterior' } : null;
  }

  return (
    <>
      <CabecalhoAjuda
        voltar={voltar}
        titulo="Ajuda e tutoriais"
        descricao="Vídeos curtos, um passo de cada vez, para cada coisa que dá para fazer no Viston."
      />
      {aviso && (
        <p role="status" className="anim-fade-up" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: T.accentSoft, border: `1px solid ${T.accentLine}`, borderRadius: R.card, padding: '12px 14px', color: T.text, fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>
          <Info size={17} color={T.accentInk} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          O tutorial desta tela ainda está sendo preparado. Enquanto isso, veja as pastas abaixo.
        </p>
      )}
    </>
  );
}

/**
 * A busca e, enquanto ela está vazia, as pastas.
 *
 * Com algo digitado, os resultados tomam o lugar das pastas em vez de
 * aparecerem por cima delas: duas listas de cartões, uma em cima da outra,
 * deixariam a pessoa sem saber se o que ela procura está nos resultados ou
 * numa pasta lá embaixo. O campo, a linha de situação e os resultados são os
 * mesmos da árvore do computador (ver BuscaAjuda).
 */
function Busca() {
  const [termo, setTermo] = useState('');
  const atrasado = useDebouncedValue(termo, 300);
  const q = atrasado.trim();
  const busca = useHelpSearch(q);
  const buscando = termo.trim().length > 0;
  const resultados = q.length >= 2 ? (busca.data?.results ?? []) : [];

  return (
    <>
      <CampoDeBusca
        termo={termo}
        onTermo={setTermo}
        rotulo="O que você quer fazer?"
        placeholder="Ex.: encaminhar chamado, código do prédio"
        situacao={situacaoDaBusca(termo, q, busca)}
        className="anim-fade-up"
        style={{ marginBottom: 26 }}
      />

      {buscando ? <ResultadosDaBusca resultados={resultados} /> : <Pastas />}
    </>
  );
}

function Pastas() {
  const { data, isLoading, isError, error, refetch, isFetching } = useHelpFolders();

  if (isLoading) {
    return (
      <div className="ajuda-grade" aria-busy="true" aria-label="Carregando as pastas">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} style={{ height: 132, borderRadius: R.card }} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EstadoDaAjuda
        titulo="Não deu para abrir a central agora"
        texto={mensagemDoErro(error, 'Confira a conexão e tente de novo.')}
        acao={
          <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw size={15} aria-hidden="true" /> Tentar de novo
          </Button>
        }
      />
    );
  }

  // A API já não manda pasta vazia; o filtro fica para o caso de uma resposta
  // antiga em cache, para a regra valer dos dois lados.
  const pastas = (data?.folders ?? []).filter((p) => (p.feature_count ?? 0) > 0);
  if (pastas.length === 0) {
    return (
      <EstadoDaAjuda
        titulo="A central ainda está vazia"
        texto="Os tutoriais estão sendo preparados. Volte em breve."
      />
    );
  }

  const minhas = pastas.filter((p) => p.mine);
  const outras = pastas.filter((p) => !p.mine);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {minhas.length > 0 && <GrupoDePastas titulo="Seu cargo" pastas={minhas} />}
      {outras.length > 0 && <GrupoDePastas titulo={minhas.length > 0 ? 'Outros cargos' : 'Pastas'} pastas={outras} />}
    </div>
  );
}

function GrupoDePastas({ titulo, pastas }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="anim-fade-up anim-d1">
      <h2 id={id} style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 16, color: T.text, marginBottom: 12 }}>
        {titulo}
      </h2>
      <ul className="ajuda-grade" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {pastas.map((p) => (
          <li key={p.id}>
            <CartaoDaPasta pasta={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** O cartão de uma pasta. Só chega aqui pasta com tutorial publicado. */
function CartaoDaPasta({ pasta }) {
  const n = pasta.feature_count ?? 0;
  return (
    <Link href={`/ajuda/${pasta.slug}`} className="ajuda-cartao" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, height: '100%' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="ajuda-icone">
          <IconeDaPasta nome={pasta.icon} size={20} />
        </span>
        {pasta.mine && <Badge variant="accent">Seu cargo</Badge>}
      </span>
      <span style={{ display: 'block' }}>
        <span style={{ display: 'block', fontFamily: T.display, fontWeight: W.title, fontSize: 16, color: T.text }}>{pasta.title}</span>
        {pasta.description && (
          <span style={{ display: 'block', color: T.mute, fontSize: 14, lineHeight: 1.5, marginTop: 4 }}>{pasta.description}</span>
        )}
      </span>
      <span style={{ display: 'block', color: T.text, fontSize: 13, marginTop: 'auto' }}>
        {n === 1 ? '1 tutorial' : `${n} tutoriais`}
      </span>
    </Link>
  );
}

/**
 * O começo da central no computador.
 *
 * Uma linha que diz como a tela funciona e, embaixo, os tutoriais de cada
 * pasta do seu cargo, em cartões: é o que a maioria abre, e assim fica a um
 * clique. As outras pastas estão na árvore ao lado, e não se repetem aqui.
 */
function InicioNaMesa() {
  const searchParams = useSearchParams();
  const aviso = searchParams?.get('aviso') === 'indisponivel';
  const { data, isLoading, isError, error, refetch, isFetching } = useHelpFolders();
  const pastas = (data?.folders ?? []).filter((p) => (p.feature_count ?? 0) > 0);
  const minhas = pastas.filter((p) => p.mine);
  const conteudos = useHelpFolderContents(minhas.map((p) => ({ slug: p.slug, enabled: true })));

  let corpo;
  if (isLoading) {
    corpo = (
      <div aria-busy="true" aria-label="Carregando os tutoriais" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 780 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 96, borderRadius: R.card }} />)}
      </div>
    );
  } else if (isError) {
    corpo = (
      <EstadoDaAjuda
        titulo="Não deu para abrir a central agora"
        texto={mensagemDoErro(error, 'Confira a conexão e tente de novo.')}
        acao={
          <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw size={15} aria-hidden="true" /> Tentar de novo
          </Button>
        }
      />
    );
  } else if (pastas.length === 0) {
    corpo = <EstadoDaAjuda titulo="A central ainda está vazia" texto="Os tutoriais estão sendo preparados. Volte em breve." />;
  } else if (minhas.length === 0) {
    corpo = (
      <EstadoDaAjuda
        titulo="Escolha uma pasta ao lado"
        texto="Cada pasta reúne os tutoriais de um cargo. Abra a que tem o que você quer fazer, ou use a busca."
      />
    );
  } else {
    corpo = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
        {minhas.map((p, i) => (
          <TutoriaisDoCargo key={p.id} pasta={p} consulta={conteudos[i]} />
        ))}
      </div>
    );
  }

  return (
    <>
      <header className="ajuda-topo ajuda-topo--mesa anim-fade-down">
        <h2 style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 22, color: T.text, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          Comece pelo seu cargo
        </h2>
        <p style={{ color: T.mute, fontSize: 15, lineHeight: 1.55, marginTop: 6, maxWidth: 640 }}>
          Vídeos curtos, um passo de cada vez. Os do seu cargo estão aqui; os dos outros cargos, nas pastas ao lado.
        </p>
      </header>
      {aviso && (
        <p role="status" className="anim-fade-up" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: T.accentSoft, border: `1px solid ${T.accentLine}`, borderRadius: R.card, padding: '12px 14px', color: T.text, fontSize: 14, lineHeight: 1.5, marginBottom: 18, maxWidth: 780 }}>
          <Info size={17} color={T.accentInk} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          O tutorial desta tela ainda está sendo preparado. Enquanto isso, veja as pastas ao lado.
        </p>
      )}
      {corpo}
    </>
  );
}

/** Uma pasta do seu cargo no começo da central: o nome dela e os cartões. */
function TutoriaisDoCargo({ pasta, consulta }) {
  const tituloId = useId();
  const features = consulta?.data?.features ?? [];

  return (
    <section aria-labelledby={tituloId} className="anim-fade-up anim-d1" style={{ maxWidth: 780 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span className="ajuda-icone" style={{ width: 32, height: 32 }}>
          <IconeDaPasta nome={pasta.icon} size={16} />
        </span>
        <h3 id={tituloId} style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 16, color: T.text }}>
          {pasta.title}
        </h3>
        <Link href={`/ajuda/${pasta.slug}`} className="link-acao" style={{ marginLeft: 'auto', color: T.mute, fontSize: 13 }}>
          Abrir a pasta
        </Link>
      </div>
      {consulta?.isLoading ? (
        <div aria-busy="true" aria-label={`Carregando os tutoriais de ${pasta.title}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1].map((i) => <Skeleton key={i} style={{ height: 96, borderRadius: R.card }} />)}
        </div>
      ) : consulta?.isError ? (
        <EstadoDaAjuda
          titulo="Não deu para abrir esta pasta"
          texto={mensagemDoErro(consulta.error, 'Confira a conexão e tente de novo.')}
          acao={
            <Button variant="secondary" onClick={() => consulta.refetch()} loading={consulta.isFetching}>
              <RefreshCw size={15} aria-hidden="true" /> Tentar de novo
            </Button>
          }
        />
      ) : (
        <ListaDeTutoriais pasta={pasta.slug} features={features} rotulo={`Tutoriais de ${pasta.title}`} />
      )}
    </section>
  );
}
