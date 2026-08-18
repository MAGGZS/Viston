'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';
import { canInspect, isAdmin, isManagerAccount, isResponsible, memberships } from '@/app/lib/roles';

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

    if (isAdmin(user)) {
      router.replace(isDesktop ? '/desktop/admin/dashboard' : '/home');
      return;
    }

    // Quem modera cai na mesa de chamados: é o produto da conta dele, e as
    // outras telas não mostram fila nenhuma.
    if (memberships(user).some((m) => m.role === 'MODERADOR')) {
      router.replace('/moderador');
      return;
    }

    // O responsável que não vistoria também tem uma tela só dele. Quem faz as
    // duas coisas entra pelo app normal e chega aos chamados pela barra de baixo.
    if (isResponsible(user) && !canInspect(user)) {
      router.replace('/responsavel');
      return;
    }

    router.replace(isDesktop ? '/desktop/visualizacao' : '/home');
  }, [isLoading, user, router]);

  return (
    <div className="min-h-screen bg-page flex items-center justify-center">
      {/* A marca salta e depois pulsa: a tela existe por um instante, entre o
          perfil carregar e o redirecionamento, e sem nada nela parece travada. */}
      <div className="anim-pop-in w-9 h-9 bg-[#F5C518] rounded-xl flex items-center justify-center animate-pulse">
        <span className="text-black font-black text-sm">V</span>
      </div>
    </div>
  );
}
