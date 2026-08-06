'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Share2, Building2, RefreshCw, X } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button, Input, Modal } from '@/app/components/ui';
import { useToastStore } from '@/app/store/toast';
import { useBuildings, useCreateBuilding, useUpdateBuilding, useDeleteBuilding, useCreateFloor, useDeleteFloor, useFloors } from '@/app/hooks/useApi';

const DEFAULT_FLOORS = ['-5', '-4', '-3', '-2', '-1', '0', '1', '2', '3', '4', '5', '6'];

// Editor de andares reutilizável
function FloorsEditor({ buildingId, onDone }) {
  const { data, isLoading } = useFloors(buildingId);
  const createFloor = useCreateFloor();
  const deleteFloor = useDeleteFloor();
  const { show: toast } = useToastStore();
  const [newLabel, setNewLabel] = useState('');

  const floors = data?.floors ?? [];

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    if (floors.length >= 12) { toast('Máximo de 12 andares atingido', 'error'); return; }
    try {
      await createFloor.mutateAsync({ buildingId, label, order: floors.length });
      setNewLabel('');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao adicionar andar', 'error');
    }
  }

  async function handleDelete(floorId) {
    if (floors.length <= 1) { toast('Mínimo de 1 andar obrigatório', 'error'); return; }
    try {
      await deleteFloor.mutateAsync({ buildingId, floorId });
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao remover andar', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Andares ({floors.length}/12)
        </p>
        <span style={{ fontSize: 11, color: floors.length >= 12 ? '#f87171' : 'rgba(255,255,255,0.25)' }}>
          {floors.length >= 12 ? 'Limite atingido' : `${12 - floors.length} disponíveis`}
        </span>
      </div>

      {isLoading ? (
        <div style={{ height: 80, background: 'rgba(255,255,255,0.04)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {floors.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: 10, padding: '6px 10px' }}>
              <span style={{ color: '#F5C518', fontSize: 13, fontWeight: 600 }}>{f.label}</span>
              <button onClick={() => handleDelete(f.id)} disabled={deleteFloor.isPending}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', padding: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>
                <X size={13} />
              </button>
            </div>
          ))}
          {floors.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Nenhum andar adicionado</p>
          )}
        </div>
      )}

      {floors.length < 12 && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '10px 14px', color: 'rgba(255,255,255,0.85)', fontSize: 14, outline: 'none' }}
            placeholder="Ex: 7, Cobertura, Subsolo..."
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <Button variant="secondary" onClick={handleAdd} loading={createFloor.isPending}>
            <Plus size={15} />
          </Button>
        </div>
      )}

      <Button onClick={onDone} className="w-full">Concluir</Button>
    </div>
  );
}

