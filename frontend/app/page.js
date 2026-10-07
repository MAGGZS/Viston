'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';
import { Logo } from '@/app/components/Logo';
import { destinoNoComputador } from '@/app/components/TelaPorLargura';
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
      // No computador ele tem mesa própria — painel, quadro e históricos.
      router.replace(isDesktop ? '/responsavel/painel' : '/responsavel');
      return;
    }

    // No computador, a mesma escolha de `destinoNoComputador`: quem vistoria vai
    // para a mesa do inspetor (inclusive quem só acompanha outro prédio), e
    // quem só acompanha — ou ainda não tem prédio — para a visualização.
    router.replace(isDesktop ? destinoNoComputador(user) : '/home');
  }, [isLoading, user, router]);

  return (
    <div className="min-h-screen bg-page flex items-center justify-center">
      {/* A marca salta e depois pulsa: a tela existe por um instante, entre o
          perfil carregar e o redirecionamento, e sem nada nela parece travada.

          Os dois em elementos separados de propósito. Na mesma classe, `pop-in`
          e `pulse` disputam a propriedade `animation` e só um sobrevive à
          cascata — o salto some e fica só a pulsação. */}
      <div className="anim-pop-in">
        <div className="animate-pulse">
          <Logo variant="mark" size={20} />
        </div>
      </div>
    </div>
  );
}
