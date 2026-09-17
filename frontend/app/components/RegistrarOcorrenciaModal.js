  'use client';
import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button, Modal, Select, Textarea } from '@/app/components/ui';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { useUnsavedGuard } from '@/app/hooks/useUnsavedGuard';
import { useToastStore } from '@/app/store/toast';
import { useActiveBuilding } from '@/app/hooks/useActiveBuilding';
import { useFloors, useCreateOccurrence } from '@/app/hooks/useApi';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
} from '@/app/lib/maintenanceOptions';
import { comprimirImagem } from '@/app/lib/imagem';
import { T, R } from '@/app/lib/theme';

const MAX_FOTOS = 4;

export function RegistrarOcorrenciaModal({ open, onClose, onSuccess, defaultBuildingId }) {
  const { buildings, buildingId: activeBuildingId, isLoading: buildingsLoading } = useActiveBuilding();
  const createOccurrence = useCreateOccurrence();
  const { show: toast } = useToastStore();
  const fileRef = useRef(null);

  // O prédio escolhido à mão; sem escolha, vale o padrão, o ativo ou o primeiro.
  // Derivado, e não copiado para o estado num efeito: a lista de prédios chega
  // depois, e o efeito renderizaria duas vezes para dizer a mesma coisa.
  const [buildingEscolhido, setBuildingId] = useState('');
  const buildingId =
    buildingEscolhido || defaultBuildingId || activeBuildingId || buildings[0]?.building_id || '';
  const [floorEscolhido, setFloorId] = useState('');
  const [maintenanceType, setMaintenanceType] = useState('');
  const [priority, setPriority] = useState('MEDIA');
  const [category, setCategory] = useState('CORRETIVA');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [preparando, setPreparando] = useState(false);
  const [erros, setErros] = useState({});

  const { data: floorsData, isLoading: floorsLoading } = useFloors(buildingId || null);
  const floors = floorsData?.floors ?? [];

  // Andar que não é do prédio atual (trocou-se o prédio) conta como vazio.
  const floorId = floors.some((f) => f.id === floorEscolhido) ? floorEscolhido : '';

  const isDirty = Boolean(
    floorId ||
    maintenanceType ||
    description.trim() ||
    photos.length > 0
  );
  const saida = useUnsavedGuard(isDirty);

  function resetForm() {
    setFloorId('');
    setMaintenanceType('');
    setPriority('MEDIA');
    setCategory('CORRETIVA');
    setDescription('');
    setPhotos([]);
    setErros({});
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function escolherFotos(event) {
    const escolhidas = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!escolhidas.length) return;

    const cabem = MAX_FOTOS - photos.length;
    if (cabem <= 0) {
      toast(`No máximo ${MAX_FOTOS} fotos por ocorrência`, 'error');
      return;
    }

    setPreparando(true);
    const prontas = [];

    for (const file of escolhidas.slice(0, cabem)) {
      try {
        prontas.push(await comprimirImagem(file));
      } catch (e) {
        toast(e.message || 'Não foi possível abrir essa imagem', 'error');
      }
    }

    setPhotos((atuais) => [...atuais, ...prontas]);
    setPreparando(false);

    if (escolhidas.length > cabem) {
      toast(`Só as ${cabem === 1 ? 'primeira' : `${cabem} primeiras`} fotos foram adicionadas (limite: ${MAX_FOTOS})`, 'info');
    }
  }

  function validar() {
    const novosErros = {};
    if (!buildingId) novosErros.building_id = 'Selecione o condomínio/prédio';
    if (!floorId) novosErros.floor_id = 'Selecione o andar';
    if (!maintenanceType) novosErros.maintenance_type = 'Selecione o tipo de manutenção';
    if (!description.trim()) novosErros.description = 'Descreva a ocorrência identificada';
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleSalvar() {
    if (!validar()) return;

    try {
      await createOccurrence.mutateAsync({
        building_id: buildingId,
        floor_id: floorId,
        maintenance_type: maintenanceType,
        priority,
        category,
        description: description.trim(),
        photos,
      });

      toast('Ocorrência registrada! Ela já está na sua fila em andamento.', 'success');
      resetForm();
      onClose();
      onSuccess?.();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao registrar ocorrência', 'error');
    }
  }

  const buildingOptions = buildings.map((b) => ({
    value: b.building_id,
    label: b.name,
  }));

  const floorOptions = floors.map((f) => ({
    value: f.id,
    label: f.label,
  }));

  return (
    <>
      <Modal open={open} onClose={() => saida.guard(handleClose)} title="Registrar nova ocorrência" maxWidth={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Seletor de prédio (se houver mais de 1) */}
          {buildings.length > 1 && (
            <Select
              label="Prédio / Condomínio"
              options={buildingOptions}
              value={buildingId}
              onChange={(e) => {
                setBuildingId(e.target.value);
                setErros((prev) => ({ ...prev, building_id: undefined }));
              }}
              error={erros.building_id}
              disabled={buildingsLoading}
            />
          )}

          {/* Andar */}
          <Select
            label="Andar / Local"
            options={floorOptions}
            value={floorId}
            onChange={(e) => {
              setFloorId(e.target.value);
              setErros((prev) => ({ ...prev, floor_id: undefined }));
            }}
            placeholder={floorsLoading ? 'Carregando andares...' : 'Selecione o andar'}
            error={erros.floor_id}
            disabled={floorsLoading || floors.length === 0}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Tipo de manutenção */}
            <Select
              label="Tipo de manutenção"
              options={MAINTENANCE_TYPES}
              value={maintenanceType}
              onChange={(e) => {
                setMaintenanceType(e.target.value);
                setErros((prev) => ({ ...prev, maintenance_type: undefined }));
              }}
              error={erros.maintenance_type}
            />

            {/* Prioridade */}
            <Select
              label="Prioridade"
              options={PRIORITIES}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>

          {/* Categoria */}
          <Select
            label="Categoria"
            options={CATEGORIES}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />

          {/* Descrição */}
          <Textarea
            label="Descrição do problema"
            placeholder="Descreva detalhadamente o que foi encontrado..."
            rows={3}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (erros.description) setErros((prev) => ({ ...prev, description: undefined }));
            }}
            error={erros.description}
          />

          {/* Fotos */}
          <div>
            <span style={{ color: T.mute, fontSize: 12, display: 'block', marginBottom: 6 }}>
              Fotos ({photos.length}/{MAX_FOTOS})
            </span>

            {photos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {photos.map((foto, i) => (
                  <div key={i} className="anim-pop-in" style={{ position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={foto}
                      alt={`Foto ${i + 1}`}
                      style={{ width: 68, height: 68, objectFit: 'cover', borderRadius: R.control, display: 'block' }}
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((atuais) => atuais.filter((_, j) => j !== i))}
                      aria-label={`Remover foto ${i + 1}`}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
                        background: T.chip, color: T.text, boxShadow: T.cardRing,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={escolherFotos}
              style={{ display: 'none' }}
            />

            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              loading={preparando}
              disabled={photos.length >= MAX_FOTOS}
              style={{ width: '100%' }}
            >
              <Camera size={15} />
              {photos.length > 0 ? `Adicionar mais fotos (${photos.length}/${MAX_FOTOS})` : 'Anexar fotos'}
            </Button>
          </div>

          {/* Botões de Ação */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => saida.guard(handleClose)}>
              Cancelar
            </Button>
            <Button
              style={{ flex: 1 }}
              onClick={handleSalvar}
              loading={createOccurrence.isPending}
            >
              Registrar ocorrência
            </Button>
          </div>
        </div>
      </Modal>

      <UnsavedChangesModal
        open={saida.asking}
        message="Você tem dados preenchidos. Deseja sair sem registrar a ocorrência?"
        onConfirm={saida.confirm}
        onCancel={saida.cancel}
      />
    </>
  );
}
