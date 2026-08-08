'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Search } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { FloorForm } from '@/app/components/FloorForm';
import { Button, Card, Spinner } from '@/app/components/ui';
import { useFloors, useBuildingByKey, useSubmitInspection, useMyBuildings, useRequestAccess } from '@/app/hooks/useApi';
import { formatShareKey, normalizeShareKey, isCompleteShareKey } from '@/app/lib/shareKey';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';

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
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.6 }}>
          Você não tem vínculo com nenhum prédio. Digite a chave fornecida pelo administrador e solicite acesso.
        </p>
      </div>

      <Card>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Chave do Prédio</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '10px 14px', color: 'rgba(255,255,255,0.85)', fontSize: 14, outline: 'none', fontFamily: 'monospace', letterSpacing: '0.08em' }}
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
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, background: 'rgba(245,197,24,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={18} color="#F5C518" />
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 15 }}>{data.name}</p>
              {data.description && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{data.description}</p>}
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
          <p style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontSize: 15 }}>Solicitação enviada!</p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 }}>Aguarde o administrador aprovar seu acesso.</p>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, background: 'rgba(245,197,24,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Building2 size={18} color="#F5C518" />
        </div>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 15 }}>{building.name}</p>
          {building.description && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{building.description}</p>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Selecione os andares</p>
        <button type="button" onClick={toggleAll}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F5C518', fontSize: 12, fontWeight: 600 }}>
          {allSelected ? 'Limpar' : 'Todos'}
        </button>
      </div>

      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
        A vistoria começa pelo andar mais alto e desce até o mais baixo.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {floors.map(floor => {
          const sel = selectedIds.includes(floor.id);
          return (
            <button key={floor.id} onClick={() => toggle(floor.id)}
              style={{ padding: 16, borderRadius: 20, border: `2px solid ${sel ? '#F5C518' : 'rgba(255,255,255,0.08)'}`, background: sel ? 'rgba(245,197,24,0.08)' : 'rgba(255,255,255,0.03)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s' }}>
              <Building2 size={18} color={sel ? '#F5C518' : 'rgba(255,255,255,0.3)'} />
              <p style={{ color: sel ? '#F5C518' : 'rgba(255,255,255,0.8)', fontWeight: 600, fontSize: 13, marginTop: 8 }}>{floor.label}</p>
            </button>
          );
        })}
      </div>

      <Button onClick={handleStart} disabled={!selectedIds.length} className="w-full">
        Iniciar ({selectedIds.length} andar{selectedIds.length !== 1 ? 'es' : ''})
      </Button>
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
  const hasBuilding = myBuildings.length > 0;
  const myBuilding = myBuildings[0];

  const { data: floorsData, isLoading: floorsLoading } = useFloors(myBuilding?.id);
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
    const updated = { ...drafts, [currentFloor.id]: records };
    setDrafts(updated);

    if (!isLast) {
      setCurrentIndex(i => i + 1);
      return;
    }

    // Último andar: só agora tudo é enviado e vira relatório, Excel, calendário e histórico
    try {
      const report = await submitInspection({
        building_id: myBuilding.id,
        floors: floors.map(f => ({ floor_id: f.id, records: updated[f.id] ?? [] })),
      });
      setFinishedReport(report);
      setStep('done');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao enviar vistoria', 'error');
    }
  }

  return (
    <RouteGuard roles={['ADMIN', 'INSPECTOR']}>
      <div style={{ minHeight: '100vh', background: '#0D0D0D', paddingBottom: 40 }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, background: 'rgba(13,13,13,0.95)', backdropFilter: 'blur(12px)', padding: '48px 20px 16px', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleBack}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}>
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700, fontSize: 18 }}>
                {step === 'select' && 'Nova Inspeção'}
                {step === 'form' && currentFloor?.label}
                {step === 'done' && 'Inspeção Concluída'}
              </h1>
              {step === 'form' && (
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Andar {currentIndex + 1} de {floors.length}</p>
              )}
            </div>
          </div>
          {step === 'form' && (
            <div style={{ marginTop: 12, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#F5C518', borderRadius: 99, width: `${((currentIndex + 1) / floors.length) * 100}%`, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>

        <div style={{ padding: '16px 20px' }}>
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
              onSubmit={handleFloorSubmit}
              isLoading={isSubmitting}
              isLast={isLast}
            />
            </div>
          )}

          {step === 'done' && (
            <div className="anim-scale-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, paddingTop: 40, textAlign: 'center' }}>
              <div className="anim-pop-in" style={{ width: 80, height: 80, background: 'rgba(245,197,24,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 36 }}>✓</span>
              </div>
              <div>
                <h2 style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700, fontSize: 22 }}>Vistoria enviada!</h2>
                <p style={{ color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>Relatório gerado e registrado no histórico</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                {finishedReport?.excel_url && (
                  <a href={finishedReport.excel_url} target="_blank" rel="noreferrer">
                    <Button variant="secondary" className="w-full">📊 Baixar Planilha Excel</Button>
                  </a>
                )}
                <Button onClick={() => router.push('/historico')} className="w-full">Ver Histórico</Button>
                <Button variant="ghost" onClick={resetToSelect} className="w-full">
                  Nova Inspeção
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </RouteGuard>
  );
}
