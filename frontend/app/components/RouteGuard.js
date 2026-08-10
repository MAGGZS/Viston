'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { Spinner } from '@/app/components/ui';
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

export function RouteGuard({ children, roles = [] }) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (roles.length > 0 && !roles.includes(user.role)) { router.replace('/'); return; }
  }, [user, isLoading, roles, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;
  if (roles.length > 0 && !roles.includes(user.role)) return null;

  /**
   * VIEWER não tem acesso no mobile.
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
  if (user.role === 'VIEWER') {
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
