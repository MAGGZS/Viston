'use client';
import { useState, useMemo } from 'react';
import { Plus, X, AlertTriangle } from 'lucide-react';
import { Button, Input, Modal } from '@/app/components/ui';
import { useToastStore } from '@/app/store/toast';
import { useCreateBuilding, useUpdateBuilding, useCreateFloor, useDeleteFloor, useFloors } from '@/app/hooks/useApi';

/** Confirmação curta, reaproveitada pelos dois modais de prédio. */
export function ConfirmModal({ open, title, message, confirmLabel = 'Confirmar', confirmVariant = 'danger', onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ color: 'rgba(255,255,255,0.96)', fontSize: 14, lineHeight: 1.6 }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={onCancel}>Voltar</Button>
          <Button variant={confirmVariant} style={{ flex: 1 }} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Lista de andares como tags, com campo de adição embaixo. */
function FloorTags({ labels, onRemove, input, onInputChange, onAdd }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ color: 'rgba(255,255,255,0.68)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Andares ({labels.length})
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, minHeight: 36 }}>
        {labels.length === 0 && (
          <span style={{ color: 'rgba(255,255,255,0.52)', fontSize: 14 }}>Nenhum andar adicionado</span>
        )}
        {labels.map(label => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 12px', borderRadius: 20, border: '1px solid rgba(245,197,24,0.3)', background: 'rgba(245,197,24,0.08)' }}>
            <span style={{ color: '#F5C518', fontSize: 14, fontWeight: 600 }}>{label}</span>
            <button onClick={() => onRemove(label)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.52)', display: 'flex', alignItems: 'center', padding: 0, lineHeight: 1 }}
              onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.52)'}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, background: '#232323', borderRadius: 12, padding: '9px 14px', color: 'rgba(255,255,255,0.96)', fontSize: 14, outline: 'none' }}
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

export function CreateBuildingModal({ open, onClose }) {
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

/**
 * Modal único de edição.
 *
 * Montado só quando há prédio em edição e com `key` do id (ver o uso nas telas):
 * o estado nasce direto do prédio e some ao fechar. Antes dois efeitos copiavam
 * prop e resposta da API para dentro do estado, o que rendia render em cascata a
 * cada abertura.
 *
 * `open` existe para a animação de saída: a tela-mãe segura este componente
 * montado por mais alguns quadros depois do fechamento, e é `open` falso que
 * manda a caixa sair.
 */
export function EditBuildingModal({ building, open = true, onClose }) {
  const updateBuilding = useUpdateBuilding();
  const createFloor = useCreateFloor();
  const deleteFloor = useDeleteFloor();
  const { data: floorsData, isLoading: floorsLoading } = useFloors(building.id);
  const { show: toast } = useToastStore();

  const [form, setForm] = useState({ name: building.name, description: building.description || '' });
  // `null` = ninguém mexeu na lista ainda; o que aparece é o que veio do banco.
  const [draftLabels, setDraftLabels] = useState(null);
  const [input, setInput] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const dbFloors = useMemo(() => floorsData?.floors ?? [], [floorsData]);
  const dbLabels = useMemo(() => dbFloors.map(f => f.label), [dbFloors]);
  const labels = draftLabels ?? dbLabels;

  const isDirty =
    form.name !== building.name ||
    form.description !== (building.description || '') ||
    JSON.stringify([...labels].sort()) !== JSON.stringify([...dbLabels].sort());

  function handleClose() {
    if (isDirty) { setConfirmCancel(true); return; }
    onClose();
  }

  function addFloor() {
    const label = input.trim();
    if (!label) return;
    if (labels.includes(label)) { toast('Andar já adicionado', 'error'); return; }
    setDraftLabels([...labels, label]);
    setInput('');
  }

  function removeFloor(label) {
    if (labels.length <= 1) { toast('Mínimo de 1 andar obrigatório', 'error'); return; }
    setDraftLabels(labels.filter(l => l !== label));
  }

  async function handleSave() {
    if (!form.name.trim() || labels.length === 0) return;
    try {
      await updateBuilding.mutateAsync({ id: building.id, ...form });
      const toAdd = labels.filter(l => !dbLabels.includes(l));
      const toRemove = dbFloors.filter(f => !labels.includes(f.label));
      for (const floor of toRemove) {
        await deleteFloor.mutateAsync({ buildingId: building.id, floorId: floor.id });
      }
      for (let i = 0; i < toAdd.length; i++) {
        await createFloor.mutateAsync({ buildingId: building.id, label: toAdd[i] });
      }
      toast('Prédio atualizado!', 'success');
      onClose();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao salvar', 'error', e);
    }
  }

  const isSaving = updateBuilding.isPending || createFloor.isPending || deleteFloor.isPending;

  return (
    <>
      <Modal open={open && !confirmCancel} onClose={handleClose} title={`Editar — ${building.name}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
          <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          {floorsLoading
            ? <div style={{ height: 80, background: '#232323', borderRadius: 12 }} />
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
        onConfirm={onClose}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
}
