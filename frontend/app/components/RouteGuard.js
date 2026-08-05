'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';
import { Spinner } from '@/app/components/ui';

export function RouteGuard({ children, roles = [] }) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (isLoading || !mounted) return;
    if (!user) { router.replace('/login'); return; }
    if (roles.length > 0 && !roles.includes(user.role)) { router.replace('/'); return; }
  }, [user, isLoading, roles, mounted]);

  if (isLoading || !mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D0D0D]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;
  if (roles.length > 0 && !roles.includes(user.role)) return null;

  // VIEWER não tem acesso no mobile
  if (isMobile && user.role === 'VIEWER') {
    return (
      <div style={{ minHeight: '100vh', background: '#080810', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
        <p style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
          Acesso apenas pelo computador
        </p>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, lineHeight: 1.6 }}>
          Sua conta de visualizador só pode acessar o sistema pelo desktop.
        </p>
      </div>
    );
  }

  return children;
}
