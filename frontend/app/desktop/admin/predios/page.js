'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Share2, Building2, RefreshCw, X } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button, Input, Modal } from '@/app/components/ui';
import { useToastStore } from '@/app/store/toast';
import { useBuildings, useCreateBuilding, useUpdateBuilding, useDeleteBuilding, useCreateFloor, useDeleteFloor, useFloors } from '@/app/hooks/useApi';

const DEFAULT_FLOORS = ['-5', '-4', '-3', '-2', '-1', '0', '1', '2', '3', '4', '5', '6'];

// Modal único de criação
function CreateBuildingModal({ open, onClose }) {
  const [form, setForm] = useState({ name: '', description: '' });
  const [selected, setSelected] = useState(new Set(DEFAULT_FLOORS));
  const [customInput, setCustomInput] = useState('');
  const [customFloors, setCustomFloors] = useState([]);
  const createBuilding = useCreateBuilding();
  const createFloor = useCreateFloor();
  const { show: toast } = useToastStore();

  function toggleDefault(label) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.size < 12 ? next.add(label) : toast('Máximo de 12 andares', 'error');
      return next;
    });
  }

  function addCustom() {
    const label = customInput.trim();
    if (!label) return;
    if (selected.size + customFloors.filter(f => !selected.has(f)).length >= 12) { toast('Máximo de 12 andares', 'error'); return; }
    if (DEFAULT_FLOORS.includes(label) || customFloors.includes(label)) { toast('Andar já existe', 'error'); return; }
    setCustomFloors(prev => [...prev, label]);
    setSelected(prev => new Set([...prev, label]));
    setCustomInput('');
  }

  function removeCustom(label) {
    setCustomFloors(prev => prev.filter(f => f !== label));
    setSelected(prev => { const next = new Set(prev); next.delete(label); return next; });
  }

  const totalSelected = selected.size;

  async function handleCreate() {
    if (!form.name.trim()) return;
    if (totalSelected === 0) { toast('Selecione ao menos 1 andar', 'error'); return; }
    try {
      const building = await createBuilding.mutateAsync(form);
      const allFloors = [...DEFAULT_FLOORS, ...customFloors].filter(l => selected.has(l));
      for (let i = 0; i < allFloors.length; i++) {
        await createFloor.mutateAsync({ buildingId: building.id, label: allFloors[i], order: i });
      }
      toast('Prédio criado!', 'success');
      handleClose();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao criar', 'error');
    }
  }

  function handleClose() {
    setForm({ name: '', description: '' });
    setSelected(new Set(DEFAULT_FLOORS));
    setCustomFloors([]);
    setCustomInput('');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Novo prédio">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
        <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Input label="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Andares ({totalSelected}/12)
            </p>
            <span style={{ fontSize: 11, color: totalSelected >= 12 ? '#f87171' : 'rgba(255,255,255,0.25)' }}>
              {totalSelected >= 12 ? 'Limite atingido' : `${12 - totalSelected} disponíveis`}
            </span>
          </div>

          {/* Checklist horizontal — andares padrão */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {DEFAULT_FLOORS.map(label => {
              const checked = selected.has(label);
              return (
                <button key={label} onClick={() => toggleDefault(label)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: `1px solid ${checked ? 'rgba(245,197,24,0.4)' : 'rgba(255,255,255,0.1)'}`, background: checked ? 'rgba(245,197,24,0.1)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${checked ? '#F5C518' : 'rgba(255,255,255,0.2)'}`, background: checked ? '#F5C518' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {checked && <span style={{ color: '#000', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ color: checked ? '#F5C518' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600 }}>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Andares customizados */}
          {customFloors.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {customFloors.map(label => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.08)' }}>
                  <span style={{ color: '#a5b4fc', fontSize: 13, fontWeight: 600 }}>{label}</span>
                  <button onClick={() => removeCustom(label)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', padding: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar andar personalizado */}
          {totalSelected < 12 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '9px 14px', color: 'rgba(255,255,255,0.85)', fontSize: 13, outline: 'none' }}
                placeholder="Adicionar andar personalizado (ex: Cobertura)..."
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
              />
              <Button variant="secondary" onClick={addCustom}><Plus size={15} /></Button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={handleClose}>Cancelar</Button>
          <Button style={{ flex: 1 }} onClick={handleCreate} loading={createBuilding.isPending || createFloor.isPending} disabled={!form.name.trim() || totalSelected === 0}>
            Criar prédio
          </Button>
        </div>
      </div>
    </Modal>
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
  const [customInput, setCustomInput] = useState('');
  // Estado local dos andares — só sincroniza com DB ao abrir
  const [localLabels, setLocalLabels] = useState([]);
  const [initialized, setInitialized] = useState(false);

  const dbFloors = floorsData?.floors ?? [];

  // Inicializa estado local quando os dados do DB chegam (apenas uma vez por abertura)
  useEffect(() => {
    if (!floorsLoading && dbFloors.length >= 0 && !initialized) {
      setLocalLabels(dbFloors.map(f => f.label));
      setInitialized(true);
    }
  }, [floorsLoading, dbFloors, initialized]);

  useEffect(() => {
    if (building) setForm({ name: building.name, description: building.description || '' });
  }, [building]);

  // Reset ao fechar
  function handleClose() {
    setInitialized(false);
    setLocalLabels([]);
    setCustomInput('');
    onClose();
  }

  const totalFloors = localLabels.length;

  function toggleFloor(label) {
    if (localLabels.includes(label)) {
      if (totalFloors <= 1) { toast('Mínimo de 1 andar obrigatório', 'error'); return; }
      setLocalLabels(prev => prev.filter(l => l !== label));
    } else {
      if (totalFloors >= 12) { toast('Máximo de 12 andares', 'error'); return; }
      setLocalLabels(prev => [...prev, label]);
    }
  }

  function addCustom() {
    const label = customInput.trim();
    if (!label) return;
    if (totalFloors >= 12) { toast('Máximo de 12 andares', 'error'); return; }
    if (localLabels.includes(label)) { toast('Andar já existe', 'error'); return; }
    setLocalLabels(prev => [...prev, label]);
    setCustomInput('');
  }

  async function handleSave() {
    try {
      // Salva nome/descrição
      await updateBuilding.mutateAsync({ id: building.id, ...form });

      const dbLabels = dbFloors.map(f => f.label);
      // Andares a adicionar (estão no local mas não no DB)
      const toAdd = localLabels.filter(l => !dbLabels.includes(l));
      // Andares a remover (estão no DB mas não no local)
      const toRemove = dbFloors.filter(f => !localLabels.includes(f.label));

      for (const label of toAdd) {
        await createFloor.mutateAsync({ buildingId: building.id, label, order: localLabels.indexOf(label) });
      }
      for (const floor of toRemove) {
        await deleteFloor.mutateAsync({ buildingId: building.id, floorId: floor.id });
      }

      toast('Prédio atualizado!', 'success');
      handleClose();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao salvar', 'error');
    }
  }

  if (!building) return null;

  const extraLabels = localLabels.filter(l => !DEFAULT_FLOORS.includes(l));
  const isSaving = updateBuilding.isPending || createFloor.isPending || deleteFloor.isPending;

  return (
    <Modal open={open} onClose={handleClose} title={`Editar — ${building.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
        <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Input label="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Andares ({totalFloors}/12)
            </p>
            <span style={{ fontSize: 11, color: totalFloors >= 12 ? '#f87171' : 'rgba(255,255,255,0.25)' }}>
              {totalFloors >= 12 ? 'Limite atingido' : `${12 - totalFloors} disponíveis`}
            </span>
          </div>

          {floorsLoading || !initialized ? (
            <div style={{ height: 60, background: 'rgba(255,255,255,0.04)', borderRadius: 12 }} />
          ) : (
            <>
              {/* Checklist horizontal — andares padrão */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {DEFAULT_FLOORS.map(label => {
                  const checked = localLabels.includes(label);
                  return (
                    <button key={label} onClick={() => toggleFloor(label)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: `1px solid ${checked ? 'rgba(245,197,24,0.4)' : 'rgba(255,255,255,0.1)'}`, background: checked ? 'rgba(245,197,24,0.1)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.15s' }}>
                      <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${checked ? '#F5C518' : 'rgba(255,255,255,0.2)'}`, background: checked ? '#F5C518' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {checked && <span style={{ color: '#000', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{ color: checked ? '#F5C518' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600 }}>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Andares extras (não padrão) */}
              {extraLabels.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {extraLabels.map(label => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.08)' }}>
                      <span style={{ color: '#a5b4fc', fontSize: 13, fontWeight: 600 }}>{label}</span>
                      <button onClick={() => toggleFloor(label)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', padding: 0 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Adicionar andar personalizado */}
              {totalFloors < 12 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '9px 14px', color: 'rgba(255,255,255,0.85)', fontSize: 13, outline: 'none' }}
                    placeholder="Adicionar andar personalizado (ex: Cobertura)..."
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustom()}
                  />
                  <Button variant="secondary" onClick={addCustom}><Plus size={15} /></Button>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={handleClose}>Cancelar</Button>
          <Button style={{ flex: 1 }} onClick={handleSave} loading={isSaving} disabled={!form.name.trim() || totalFloors === 0}>Salvar</Button>
        </div>
      </div>
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
      <EditBuildingModal building={editModal} open={!!editModal} onClose={() => setEditModal(null)} />

      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Excluir prédio">
        <p className="text-[#9A9A9A] text-sm mb-6">Tem certeza que deseja excluir <span className="text-white font-semibold">{deleteModal?.name}</span>? Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteModal(null)}>Cancelar</Button>
          <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleteBuilding.isPending}>Excluir</Button>
        </div>
      </Modal>

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
