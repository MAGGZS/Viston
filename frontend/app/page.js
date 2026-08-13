'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';
import { isAdmin, isManagerAccount } from '@/app/lib/roles';

export default function RootPage() {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    // A conta de gestor tem uma área só dela, sem sidebar e igual nos dois
    // tamanhos — inclusive quando ainda não cadastrou prédio nenhum, que é
    // justamente onde ela cadastra o primeiro.
    if (isManagerAccount(user)) {
      router.replace('/gestor');
      return;
    }

    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;

    if (isDesktop) {
      router.replace(isAdmin(user) ? '/desktop/admin/dashboard' : '/desktop/visualizacao');
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
