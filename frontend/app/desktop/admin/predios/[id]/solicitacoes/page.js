'use client';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Check, X } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Badge, Skeleton } from '@/app/components/ui';
import { useAccessRequests, useReviewAccessRequest, useBuildingDashboard } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';

const ROLE_LABEL = { ADMIN: 'Admin', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };
const ROLE_VARIANT = { ADMIN: 'accent', INSPECTOR: 'success', VIEWER: 'default' };

export default function SolicitacoesPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: requests = [], isLoading } = useAccessRequests(id);
  const { data: dash } = useBuildingDashboard(id);
  const review = useReviewAccessRequest();
  const { show: toast } = useToastStore();

  async function handle(requestId, status) {
    try {
      await review.mutateAsync({ buildingId: id, requestId, status });
      toast(status === 'APPROVED' ? 'Acesso aprovado!' : 'Solicitação rejeitada', status === 'APPROVED' ? 'success' : 'info');
    }
    catch (e) { toast(e?.response?.data?.error?.message || 'Erro', 'error'); }
  }

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-page">
        <AdminSidebar />
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex items-center gap-4 mb-8">
            <button onClick={() => router.push(`/desktop/admin/predios/${id}`)}
              className="w-9 h-9 flex items-center justify-center bg-chip rounded-control text-mute hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-2xl font-semibold text-white">Solicitações de Acesso</h1>
              {dash?.building?.name && <p className="text-mute text-sm mt-0.5">{dash.building.name}</p>}
            </div>
          </div>

          <div className="bg-card rounded-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  {['Usuário', 'E-mail', 'Perfil', 'Solicitado em', 'Ações'].map(h => (
                    <th key={h} className="text-left px-6 py-4 text-mute text-sm font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && [1,2,3].map(i => (
                  <tr key={i} className="border-b border-line">
                    {[1,2,3,4,5].map(j => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>)}
                  </tr>
                ))}
                {requests.map(r => (
                  <tr key={r.id} className="border-b border-line hover:bg-chip transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                          <span className="text-black text-xs font-semibold">{r.user?.name?.[0]}</span>
                        </div>
                        <span className="text-white text-sm">{r.user?.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-mute text-sm">{r.user?.email}</td>
                    <td className="px-6 py-4">
                      <Badge variant={ROLE_VARIANT[r.user?.role]}>{ROLE_LABEL[r.user?.role]}</Badge>
                    </td>
                    <td className="px-6 py-4 text-mute text-sm">
                      {format(new Date(r.requested_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => handle(r.id, 'APPROVED')} disabled={review.isPending}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-pill bg-accent text-black transition-colors disabled:opacity-50">
                          <Check size={13} /> Aprovar
                        </button>
                        <button onClick={() => handle(r.id, 'REJECTED')} disabled={review.isPending}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-pill bg-chip text-danger transition-colors disabled:opacity-50">
                          <X size={13} /> Rejeitar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && requests.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-mute">Nenhuma solicitação pendente</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      <div className="lg:hidden flex items-center justify-center min-h-screen bg-page p-6 text-center">
        <div><p className="text-4xl mb-4">🖥️</p><p className="text-white font-semibold">Acesse pelo computador</p></div>
      </div>
    </RouteGuard>
  );
}
