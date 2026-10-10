'use client';
import { Suspense, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Info, RefreshCw, Search, X } from 'lucide-react';
import { AjudaShell, CabecalhoAjuda, EstadoDaAjuda } from '@/app/components/ajuda/AjudaShell';
import { IconeDaPasta } from '@/app/components/ajuda/IconeDaPasta';
import { Badge, Button, Skeleton } from '@/app/components/ui';
import { useHelpFolders, useHelpSearch } from '@/app/hooks/useAjuda';
import { useDebouncedValue } from '@/app/hooks/useDebouncedValue';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useAuthStore } from '@/app/store/auth';
import { isViewerOnly } from '@/app/lib/roles';
import { linkDaAba } from '@/app/lib/ajuda';
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
 */
export default function AjudaPage() {
  return (
    <AjudaShell>
      <Suspense fallback={null}>
        <Topo />
      </Suspense>
      <Busca />
    </AjudaShell>
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
 * numa pasta lá embaixo.
 *
 * Cada resultado é uma aba, e o link leva direto a ela (`?passo=N`). Quem
 * procura "código do prédio" quer o passo em que se digita o código, e não o
 * começo de um vídeo de um minuto.
 */
function Busca() {
  const [termo, setTermo] = useState('');
  const campo = useRef(null);
  const atrasado = useDebouncedValue(termo, 300);
  const q = atrasado.trim();
  const busca = useHelpSearch(q);
  const campoId = useId();
  const dicaId = useId();
  const buscando = termo.trim().length > 0;

  return (
    <>
      <form
        role="search"
        aria-label="Buscar nos tutoriais"
        onSubmit={(e) => e.preventDefault()}
        className="anim-fade-up"
        style={{ marginBottom: 26 }}
      >
        <label htmlFor={campoId} style={{ display: 'block', color: T.mute, fontSize: 13, marginBottom: 8 }}>
          O que você quer fazer?
        </label>
        <div style={{ position: 'relative' }}>
          <Search size={18} color={T.mute} aria-hidden="true" style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            ref={campo}
            id={campoId}
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Ex.: encaminhar chamado, código do prédio"
            maxLength={100}
            autoComplete="off"
            aria-describedby={dicaId}
            className="ajuda-busca"
          />
          {termo && (
            <button
              type="button"
              onClick={() => {
                setTermo('');
                // O botão some com o campo vazio, e o foco cairia no `body`.
                campo.current?.focus();
              }}
              aria-label="Limpar a busca"
              className="icone-btn icone-btn--compacto"
              // Centrado pela margem, e não por `transform`: um `transform`
              // inline anularia o `scale` do `:active` do `.icone-btn`.
              style={{ position: 'absolute', right: 4, top: 0, bottom: 0, margin: 'auto 0' }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {/* A linha de situação é anunciada (`aria-live`): quem usa leitor de
            tela digita e precisa ouvir quantos resultados vieram sem ter de
            sair do campo para procurá-los. */}
        <p id={dicaId} aria-live="polite" style={{ color: T.mute, fontSize: 13, marginTop: 8, minHeight: 18 }}>
          {situacaoDaBusca(termo, q, busca)}
        </p>
      </form>

      {buscando ? <Resultados busca={busca} q={q} /> : <Pastas />}
    </>
  );
}

function situacaoDaBusca(termo, q, busca) {
  const digitado = termo.trim();
  if (!digitado) return '';
  if (digitado.length < 2) return 'Digite ao menos 2 letras.';
  if (busca.isError) return mensagemDoErro(busca.error, 'Não foi possível buscar agora. Tente de novo.');
  if (busca.isFetching || q !== digitado) return 'Buscando...';
  const n = busca.data?.results?.length ?? 0;
  if (n === 0) return `Nenhum passo fala de "${q}". Tente outra palavra, ou abra a pasta do seu cargo.`;
  return n === 1 ? '1 passo encontrado.' : `${n} passos encontrados.`;
}

function Resultados({ busca, q }) {
  const resultados = q.length >= 2 ? (busca.data?.results ?? []) : [];
  if (resultados.length === 0) return null;

  return (
    <ul aria-label="Resultados da busca" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {resultados.map((r) => (
        <li key={`${r.feature_slug}-${r.step_order}`}>
          <Link
            href={linkDaAba(r.folder_slug, r.feature_slug, r.step_order)}
            className="ajuda-cartao"
            style={{ display: 'block', padding: '14px 16px' }}
          >
            <span style={{ display: 'block', color: T.mute, fontSize: 12 }}>
              {r.folder_title} · {r.feature_title}
            </span>
            <span style={{ display: 'block', color: T.text, fontSize: 15, fontWeight: W.strong, marginTop: 4 }}>
              Passo {r.step_order}. {r.step_title}
            </span>
            {r.snippet && (
              <span style={{ display: 'block', color: T.mute, fontSize: 14, lineHeight: 1.5, marginTop: 4 }}>{r.snippet}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
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
