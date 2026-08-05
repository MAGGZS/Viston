'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Share2, Building2 } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button, Input, Modal } from '@/app/components/ui';
import { useBuildings, useCreateBuilding, useUpdateBuilding, useDeleteBuilding } from '@/app/hooks/useApi';

export default function AdminPrediosPage() {
  const router = useRouter();
  const { data: buildings = [], isLoading } = useBuildings();
  const createBuilding = useCreateBuilding();
  const updateBuilding = useUpdateBuilding();
  const deleteBuilding = useDeleteBuilding();

  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(null);   // building object
  const [deleteModal, setDeleteModal] = useState(null); // building object
  const [shareModal, setShareModal] = useState(null);  // building object
  const [form, setForm] = useState({ name: '', description: '' });

  function openCreate() { setForm({ name: '', description: '' }); setCreateModal(true); }
  function openEdit(b) { setForm({ name: b.name, description: b.description || '' }); setEditModal(b); }

  async function handleCreate() {
    try { await createBuilding.mutateAsync(form); setCreateModal(false); }
    catch (e) { alert(e?.response?.data?.error?.message || 'Erro ao criar'); }
  }

  async function handleEdit() {
    try { await updateBuilding.mutateAsync({ id: editModal.id, ...form }); setEditModal(null); }
    catch (e) { alert(e?.response?.data?.error?.message || 'Erro ao editar'); }
  }

  async function handleDelete() {
    try { await deleteBuilding.mutateAsync(deleteModal.id); setDeleteModal(null); }
    catch (e) { alert(e?.response?.data?.error?.message || 'Erro ao excluir'); }
  }

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-[#0D0D0D]">
        <AdminSidebar />
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-white">Prédios</h1>
            <Button onClick={openCreate}><Plus size={16} /> Novo prédio</Button>
          </div>

          {isLoading && (
            <div className="grid grid-cols-3 gap-4">
              {[1,2,3].map(i => <div key={i} className="h-40 bg-[#1A1A1A] rounded-2xl animate-pulse" />)}
            </div>
          )}

          {!isLoading && buildings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Building2 size={48} className="text-[#2A2A2A] mb-4" />
              <p className="text-white font-semibold text-lg">Nenhum prédio cadastrado</p>
              <p className="text-[#9A9A9A] text-sm mt-1">Crie o primeiro prédio para começar</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {buildings.map((b) => (
              <div key={b.id} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5 flex flex-col gap-4 hover:border-[#3A3A3A] transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-base truncate">{b.name}</p>
                    {b.description && <p className="text-[#9A9A9A] text-sm mt-1 line-clamp-2">{b.description}</p>}
                  </div>
                </div>
                <div className="flex gap-2 mt-auto">
                  <button onClick={() => router.push(`/desktop/admin/predios/${b.id}`)}
                    className="flex-1 bg-[#F5C518] text-black rounded-xl py-2 text-sm font-semibold hover:bg-[#E0B400] transition-colors">
                    Abrir
                  </button>
                  <button onClick={() => setShareModal(b)} className="w-9 h-9 flex items-center justify-center bg-[#2A2A2A] rounded-xl text-[#9A9A9A] hover:text-white transition-colors">
                    <Share2 size={15} />
                  </button>
                  <button onClick={() => openEdit(b)} className="w-9 h-9 flex items-center justify-center bg-[#2A2A2A] rounded-xl text-[#9A9A9A] hover:text-white transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setDeleteModal(b)} className="w-9 h-9 flex items-center justify-center bg-[#2A2A2A] rounded-xl text-red-500 hover:text-red-400 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      <div className="lg:hidden flex items-center justify-center min-h-screen bg-[#0D0D0D] p-6 text-center">
        <div>
          <p className="text-4xl mb-4">🖥️</p>
          <p className="text-white font-bold text-lg">Painel Admin</p>
          <p className="text-[#9A9A9A] text-sm mt-2">Acesse pelo computador</p>
        </div>
      </div>

      {/* Modal criar */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Novo prédio">
        <div className="flex flex-col gap-4">
          <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="flex gap-3 mt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCreateModal(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleCreate} loading={createBuilding.isPending}>Criar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal editar */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="Editar prédio">
        <div className="flex flex-col gap-4">
          <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="flex gap-3 mt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditModal(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleEdit} loading={updateBuilding.isPending}>Salvar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal excluir */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Excluir prédio">
        <p className="text-[#9A9A9A] text-sm mb-6">Tem certeza que deseja excluir <span className="text-white font-semibold">{deleteModal?.name}</span>? Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteModal(null)}>Cancelar</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleDelete} loading={deleteBuilding.isPending}>Excluir</Button>
        </div>
      </Modal>

      {/* Modal compartilhar ID */}
      <Modal open={!!shareModal} onClose={() => setShareModal(null)} title="ID do prédio">
        <p className="text-[#9A9A9A] text-sm mb-4">Compartilhe este ID com inspetores e visualizadores para que possam solicitar acesso ao prédio <span className="text-white font-semibold">{shareModal?.name}</span>.</p>
        <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between gap-3">
          <span className="text-[#F5C518] font-mono text-sm break-all">{shareModal?.id}</span>
          <button onClick={() => { navigator.clipboard.writeText(shareModal?.id); }}
            className="text-xs text-[#9A9A9A] hover:text-white whitespace-nowrap border border-[#2A2A2A] rounded-lg px-3 py-1.5 transition-colors">
            Copiar
          </button>
        </div>
      </Modal>
    </RouteGuard>
  );
}
