'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Avatar } from '@/app/components/Avatar';
import { Logo } from '@/app/components/Logo';
import { useAuthStore } from '@/app/store/auth';
import { T } from '@/app/lib/theme';

/**
 * Topo das telas do gestor.
 *
 * O gestor não tem sidebar: a navegação dele cabe em voltar, marca e perfil.
 * `back` só aparece nas telas internas do prédio.
 */
export function GestorHeader({ back }) {
  const router = useRouter();
  const { user } = useAuthStore();

  return (
    <header className="anim-fade-down" style={{
      position: 'sticky', top: 0, zIndex: 10, height: 60,
      background: T.bg, borderBottom: `1px solid ${T.line}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
        {back && (
          <button
            onClick={() => router.push(back)}
            aria-label="Voltar"
            className="transition-colors duration-150 hover:text-white"
            style={{
              width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.chip, border: 'none', borderRadius: 12, color: T.mute, cursor: 'pointer',
            }}
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <Logo size={17} variant="horizontal" />
      </div>

      <Link href="/perfil" aria-label="Abrir perfil" className="transition-transform duration-150 hover:scale-105">
        <Avatar user={user} size={34} />
      </Link>
    </header>
  );
}
