'use client';
import { createContext, useContext } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { CONTENT_ID, MPage } from '@/app/components/mobile/kit';
import { BottomNav } from '@/app/components/BottomNav';
import { Avatar } from '@/app/components/Avatar';
import { Logo } from '@/app/components/Logo';
import { ArvoreDaAjuda } from '@/app/components/ajuda/ArvoreDaAjuda';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useAuthStore } from '@/app/store/auth';
import { isManager, isViewerOnly } from '@/app/lib/roles';
import { T, R, W } from '@/app/lib/theme';

/**
 * Se a tela está dentro da mesa do computador, com a árvore ao lado. As telas
 * perguntam isto para decidir o que mostrar: com a árvore à esquerda, a volta
 * do cabeçalho e a grade de pastas da central sobram, e o título da tela desce
 * um nível (o `h1` da página é "Ajuda e tutoriais", como "Configurações da
 * conta" no perfil). Fora do layout (no telefone, ou montada sozinha num
 * teste), a resposta é `false` e a tela é a de sempre.
 */
const ComArvore = createContext(false);

export function useComArvore() {
  return useContext(ComArvore);
}

/**
 * A casca da central de ajuda, montada uma vez no `app/ajuda/layout.js`.
 *
 * Um conteúdo só, e não a cópia de telefone e a de computador lado a lado que
 * outras telas usam. O motivo é o player: duas cópias seriam dois `<video>` na
 * mesma página, as duas baixando metadados, e duas listas de abas com os
 * mesmos ids. A largura escolhe a moldura, e o conteúdo entra numa delas.
 *
 * No computador é a forma de "Configurações da conta": a faixa com a marca e o
 * perfil (a central não tem item em menu lateral nenhum, decisão do
 * proprietário, então é esta faixa que dá a saída de volta ao produto), o
 * título no topo e duas colunas soltas na página, sem cartão por trás. A da
 * esquerda é a árvore das pastas, presa no topo ao rolar e com rolagem
 * própria; a divisória dela desce até o fim da página. Morar no layout é o que
 * mantém a árvore como a pessoa a deixou ao trocar de tutorial: o Next troca
 * só a página da direita.
 *
 * No telefone vale o `MPage`, como em toda tela de celular, e o fluxo de
 * sempre, uma tela depois da outra. A `key` pelo caminho faz o `MPage` montar
 * de novo a cada tela, como quando cada página tinha o seu: é o que mantém a
 * entrada de cada tela.
 *
 * `qualquerAparelho` na guarda: o visualizador, que fora daqui só entra pelo
 * computador, também lê a ajuda no telefone.
 */
export function AjudaShell({ children }) {
  const { user } = useAuthStore();
  const isDesktop = useIsDesktop();
  const pathname = usePathname();

  return (
    <RouteGuard qualquerAparelho>
      {isDesktop ? (
        <ComArvore.Provider value>
          <header className="ajuda-faixa">
            <Link href="/" aria-label="Viston, página inicial" className="link-acao" style={{ display: 'inline-flex', color: T.text }}>
              <Logo size={16} variant="horizontal" />
            </Link>
            <Link href="/perfil" className="link-acao" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: T.mute, fontSize: 14 }}>
              Perfil
              <Avatar user={user} size={30} />
            </Link>
          </header>

          <main id={CONTENT_ID} className="ajuda-mesa">
            <h1 className="ajuda-mesa__titulo anim-fade-down" style={{ color: T.text, fontWeight: W.title }}>
              Ajuda e tutoriais
            </h1>
            <div className="ajuda-mesa__grade anim-fade-up anim-d1">
              <nav aria-label="Central de ajuda" className="ajuda-lateral">
                <div className="ajuda-lateral__fixa">
                  <ArvoreDaAjuda />
                </div>
              </nav>
              <div className="ajuda-mesa__conteudo">{children}</div>
            </div>
          </main>
        </ComArvore.Provider>
      ) : (
        <MPage key={pathname}>
          <div className="ajuda-miolo">{children}</div>
          {/* A mesma regra do perfil: o gestor não tem início nem histórico de
              celular, então a barra de baixo não é dele. O visualizador também
              não: as telas para onde ela leva não abrem no telefone dele. */}
          {!isManager(user) && !isViewerOnly(user) && <BottomNav />}
        </MPage>
      )}
    </RouteGuard>
  );
}

/**
 * O topo de cada tela da central: a volta, o rótulo de onde se está e o título.
 *
 * No computador, ao lado da árvore, a volta sai e o título vira `h2` (ver
 * `useComArvore`).
 *
 * A volta é um link com destino fixo, e não o `router.back()`: quem chega pelo
 * "?" de uma tela ou por um link colado numa conversa não tem para onde
 * "voltar" dentro da central, e o histórico do navegador poderia tirá-lo do
 * produto. Subir um nível (tutorial, pasta, central) é sempre o mesmo gesto.
 *
 * A exceção é `voltar.aoClicar`, usado só no topo da central pelo visualizador
 * no telefone: para ele não existe destino fixo que abra (todas as outras telas
 * mostram o aviso de "só pelo computador"), e o gesto passa a ser o voltar do
 * navegador.
 */
export function CabecalhoAjuda({ voltar: voltarPedido, eyebrow, titulo, descricao, extra, icone }) {
  // Na mesa do computador a árvore ao lado já é o caminho de volta, e o título
  // da tela é o segundo nível, abaixo do "Ajuda e tutoriais" da página.
  const comArvore = useComArvore();
  const voltar = comArvore ? null : voltarPedido;
  const Titulo = comArvore ? 'h2' : 'h1';

  return (
    <header className={comArvore ? 'ajuda-topo ajuda-topo--mesa anim-fade-down' : 'ajuda-topo anim-fade-down'}>
      {voltar?.aoClicar ? (
        <button
          type="button"
          onClick={voltar.aoClicar}
          aria-label={`Voltar para ${voltar.label}`}
          className="icone-btn icone-btn--chip"
          style={{ marginBottom: 14 }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      ) : voltar ? (
        <Link
          href={voltar.href}
          aria-label={`Voltar para ${voltar.label}`}
          className="icone-btn icone-btn--chip"
          style={{ marginBottom: 14 }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {icone}
        <div style={{ minWidth: 0, flex: 1 }}>
          {eyebrow && <p style={{ color: T.mute, fontSize: 13, marginBottom: 4 }}>{eyebrow}</p>}
          <Titulo style={{ fontFamily: T.display, fontWeight: W.title, fontSize: comArvore ? 22 : 24, color: T.text, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {titulo}
          </Titulo>
          {descricao && (
            <p style={{ color: T.mute, fontSize: 15, lineHeight: 1.55, marginTop: 6, maxWidth: 640 }}>{descricao}</p>
          )}
          {extra}
        </div>
      </div>
    </header>
  );
}

/** Estado vazio ou de erro, no mesmo cartão em todas as telas da central. */
export function EstadoDaAjuda({ titulo, texto, acao }) {
  return (
    <div style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: '26px 20px', textAlign: 'center' }}>
      <p style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 16, color: T.text }}>{titulo}</p>
      {texto && <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.55, marginTop: 6, maxWidth: 440, marginInline: 'auto' }}>{texto}</p>}
      {acao && <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>{acao}</div>}
    </div>
  );
}
