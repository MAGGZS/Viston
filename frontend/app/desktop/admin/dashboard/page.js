'use client';
import { Building2, Layers, BarChart3, ClipboardList, Users, ShieldCheck, Eye, Hourglass, RefreshCw } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button } from '@/app/components/ui';
import { useSystemStats } from '@/app/hooks/useApi';
import { T, R, W, NUM } from '@/app/lib/theme';

/** Um número e o que ele significa. Nada além disso. */
function StatCard({ icon: Icon, label, value, hint, loading }) {
  return (
    <div className="bg-card rounded-card p-5 flex items-center gap-4">
      <div className="w-10 h-10 bg-accent-soft rounded-control flex items-center justify-center flex-shrink-0">
        <Icon size={18} className="text-accent" />
      </div>
      <div className="min-w-0">
        <p className="text-mute text-xs">{label}</p>
        {loading ? (
          <div className="h-6 w-14 bg-chip rounded animate-pulse mt-1" />
        ) : (
          <p className="text-white text-xl font-semibold" style={NUM}>{value}</p>
        )}
        {hint && <p className="text-faint text-xs mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Composição das contas ativas.
 *
 * Barra proporcional em vez de gráfico: são quatro fatias e o que importa é a
 * ordem de grandeza entre elas.
 */
function RoleBreakdown({ stats, loading }) {
  const rows = [
    { label: 'Gestores', value: stats?.managers ?? 0, color: T.accent },
    { label: 'Inspetores', value: stats?.inspectors ?? 0, color: '#4ade80' },
    { label: 'Visualizadores', value: stats?.viewers ?? 0, color: '#a5b4fc' },
  ];
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="bg-card rounded-card p-6">
      <h2 className="text-white font-semibold mb-1">Contas ativas por papel</h2>
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
                <span className="text-white text-sm font-semibold" style={NUM}>{r.value}</span>
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
      <h2 className="text-white font-semibold mb-1">Maiores prédios</h2>
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
            <div key={b.id} className="flex items-center gap-3 bg-chip rounded-control px-4 py-2.5">
              <span className="text-faint text-xs" style={{ ...NUM, width: 16 }}>{idx + 1}</span>
              <span className="text-white text-sm flex-1 truncate">{b.name}</span>
              <span className="text-accent text-sm font-semibold" style={NUM}>{b.floors}</span>
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
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold text-white">Visão geral</h1>
              <p className="text-mute text-sm mt-0.5">Os números do sistema inteiro.</p>
            </div>
            <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw size={15} /> Atualizar
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6">
            {cards.map((card, idx) => (
              <div key={card.label} className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}>
                <StatCard {...card} loading={isLoading} />
              </div>
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
          <p className="text-white font-semibold text-lg">Painel Admin</p>
          <p className="text-mute text-sm mt-2">Acesse pelo computador</p>
        </div>
      </div>
    </RouteGuard>
  );
}
