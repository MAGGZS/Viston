'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Share2, Building2, RefreshCw, X, AlertTriangle } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button, Input, Modal } from '@/app/components/ui';
import { useToastStore } from '@/app/store/toast';
import { useBuildings, useCreateBuilding, useUpdateBuilding, useDeleteBuilding, useCreateFloor, useDeleteFloor, useFloors } from '@/app/hooks/useApi';
import { formatShareKey } from '@/app/lib/shareKey';

// Modal de confirmação reutilizável
function ConfirmModal({ open, title, message, confirmLabel = 'Confirmar', confirmVariant = 'danger', onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6 }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={onCancel}>Voltar</Button>
          <Button variant={confirmVariant} style={{ flex: 1 }} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

// Componente de tags reutilizável
function FloorTags({ labels, onRemove, input, onInputChange, onAdd, max = 20 }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Andares ({labels.length})
        </p>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, minHeight: 36 }}>
        {labels.length === 0 && (
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Nenhum andar adicionado</span>
        )}
        {labels.map(label => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 12px', borderRadius: 20, border: '1px solid rgba(245,197,24,0.3)', background: 'rgba(245,197,24,0.08)' }}>
            <span style={{ color: '#F5C518', fontSize: 13, fontWeight: 600 }}>{label}</span>
            <button onClick={() => onRemove(label)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', padding: 0, lineHeight: 1 }}
              onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '9px 14px', color: 'rgba(255,255,255,0.85)', fontSize: 13, outline: 'none' }}
          placeholder="Ex: 1, 2, Cobertura, Subsolo... (Enter para adicionar)"
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAdd()}
        />
        <Button variant="secondary" onClick={onAdd}><Plus size={15} /></Button>
      </div>
    </div>
  );
}

