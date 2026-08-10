'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';

export default function RootPage() {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    // O gestor tem uma área só dele, sem sidebar e igual nos dois tamanhos
    if (user?.role === 'GESTOR') {
      router.replace('/gestor');
      return;
    }

    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;

    if (isDesktop) {
      if (user?.role === 'ADMIN') router.replace('/desktop/admin/dashboard');
      else router.replace('/desktop/visualizacao');
    } else {
      router.replace('/home');
    }
  }, [isLoading, user, router]);

  return (
    <div className="min-h-screen bg-page flex items-center justify-center">
      <div className="w-9 h-9 bg-[#F5C518] rounded-xl flex items-center justify-center animate-pulse">
        <span className="text-black font-black text-sm">V</span>
      </div>
    </div>
  );
}
