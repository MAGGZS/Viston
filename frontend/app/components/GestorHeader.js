'use client';
import Link from 'next/link';
import { Avatar } from '@/app/components/Avatar';
import { Logo } from '@/app/components/Logo';
import { useAuthStore } from '@/app/store/auth';
import { T } from '@/app/lib/theme';

/**
 * Topo da tela de prédios do gestor.
 *
 * É a única tela dele fora de um prédio, e não tem para onde navegar: quem entra
 * num prédio passa a ter a barra lateral (ver `GestorShell`), que já leva de
 * volta para cá. Aqui bastam a marca e o perfil.
 */
export function GestorHeader() {
  const { user } = useAuthStore();

  return (
    <header className="anim-fade-down" style={{
      position: 'sticky', top: 0, zIndex: 10, height: 60,
      background: T.bg, borderBottom: `1px solid ${T.line}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
        <Logo size={17} variant="horizontal" />
      </div>

      <Link href="/perfil" aria-label="Abrir perfil" className="transition-transform duration-150 hover:scale-105">
        <Avatar user={user} size={34} />
      </Link>
    </header>
  );
}
