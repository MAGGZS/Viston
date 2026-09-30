'use client';
import { useEffect, useRef } from 'react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { ResponsavelSidebar } from '@/app/components/ResponsavelSidebar';
import { NotificacaoChamados } from '@/app/components/NotificacaoChamados';
import { SoNoComputador } from '@/app/components/TelaPorLargura';
import { CONTENT_ID } from '@/app/components/mobile/kit';
import { useMyTickets } from '@/app/hooks/useApi';
import { MAINTENANCE_TYPES, labelOf } from '@/app/lib/maintenanceOptions';
import { memberships } from '@/app/lib/roles';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';
import { T, W } from '@/app/lib/theme';

/** De quanto em quanto tempo a mesa pergunta se chegou chamado novo. */
const INTERVALO_DE_AVISO = 60_000;

/**
 * O aviso do chamado que chegou enquanto a tela estava aberta.
 *
 * No telefone o sino basta: a pessoa abre o app, olha, fecha. No computador a
 * mesa fica aberta a manhã inteira, e um chamado encaminhado às dez só seria
 * visto quando alguém recarregasse a página. Aqui a lista é pedida de novo a
 * cada minuto (e ao voltar para a aba), e o que aparece de novo em "a receber"
 * vira um aviso na tela e um número no título da aba — que é o que se vê com a
 * janela atrás de outra.
 *
 * O primeiro retrato não avisa nada: o que já estava lá na chegada não é novo,
 * e abrir a tela com cinco avisos empilhados seria barulho, não notícia.
 */
function useAvisoDeChamadosNovos() {
  const { data } = useMyTickets(true, true, {
    refetchInterval: INTERVALO_DE_AVISO,
    refetchOnWindowFocus: true,
  });
  const { show: toast } = useToastStore();
  const vistos = useRef(null);

  const pendentes = (data?.tickets ?? []).filter((t) => t.status === 'ENCAMINHADO');

  useEffect(() => {
    if (!data) return;
    const ids = new Set(pendentes.map((t) => t.id));

    if (vistos.current) {
      const novos = pendentes.filter((t) => !vistos.current.has(t.id));
      if (novos.length === 1) {
        const t = novos[0];
        toast(
          `Chamado novo: ${labelOf(MAINTENANCE_TYPES, t.maintenance_type)} em ${t.report?.building?.name ?? 'um prédio'}`,
          'info'
        );
      } else if (novos.length > 1) {
        toast(`${novos.length} chamados novos encaminhados a você`, 'info');
      }
    }
    vistos.current = ids;
    // `pendentes` deriva de `data`: seguir os dois faria o efeito rodar a cada
    // render, e cada rodada compararia a lista com ela mesma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // O número no título da aba, e o título de volta ao sair.
  const total = pendentes.length;
  useEffect(() => {
    const original = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = total > 0 ? `(${total}) ${original}` : original;
    return () => { document.title = original; };
  }, [total]);
}

/**
 * A casca das telas do responsável no computador: barra lateral fixa e o
 * conteúdo ao lado — a mesma forma das mesas do moderador e do gestor, para
 * quem passa de uma para a outra não reaprender onde as coisas ficam.
 *
 * O sino mora no cabeçalho de todas as telas, e não só no painel: o chamado
 * que chega é notícia em qualquer uma delas.
 */
export function ResponsavelShell({ title, subtitle, actions, children }) {
  const { user } = useAuthStore();
  useAvisoDeChamadosNovos();

  const predios = memberships(user).filter((m) => m.role === 'RESPONSAVEL');
  const marca = predios.length === 1 ? predios[0].name : 'Responsável';

  return (
    <RouteGuard roles={['RESPONSAVEL']}>
      <SoNoComputador destinoNoCelular="/responsavel">
        <div className="hidden lg:flex" style={{ minHeight: '100vh', background: T.bg }}>
          <ResponsavelSidebar subtitle={marca} />

          <main id={CONTENT_ID} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden' }}>
            {/* Posicionado e acima do miolo: o sino abre uma caixa, e o menu
                de filtros das telas abre listas suspensas — sem z-index aqui o
                conteúdo que vem depois no documento ganharia o empilhamento. */}
            <header className="anim-fade-down" style={{ position: 'relative', zIndex: 20, padding: '28px 32px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title }}>{title}</h1>
                {subtitle && <p style={{ color: T.mute, fontSize: 14, marginTop: 4 }}>{subtitle}</p>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {actions}
                <NotificacaoChamados destino="/responsavel/chamados" />
              </div>
            </header>

            {children}
          </main>
        </div>
      </SoNoComputador>
    </RouteGuard>
  );
}
