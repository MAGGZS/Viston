'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Check, Search } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { FloorForm } from '@/app/components/FloorForm';
import { Button, Card, Spinner } from '@/app/components/ui';
import { M, MRound, MCard, MButton, MButtonSoft, MButtonGhost, MSectionHead, MPill } from '@/app/components/mobile/kit';
import { useFloors, useBuildingByKey, useSubmitInspection, useMyBuildings, useRequestAccess, useBuildingResponsibles } from '@/app/hooks/useApi';
import { formatShareKey, normalizeShareKey, isCompleteShareKey } from '@/app/lib/shareKey';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { useAuthStore } from '@/app/store/auth';
import { canInspect } from '@/app/lib/roles';
import { useToastStore } from '@/app/store/toast';

/**
 * O que vai para a API.
 *
 * Responsável em branco vira ausência, e não string vazia: o chamado sem dono é
 * um estado normal — ele chega assim à fila do moderador —, mas a API espera um
 * id de conta ou nada.
 */
function toPayload(records = []) {
  return records.map(({ responsible_id, ...record }) => ({
    ...record,
    ...(responsible_id ? { responsible_id } : {}),
  }));
}

// Tela quando não tem vínculo: busca pela chave do prédio e solicita acesso
function StepSemVinculo() {
  const [inputKey, setInputKey] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [requested, setRequested] = useState(false);
  const { data, isLoading, error } = useBuildingByKey(searchKey);
  const requestAccess = useRequestAccess();
  const { show: toast } = useToastStore();

  function handleSearch() {
    const key = normalizeShareKey(inputKey);
    if (!isCompleteShareKey(key)) {
      toast('Chave inválida. Ela tem 12 caracteres.', 'error');
      return;
    }
    setSearchKey(key);
    setRequested(false);
  }

  async function handleRequest() {
    try {
      await requestAccess.mutateAsync(searchKey);
      setRequested(true);
      toast('Solicitação enviada! Aguarde a aprovação.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao solicitar acesso', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 20, padding: 16 }}>
        <p style={{ color: 'rgba(255,255,255,0.96)', fontSize: 13, lineHeight: 1.6 }}>
          Você não tem vínculo com nenhum prédio. Digite a chave fornecida pelo administrador e solicite acesso.
        </p>
      </div>

      <Card>
        <p style={{ color: 'rgba(255,255,255,0.44)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Chave do Prédio</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1, background: '#232323', borderRadius: 16, padding: '11px 14px', color: 'rgba(255,255,255,0.96)', fontSize: 14, outline: 'none', fontWeight: 600, letterSpacing: '0.18em' }}
            placeholder="ABCD-EFGH-JKMN"
            maxLength={14}
            value={inputKey}
            onChange={e => setInputKey(formatShareKey(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="secondary" onClick={handleSearch}>
            <Search size={15} />
          </Button>
        </div>
      </Card>

      {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>}
      {error && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>Chave inválida ou prédio não encontrado</p>}

      {data && !requested && (
        <div style={{ background: '#232323', borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, background: 'rgba(245,197,24,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={18} color="#F5C518" />
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.96)', fontWeight: 600, fontSize: 15 }}>{data.name}</p>
              {data.description && <p style={{ color: 'rgba(255,255,255,0.26)', fontSize: 12 }}>{data.description}</p>}
            </div>
          </div>
          <Button onClick={handleRequest} loading={requestAccess.isPending} className="w-full">
            Conectar-se
          </Button>
        </div>
      )}

      {requested && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>✓</p>
          <p style={{ color: 'rgba(255,255,255,0.96)', fontWeight: 600, fontSize: 15 }}>Solicitação enviada!</p>
          <p style={{ color: 'rgba(255,255,255,0.44)', fontSize: 13, marginTop: 4 }}>Aguarde o administrador aprovar seu acesso.</p>
        </div>
      )}
    </div>
  );
}

// Tela com vínculo: seleciona andares do prédio vinculado (já listados do maior para o menor)
function StepSelectFloors({ building, floors, onStart }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const allSelected = floors.length > 0 && selectedIds.length === floors.length;

  function toggle(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : floors.map(f => f.id));
  }

  function handleStart() {
    if (!selectedIds.length) return;
    // A vistoria avança do andar mais alto para o mais baixo
    onStart(floors.filter(f => selectedIds.includes(f.id)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <MCard style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, background: M.accentSoft, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={19} color={M.accent} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 15, color: M.text }}>{building.name}</p>
          <p style={{ color: M.mute, fontSize: 12, marginTop: 2 }}>Do andar mais alto até o mais baixo</p>
        </div>
      </MCard>

      <MSectionHead
        title="Andares"
        action={<MPill onClick={toggleAll}>{allSelected ? 'Limpar' : 'Todos'}</MPill>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {floors.map(floor => {
          const sel = selectedIds.includes(floor.id);
          return (
            <button key={floor.id} onClick={() => toggle(floor.id)}
              style={{
                padding: '18px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', textAlign: 'left',
                background: sel ? M.accent : M.card,
                color: sel ? '#000' : M.text,
                fontFamily: M.display, fontWeight: 600, fontSize: 14,
                transition: 'background 0.15s',
              }}>
              {floor.label}
            </button>
          );
        })}
      </div>

      <MButton onClick={handleStart} disabled={!selectedIds.length} style={{ width: '100%', marginTop: 6 }}>
        Começar {selectedIds.length ? `(${selectedIds.length})` : ''}
      </MButton>
    </div>
  );
}

export default function InspecaoPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [step, setStep] = useState('select');
  const [floors, setFloors] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Rascunho em memória: nada vai para o servidor antes do envio final
  const [drafts, setDrafts] = useState({});
  const [finishedReport, setFinishedReport] = useState(null);

  const { data: myBuildings = [], isLoading: buildingsLoading } = useMyBuildings();
  // O primeiro prédio em que esta pessoa vistoria — e não simplesmente o
  // primeiro da lista: com papel por prédio, dá para ser inspetor num e só
  // acompanhar outro, e abrir a vistoria no prédio errado só daria 403 no fim.
  const myBuilding = myBuildings.find((b) => canInspect(user, b.building_id));
  const hasBuilding = !!myBuilding;

  const { data: floorsData, isLoading: floorsLoading } = useFloors(myBuilding?.building_id);
  // Só os responsáveis daquele prédio entram no droplist da ocorrência.
  const { data: responsibles = [] } = useBuildingResponsibles(myBuilding?.building_id);
  const orderedFloors = useMemo(() => sortFloorsDesc(floorsData?.floors ?? []), [floorsData]);

  const { mutateAsync: submitInspection, isPending: isSubmitting } = useSubmitInspection();
  const { show: toast } = useToastStore();

  const currentFloor = floors[currentIndex];
  const isLast = currentIndex === floors.length - 1;

  function handleStart(selectedFloors) {
    setFloors(sortFloorsDesc(selectedFloors));
    setCurrentIndex(0);
    setDrafts({});
    setStep('form');
  }

  function resetToSelect() {
    setStep('select');
    setFloors([]);
    setCurrentIndex(0);
    setDrafts({});
    setFinishedReport(null);
  }

  function handleBack() {
    if (step !== 'form') return router.back();
    if (currentIndex > 0) return setCurrentIndex(i => i - 1);
    resetToSelect();
  }

  async function handleFloorSubmit(records) {
    // O rascunho guarda o que o formulário devolveu, inclusive o responsável em
    // branco: é ele que volta para a tela quando a pessoa anda para trás.
    const updated = { ...drafts, [currentFloor.id]: records };
    setDrafts(updated);

    if (!isLast) {
      setCurrentIndex(i => i + 1);
      return;
    }

    // Último andar: só agora tudo é enviado e vira relatório, Excel, calendário e histórico
    try {
      const report = await submitInspection({
        building_id: myBuilding.building_id,
        floors: floors.map(f => ({ floor_id: f.id, records: toPayload(updated[f.id]) })),
      });
      setFinishedReport(report);
      setStep('done');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao enviar vistoria', 'error');
    }
  }

  return (
    <RouteGuard roles={['ADMIN', 'GESTOR', 'INSPECTOR']}>
      <div style={{ minHeight: '100vh', background: M.bg, paddingBottom: 40 }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, background: M.bg, padding: '48px 16px 14px', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <MRound label="Voltar" onClick={handleBack}>
              <ArrowLeft size={19} />
            </MRound>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontFamily: M.display, fontWeight: 600, fontSize: 19, color: M.text }}>
                {step === 'select' && 'Nova vistoria'}
                {step === 'form' && currentFloor?.label}
                {step === 'done' && 'Vistoria enviada'}
              </h1>
              {step === 'form' && (
                <p style={{ color: M.mute, fontSize: 12, marginTop: 2 }}>Andar {currentIndex + 1} de {floors.length}</p>
              )}
            </div>
          </div>
          {step === 'form' && (
            <div style={{ marginTop: 14, height: 4, background: M.chip, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: M.accent, borderRadius: 99, width: `${((currentIndex + 1) / floors.length) * 100}%`, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>

        <div style={{ padding: '10px 16px' }}>
          {step === 'select' && (
            <div className="anim-fade-up">
            {buildingsLoading || floorsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
            ) : !hasBuilding ? (
              <StepSemVinculo />
            ) : (
              <StepSelectFloors
                building={myBuilding}
                floors={orderedFloors}
                onStart={handleStart}
              />
            )}
            </div>
          )}

          {step === 'form' && currentFloor && (
            <div className="anim-fade-up">
            <FloorForm
              key={currentFloor.id}
              floor={currentFloor}
              inspectorName={user?.name}
              initialRecords={drafts[currentFloor.id]}
              responsibles={responsibles}
              onSubmit={handleFloorSubmit}
              isLoading={isSubmitting}
              isLast={isLast}
            />
            </div>
          )}

          {step === 'done' && (
            <div className="anim-scale-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, paddingTop: 48, textAlign: 'center' }}>
              <div className="anim-pop-in" style={{ width: 76, height: 76, background: M.accent, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={34} color="#000" strokeWidth={3} />
              </div>
              <div>
                <h2 style={{ fontFamily: M.display, fontWeight: 600, fontSize: 22, color: M.text }}>Vistoria enviada</h2>
                <p style={{ color: M.mute, fontSize: 14, marginTop: 6 }}>Relatório e planilha já estão no histórico</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                {finishedReport?.excel_url && (
                  <a href={finishedReport.excel_url} target="_blank" rel="noreferrer">
                    <MButtonSoft style={{ width: '100%' }}>Baixar planilha</MButtonSoft>
                  </a>
                )}
                <MButton onClick={() => router.push('/historico')} style={{ width: '100%' }}>Ver histórico</MButton>
                <MButtonGhost onClick={resetToSelect} style={{ width: '100%' }}>Nova vistoria</MButtonGhost>
              </div>
            </div>
          )}
        </div>
      </div>
    </RouteGuard>
  );
}