// Modal único de criação
function CreateBuildingModal({ open, onClose }) {
  const [form, setForm] = useState({ name: '', description: '' });
  const [labels, setLabels] = useState([]);
  const [input, setInput] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const createBuilding = useCreateBuilding();
  const createFloor = useCreateFloor();
  const { show: toast } = useToastStore();

  const isDirty = form.name.trim() !== '' || form.description.trim() !== '' || labels.length > 0;

  function addFloor() {
    const label = input.trim();
    if (!label) return;
    if (labels.includes(label)) { toast('Andar já adicionado', 'error'); return; }
    setLabels(prev => [...prev, label]);
    setInput('');
  }

  function removeFloor(label) {
    setLabels(prev => prev.filter(l => l !== label));
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    if (labels.length === 0) { toast('Adicione ao menos 1 andar', 'error'); return; }
    try {
      const building = await createBuilding.mutateAsync(form);
      for (let i = 0; i < labels.length; i++) {
        await createFloor.mutateAsync({ buildingId: building.id, label: labels[i] });
      }
      toast('Prédio criado!', 'success');
      doClose();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao criar', 'error', e);
    }
  }

  function doClose() {
    setForm({ name: '', description: '' });
    setLabels([]);
    setInput('');
    setConfirmCancel(false);
    onClose();
  }

  function handleClose() {
    if (isDirty) { setConfirmCancel(true); return; }
    doClose();
  }

  return (
    <>
      <Modal open={open && !confirmCancel} onClose={handleClose} title="Novo prédio">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
          <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <FloorTags labels={labels} onRemove={removeFloor} input={input} onInputChange={setInput} onAdd={addFloor} />
          <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={handleClose}>Cancelar</Button>
            <Button style={{ flex: 1 }} onClick={handleCreate} loading={createBuilding.isPending || createFloor.isPending} disabled={!form.name.trim() || labels.length === 0}>
              Criar prédio
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={confirmCancel}
        title="Descartar alterações?"
        message="Você tem informações não salvas. Deseja sair sem criar o prédio?"
        confirmLabel="Descartar"
        onConfirm={doClose}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
}

// Modal único de edição
function EditBuildingModal({ building, open, onClose }) {
  const updateBuilding = useUpdateBuilding();
  const createFloor = useCreateFloor();
  const deleteFloor = useDeleteFloor();
  const { data: floorsData, isLoading: floorsLoading } = useFloors(building?.id);
  const { show: toast } = useToastStore();

  const [form, setForm] = useState({ name: '', description: '' });
  const [labels, setLabels] = useState([]);
  const [input, setInput] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [initForm, setInitForm] = useState({ name: '', description: '' });
  const [initLabels, setInitLabels] = useState([]);

  const dbFloors = floorsData?.floors ?? [];

  useEffect(() => {
    if (!floorsLoading && !initialized && open) {
      const lbls = dbFloors.map(f => f.label);
      setLabels(lbls);
      setInitLabels(lbls);
      setInitialized(true);
    }
  }, [floorsLoading, dbFloors, initialized, open]);

  useEffect(() => {
    if (building) {
      const f = { name: building.name, description: building.description || '' };
      setForm(f);
      setInitForm(f);
    }
  }, [building]);

  const isDirty = form.name !== initForm.name ||
    form.description !== initForm.description ||
    JSON.stringify([...labels].sort()) !== JSON.stringify([...initLabels].sort());

  function doClose() {
    setInitialized(false);
    setLabels([]);
    setInitLabels([]);
    setInput('');
    setConfirmCancel(false);
    onClose();
  }

  function handleClose() {
    if (isDirty) { setConfirmCancel(true); return; }
    doClose();
  }

  function addFloor() {
    const label = input.trim();
    if (!label) return;
    if (labels.includes(label)) { toast('Andar já adicionado', 'error'); return; }
    setLabels(prev => [...prev, label]);
    setInput('');
  }

  function removeFloor(label) {
    if (labels.length <= 1) { toast('Mínimo de 1 andar obrigatório', 'error'); return; }
    setLabels(prev => prev.filter(l => l !== label));
  }

  async function handleSave() {
    if (!form.name.trim() || labels.length === 0) return;
    try {
      await updateBuilding.mutateAsync({ id: building.id, ...form });
      const dbLabels = dbFloors.map(f => f.label);
      const toAdd = labels.filter(l => !dbLabels.includes(l));
      const toRemove = dbFloors.filter(f => !labels.includes(f.label));
      for (const floor of toRemove) {
        await deleteFloor.mutateAsync({ buildingId: building.id, floorId: floor.id });
      }
      for (let i = 0; i < toAdd.length; i++) {
        await createFloor.mutateAsync({ buildingId: building.id, label: toAdd[i] });
      }
      toast('Prédio atualizado!', 'success');
      doClose();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao salvar', 'error', e);
    }
  }

  if (!building) return null;
  const isSaving = updateBuilding.isPending || createFloor.isPending || deleteFloor.isPending;

  return (
    <>
      <Modal open={open && !confirmCancel} onClose={handleClose} title={`Editar — ${building.name}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
          <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          {floorsLoading || !initialized
            ? <div style={{ height: 80, background: 'rgba(255,255,255,0.04)', borderRadius: 12 }} />
            : <FloorTags labels={labels} onRemove={removeFloor} input={input} onInputChange={setInput} onAdd={addFloor} />
          }
          <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={handleClose}>Cancelar</Button>
            <Button style={{ flex: 1 }} onClick={handleSave} loading={isSaving} disabled={!form.name.trim() || labels.length === 0}>Salvar</Button>
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={confirmCancel}
        title="Descartar alterações?"
        message="Você tem alterações não salvas. Deseja sair sem salvar?"
        confirmLabel="Descartar"
        onConfirm={doClose}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
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
    catch (e) { toast(e?.response?.data?.error?.message || 'Erro ao excluir', 'error', e); }
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
            {buildings.map((b, idx) => (
              <div key={b.id} className={`anim-fade-up anim-d${Math.min(idx + 1, 6)} bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5 flex flex-col gap-4 hover:border-[#3A3A3A] hover:-translate-y-1 transition-all duration-200`}>
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
      <EditBuildingModal building={editModal} open={!!editModal} onClose={() => setEditModal(null)} />

      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Excluir prédio">
        <p className="text-[#9A9A9A] text-sm mb-6">Tem certeza que deseja excluir <span className="text-white font-semibold">{deleteModal?.name}</span>? Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteModal(null)}>Cancelar</Button>
          <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleteBuilding.isPending}>Excluir</Button>
        </div>
      </Modal>

      <Modal open={!!shareModal} onClose={() => setShareModal(null)} title="Chave do prédio">
        <p className="text-[#9A9A9A] text-sm mb-4">Compartilhe esta chave com inspetores e visualizadores para que possam solicitar acesso ao prédio <span className="text-white font-semibold">{shareModal?.name}</span>.</p>
        <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between gap-3">
          <span className="text-[#F5C518] font-mono text-sm tracking-widest break-all">{formatShareKey(shareModal?.share_key)}</span>
          <button onClick={() => { navigator.clipboard.writeText(formatShareKey(shareModal?.share_key)); toast('Chave copiada!', 'info'); }}
            className="text-xs text-[#9A9A9A] hover:text-white whitespace-nowrap border border-[#2A2A2A] rounded-lg px-3 py-1.5 transition-colors">
            Copiar
          </button>
        </div>
      </Modal>
    </RouteGuard>
  );
}
