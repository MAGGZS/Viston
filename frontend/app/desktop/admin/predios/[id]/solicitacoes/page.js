'use client';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Check, X } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Badge, Skeleton } from '@/app/components/ui';
import { useAccessRequests, useReviewAccessRequest, useBuildingDashboard } from '@/app/hooks/useApi';

const ROLE_LABEL = { ADMIN: 'Admin', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };
const ROLE_VARIANT = { ADMIN: 'accent', INSPECTOR: 'success', VIEWER: 'default' };

export default function SolicitacoesPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: requests = [], isLoading } = useAccessRequests(id);
  const { data: dash } = useBuildingDashboard(id);
  const review = useReviewAccessRequest();

  async function handle(requestId, status) {
    try { await review.mutateAsync({ buildingId: id, requestId, status }); }
    catch (e) { alert(e?.response?.data?.error?.message || 'Erro'); }
  }

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-[#0D0D0D]">
        <AdminSidebar />
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex items-center gap-4 mb-8">
            <button onClick={() => router.push(`/desktop/admin/predios/${id}`)}
              className="w-9 h-9 flex items-center justify-center bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-[#9A9A9A] hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Solicitações de Acesso</h1>
              {dash?.building?.name && <p className="text-[#9A9A9A] text-sm mt-0.5">{dash.building.name}</p>}
            </div>
          </div>

          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  {['Usuário', 'E-mail', 'Perfil', 'Solicitado em', 'Ações'].map(h => (
                    <th key={h} className="text-left px-6 py-4 text-[#9A9A9A] text-sm font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && [1,2,3].map(i => (
                  <tr key={i} className="border-b border-[#2A2A2A]">
                    {[1,2,3,4,5].map(j => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>)}
                  </tr>
                ))}
                {requests.map(r => (
                  <tr key={r.id} className="border-b border-[#2A2A2A] hover:bg-[#1E1E1E] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#F5C518] flex items-center justify-center">
                          <span className="text-black text-xs font-bold">{r.user?.name?.[0]}</span>
                        </div>
                        <span className="text-white text-sm">{r.user?.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[#9A9A9A] text-sm">{r.user?.email}</td>
                    <td className="px-6 py-4">
                      <Badge variant={ROLE_VARIANT[r.user?.role]}>{ROLE_LABEL[r.user?.role]}</Badge>
                    </td>
                    <td className="px-6 py-4 text-[#9A9A9A] text-sm">
                      {format(new Date(r.requested_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => handle(r.id, 'APPROVED')} disabled={review.isPending}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-900/30 text-green-400 hover:bg-green-900/50 transition-colors disabled:opacity-50">
                          <Check size={13} /> Aprovar
                        </button>
                        <button onClick={() => handle(r.id, 'REJECTED')} disabled={review.isPending}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors disabled:opacity-50">
                          <X size={13} /> Rejeitar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && requests.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-[#9A9A9A]">Nenhuma solicitação pendente</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      <div className="lg:hidden flex items-center justify-center min-h-screen bg-[#0D0D0D] p-6 text-center">
        <div><p className="text-4xl mb-4">🖥️</p><p className="text-white font-bold">Acesse pelo computador</p></div>
      </div>
    </RouteGuard>
  );
}
