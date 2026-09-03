'use client';
import { Building2, Layers, BarChart3, ClipboardList, Users, ShieldCheck, Eye, Hourglass, RefreshCw } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button, StatCard } from '@/app/components/ui';
import { useSystemStats } from '@/app/hooks/useApi';
import { T, NUM } from '@/app/lib/theme';
import { CONTENT_ID } from '@/app/components/mobile/kit';

/**
 * Composição das contas ativas.
 *
 * Barra proporcional em vez de gráfico: são quatro fatias e o que importa é a
 * ordem de grandeza entre elas.
 */
function RoleBreakdown({ stats, loading }) {
  const rows = [
    { label: 'Gestores', value: stats?.managers ?? 0, color: T.accentInk },
    { label: 'Inspetores', value: stats?.inspectors ?? 0, color: T.success },
    { label: 'Visualizadores', value: stats?.viewers ?? 0, color: T.info },
  ];
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="bg-card rounded-card p-6">
      <h2 className="text-ink font-semibold mb-1">Contas ativas por papel</h2>
      <p className="text-mute text-sm mb-5">
        Administradores não entram na conta — o papel deles não vem de vínculo com prédio.
      </p>

      {loading ? (
        <div className="h-24 bg-chip rounded-control animate-pulse" />
      ) : total === 0 ? (
        <p className="text-mute text-sm py-6 text-center">Nenhuma conta ativa ainda</p>
      ) : (
        <>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: T.chip }}>
            {rows.map((r) => (
              r.value > 0 && (
                <div key={r.label} style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />
              )
            ))}
          </div>
          <div className="flex flex-col gap-2 mt-5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-3">
                <span style={{ width: 10, height: 10, borderRadius: 3, background: r.color, flexShrink: 0 }} />
                <span className="text-mute text-sm flex-1">{r.label}</span>
                <span className="text-ink text-sm font-semibold" style={NUM}>{r.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Os prédios com mais andares — a leitura mais direta de porte no sistema. */
function TopBuildings({ stats, loading }) {
  const rows = stats?.topBuildings ?? [];

  return (
    <div className="bg-card rounded-card p-6">
      <h2 className="text-ink font-semibold mb-1">Maiores prédios</h2>
      <p className="text-mute text-sm mb-5">Por quantidade de andares cadastrados.</p>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-9 bg-chip rounded-control animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-mute text-sm py-6 text-center">Nenhum prédio cadastrado</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((b, idx) => (
            <div key={b.id} className={`anim-fade-in anim-d${Math.min(idx + 1, 6)} flex items-center gap-3 bg-chip rounded-control px-4 py-2.5`}>
              <span className="text-faint text-xs" style={{ ...NUM, width: 16 }}>{idx + 1}</span>
              <span className="text-ink text-sm flex-1 truncate">{b.name}</span>
              <span className="text-accent-ink text-sm font-semibold" style={NUM}>{b.floors}</span>
              <span className="text-faint text-xs">andares</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { data: stats, isLoading, refetch, isFetching } = useSystemStats();

  const cards = [
    { icon: Building2, label: 'Prédios no sistema', value: stats?.buildings ?? 0 },
    { icon: BarChart3, label: 'Média de andares', value: stats?.averageFloors ?? 0, hint: `${stats?.floors ?? 0} andares no total` },
    { icon: ClipboardList, label: 'Vistorias concluídas', value: stats?.completedInspections ?? 0 },
    { icon: Users, label: 'Contas ativas', value: stats?.activeUsers ?? 0 },
    { icon: ShieldCheck, label: 'Gestores', value: stats?.managers ?? 0 },
    { icon: Layers, label: 'Inspetores', value: stats?.inspectors ?? 0 },
    { icon: Eye, label: 'Visualizadores', value: stats?.viewers ?? 0 },
    { icon: Hourglass, label: 'Solicitações pendentes', value: stats?.pendingRequests ?? 0, hint: 'Aguardando um gestor' },
  ];

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-page">
        <AdminSidebar />
        <main id={CONTENT_ID} className="flex-1 px-6 py-8 overflow-auto">
          <div className="anim-fade-down flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold text-ink">Visão geral</h1>
              <p className="text-mute text-sm mt-0.5">Os números do sistema inteiro.</p>
            </div>
            <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw size={15} /> Atualizar
            </Button>
          </div>

          {/* Sem invólucro entre a grade e o cartão: como filho direto, cada
              cartão estica até a altura da linha, e os números da fileira —
              empurrados para baixo pelo `marginTop: auto` do StatCard — ficam
              todos na mesma altura, mesmo nos dois cartões que têm dica. */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {cards.map((card, idx) => (
              <StatCard
                key={card.label}
                {...card}
                loading={isLoading}
                className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
              />
            ))}
          </div>

          <div className="anim-fade-up anim-d5 grid grid-cols-2 gap-6">
            <RoleBreakdown stats={stats} loading={isLoading} />
            <TopBuildings stats={stats} loading={isLoading} />
          </div>
        </main>
      </div>

      <div className="lg:hidden flex items-center justify-center min-h-screen bg-page p-6 text-center">
        <div>
          <p className="text-4xl mb-4">🖥️</p>
          <p className="text-ink font-semibold text-lg">Painel Admin</p>
          <p className="text-mute text-sm mt-2">Acesse pelo computador</p>
        </div>
      </div>
    </RouteGuard>
  );
}
