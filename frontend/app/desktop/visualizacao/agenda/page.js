'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { VisualizadorShell, useVisualizadorBuilding } from '@/app/components/VisualizadorShell';
import { AgendaPredio } from '@/app/components/agenda/AgendaPredio';
import { T, W } from '@/app/lib/theme';

/**
 * A agenda do prédio para o visualizador — o supervisor dos inspetores, que
 * pode marcar e corrigir rondas (decisão do proprietário).
 *
 * `?data=yyyy-MM-dd&agendamento=<id>` chega do calendário do painel: abre no
 * mês certo e já com a edição daquele agendamento.
 *
 * `frozen` fica falso: a listagem de vínculos não traz o congelamento do
 * prédio. Se ele estiver inativo, o servidor recusa a escrita e o aviso de
 * plano aparece pelo toast, como no resto do app.
 */
function Conteudo({ ctx }) {
  const params = useSearchParams();

  if (!ctx.supervisiona) {
    return (
      <div style={{ padding: '24px 32px', color: T.mute, fontSize: 14 }}>
        <p style={{ color: T.text, fontWeight: W.strong }}>A agenda é de quem supervisiona o prédio.</p>
        <p style={{ marginTop: 6 }}>Neste prédio sua conta não é de visualizador.</p>
      </div>
    );
  }

  return (
    <AgendaPredio
      key={ctx.buildingId}
      buildingId={ctx.buildingId}
      canEdit
      initialDate={params.get('data') ?? undefined}
      initialScheduleId={params.get('agendamento') ?? undefined}
    />
  );
}

export default function VisualizacaoAgendaPage() {
  // Só os prédios em que a conta supervisiona: quem vistoria num prédio e
  // supervisiona outro chega aqui pelo menu do inspetor, e a agenda abre no
  // prédio em que ele é visualizador — não no último escolhido na mesa dele.
  const ctx = useVisualizadorBuilding({ soOndeSupervisiona: true });

  return (
    <VisualizadorShell ctx={ctx} title="Agenda" subtitle="Quem vistoria o quê, e até quando">
      <Suspense fallback={null}>
        <Conteudo ctx={ctx} />
      </Suspense>
    </VisualizadorShell>
  );
}
