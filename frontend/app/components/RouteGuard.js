'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { Spinner } from '@/app/components/ui';
import { effectiveRoles, isViewerOnly, managesBuilding } from '@/app/lib/roles';
import { T, W } from '@/app/lib/theme';

/** Aviso de que a conta de visualizador só funciona no desktop. */
function DesktopOnly() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
      <p style={{ color: T.text, fontWeight: W.title, fontSize: 18, marginBottom: 8 }}>
        Acesso apenas pelo computador
      </p>
      <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.6 }}>
        Sua conta de visualizador só pode acessar o sistema pelo desktop.
      </p>
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
export function RouteGuard({ children, roles = [], manages }) {
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
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
  if (isViewerOnly(user)) {
    if (!isDesktop) return <DesktopOnly />;
    return (
      <>
        <div className="hidden lg:contents">{children}</div>
        <div className="lg:hidden"><DesktopOnly /></div>
      </>
    );
  }

  return children;
}
