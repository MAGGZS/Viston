'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { Spinner } from '@/app/components/ui';
import { effectiveRoles, isViewerOnly, managesBuilding, memberships } from '@/app/lib/roles';
import { Monitor } from 'lucide-react';
import { T, W } from '@/app/lib/theme';

/**
 * O que o visualizador vê ao abrir o Viston no celular.
 *
 * Antes a frase só dizia que a conta "só pode acessar pelo desktop", e a pessoa
 * ficava sem saber se era um defeito ou o que fazer. Quase sempre ela pediu
 * acesso pelo celular e foi aprovada como visualizadora, que é o papel de quem
 * só acompanha pelo computador. Os dois caminhos de saída estão na frase: abrir
 * no computador, ou pedir ao gestor outro papel (inspetor, por exemplo, que
 * trabalha no celular).
 *
 * Com mais de um prédio, todos como visualizador (é a única forma de chegar
 * aqui, ver `isViewerOnly`), "neste prédio" deixaria de ser verdade.
 *
 * "Ver tutorial" é a única porta para a central de ajuda que o visualizador tem
 * no telefone: a central abre em qualquer aparelho, mas o perfil e o "?" das
 * telas ficam atrás desta mesma tela. O tutorial é justamente o que explica o
 * aviso.
 */
/** O tutorial que explica por que a conta de visualizador não abre no celular. */
const TUTORIAL_DO_AVISO = '/ajuda/visualizador/visualizador-so-computador';

export function DesktopOnly({ buildings = 1 }) {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
      <Monitor size={44} color={T.mute} aria-hidden="true" style={{ marginBottom: 16 }} />
      <h1 style={{ color: T.text, fontWeight: W.title, fontSize: 18, marginBottom: 8 }}>
        Acesso apenas pelo computador
      </h1>
      <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.6, maxWidth: 340 }}>
        {buildings > 1 ? 'Você é visualizador nos seus prédios.' : 'Você é visualizador neste prédio.'}{' '}
        Abra o Viston no computador ou peça ao gestor para mudar seu papel.
      </p>
      <Link href={TUTORIAL_DO_AVISO} className="link-acao link-acao--acento" style={{ marginTop: 8, padding: '13px 16px', fontSize: 14, fontWeight: W.strong, color: T.accentInk }}>
        Ver tutorial
      </Link>
    </div>
  );
}

/**
 * Guarda de rota.
 *
 * `roles` pergunta pelos papéis que a pessoa ocupa em qualquer prédio — serve
 * às telas que existem para um tipo de uso ("quem vistoria em algum lugar").
 *
 * `manages` pergunta por um prédio específico, e é o que as telas de gestão
 * usam: ser gestor de um prédio não dá direito à tela de outro. Sem isso, o
 * front deixava abrir a tela e só a API dizia não, em 403 espalhados.
 */
export function RouteGuard({ children, roles = [], manages, qualquerAparelho = false }) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();
  const isDesktop = useIsDesktop();

  const allowed =
    !!user &&
    (roles.length === 0 || effectiveRoles(user).some((role) => roles.includes(role))) &&
    (!manages || managesBuilding(user, manages));

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (!allowed) { router.replace('/'); return; }
  }, [user, isLoading, allowed, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page" suppressHydrationWarning>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user || !allowed) return null;

  /**
   * Quem só visualiza não tem acesso no mobile.
   *
   * A decisão é do CSS, não do JS. O `lg:` do Tailwind troca no mesmo frame do
   * resize; o `isDesktop` depende do evento `change` do matchMedia chegar, e
   * enquanto ele não chega o conteúdo mobile já apareceu. Com o par
   * `hidden lg:contents` / `lg:hidden`, abaixo de 1024px não existe frame em que
   * a tela vaze.
   *
   * O JS ainda decide se monta: em mobile estável nada é montado, nenhuma
   * requisição sai. Quando ele fica para trás numa janela larga, o pior caso é
   * o aviso aparecer sozinho — nunca tela em branco — e o listener de `resize`
   * do useMediaQuery corrige em seguida.
   */
  /*
   * `qualquerAparelho` é a tela dizendo que serve também ao visualizador no
   * telefone. Hoje só a central de ajuda pede: ela tem justamente o tutorial
   * que explica por que o resto não abre no celular, e barrá-la ali seria
   * esconder a explicação de quem mais precisa dela.
   */
  if (isViewerOnly(user) && !qualquerAparelho) {
    const buildings = memberships(user).length;
    if (!isDesktop) return <DesktopOnly buildings={buildings} />;
    return (
      <>
        <div className="hidden lg:contents">{children}</div>
        <div className="lg:hidden"><DesktopOnly buildings={buildings} /></div>
      </>
    );
  }

  return children;
}