// Modal de criação em 2 etapas
function CreateBuildingModal({ open, onClose }) {
  const [step, setStep] = useState('info'); // 'info' | 'floors'
  const [form, setForm] = useState({ name: '', description: '' });
  const [createdId, setCreatedId] = useState(null);
  const createBuilding = useCreateBuilding();
  const createFloor = useCreateFloor();
  const { show: toast } = useToastStore();

  async function handleCreate() {
    if (!form.name.trim()) return;
    try {
      const building = await createBuilding.mutateAsync(form);
      // Criar andares padrão
      for (let i = 0; i < DEFAULT_FLOORS.length; i++) {
        await createFloor.mutateAsync({ buildingId: building.id, label: DEFAULT_FLOORS[i], order: i });
      }
      setCreatedId(building.id);
      setStep('floors');
      toast('Prédio criado com andares padrão!', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao criar', 'error');
    }
  }

  function handleClose() {
    setStep('info');
    setForm({ name: '', description: '' });
    setCreatedId(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={step === 'info' ? 'Novo prédio' : 'Configurar andares'}>
      {step === 'info' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
            Serão criados 12 andares padrão (-5 a 6). Você poderá editar na próxima etapa.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={handleClose}>Cancelar</Button>
            <Button style={{ flex: 1 }} onClick={handleCreate} loading={createBuilding.isPending || createFloor.isPending} disabled={!form.name.trim()}>
              Criar e configurar andares
            </Button>
          </div>
        </div>
      ) : (
        <FloorsEditor buildingId={createdId} onDone={handleClose} />
      )}
    </Modal>
  );
}

// Modal de edição de andares para prédio existente
function EditFloorsModal({ building, open, onClose }) {
  const updateBuilding = useUpdateBuilding();
  const { show: toast } = useToastStore();
  const [tab, setTab] = useState('info');
  const [form, setForm] = useState({ name: building?.name || '', description: building?.description || '' });

  async function handleSaveInfo() {
    try {
      await updateBuilding.mutateAsync({ id: building.id, ...form });
      toast('Prédio atualizado!', 'success');
      onClose();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao editar', 'error');
    }
  }

  if (!building) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Editar — ${building.name}`}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['info', 'floors'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === t ? '#F5C518' : 'rgba(255,255,255,0.06)', color: tab === t ? '#000' : 'rgba(255,255,255,0.5)', transition: 'all 0.2s' }}>
            {t === 'info' ? 'Informações' : 'Andares'}
          </button>
        ))}
      </div>

      {tab === 'info' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar</Button>
            <Button style={{ flex: 1 }} onClick={handleSaveInfo} loading={updateBuilding.isPending}>Salvar</Button>
          </div>
        </div>
      ) : (
        <FloorsEditor buildingId={building.id} onDone={onClose} />
      )}
    </Modal>
  );
}

export default function AdminPrediosPage() {
  const router = useRouter();
  const { show: toast } = useToastStore();
  const { data: buildings = [], isLoading, refetch, isFetching } = useBuildings();
  const deleteBuilding = useDeleteBuilding();

  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [shareModal, setShareModal] = useState(null);

  async function handleDelete() {
    try { await deleteBuilding.mutateAsync(deleteModal.id); setDeleteModal(null); toast('Prédio excluído', 'info'); }
    catch (e) { toast(e?.response?.data?.error?.message || 'Erro ao excluir', 'error'); }
  }

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-[#0D0D0D]">
        <AdminSidebar />
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-white">Prédios</h1>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => refetch()} loading={isFetching}><RefreshCw size={15} /> Atualizar</Button>
              <Button onClick={() => setCreateModal(true)}><Plus size={16} /> Novo prédio</Button>
            </div>
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
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-base truncate">{b.name}</p>
                  {b.description && <p className="text-[#9A9A9A] text-sm mt-1 line-clamp-2">{b.description}</p>}
                </div>
                <div className="flex gap-2 mt-auto">
                  <button onClick={() => router.push(`/desktop/admin/predios/${b.id}`)}
                    className="flex-1 bg-[#F5C518] text-black rounded-xl py-2 text-sm font-semibold hover:bg-[#E0B400] transition-colors">
                    Abrir
                  </button>
                  <button onClick={() => setShareModal(b)} className="w-9 h-9 flex items-center justify-center bg-[#2A2A2A] rounded-xl text-[#9A9A9A] hover:text-white transition-colors">
                    <Share2 size={15} />
                  </button>
                  <button onClick={() => setEditModal(b)} className="w-9 h-9 flex items-center justify-center bg-[#2A2A2A] rounded-xl text-[#9A9A9A] hover:text-white transition-colors">
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

      <CreateBuildingModal open={createModal} onClose={() => setCreateModal(false)} />
      <EditFloorsModal building={editModal} open={!!editModal} onClose={() => setEditModal(null)} />

      {/* Modal excluir */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Excluir prédio">
        <p className="text-[#9A9A9A] text-sm mb-6">Tem certeza que deseja excluir <span className="text-white font-semibold">{deleteModal?.name}</span>? Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteModal(null)}>Cancelar</Button>
          <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleteBuilding.isPending}>Excluir</Button>
        </div>
      </Modal>

      {/* Modal compartilhar ID */}
      <Modal open={!!shareModal} onClose={() => setShareModal(null)} title="ID do prédio">
        <p className="text-[#9A9A9A] text-sm mb-4">Compartilhe este ID com inspetores e visualizadores para que possam solicitar acesso ao prédio <span className="text-white font-semibold">{shareModal?.name}</span>.</p>
        <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between gap-3">
          <span className="text-[#F5C518] font-mono text-sm break-all">{shareModal?.id}</span>
          <button onClick={() => { navigator.clipboard.writeText(shareModal?.id); toast('ID copiado!', 'info'); }}
            className="text-xs text-[#9A9A9A] hover:text-white whitespace-nowrap border border-[#2A2A2A] rounded-lg px-3 py-1.5 transition-colors">
            Copiar
          </button>
        </div>
      </Modal>
    </RouteGuard>
  );
}
