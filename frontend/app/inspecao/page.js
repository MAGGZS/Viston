'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Search } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { FloorForm } from '@/app/components/FloorForm';
import { Button, Card, Spinner } from '@/app/components/ui';
import { useFloors, useStartInspection, useSaveFloorForm, useFinishInspection, useMyBuildings, useRequestAccess } from '@/app/hooks/useApi';

// Tela quando não tem vínculo: busca por ID e solicita acesso
function StepSemVinculo() {
  const [inputId, setInputId] = useState('');
  const [searchId, setSearchId] = useState('');
  const [requested, setRequested] = useState(false);
  const { data, isLoading, error } = useFloors(searchId);
  const requestAccess = useRequestAccess();

  async function handleRequest() {
    try {
      await requestAccess.mutateAsync(searchId);
      setRequested(true);
    } catch (e) {
      alert(e?.response?.data?.error?.message || 'Erro ao solicitar acesso');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 20, padding: 16 }}>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.6 }}>
          Você não tem vínculo com nenhum prédio. Busque pelo ID fornecido pelo administrador e solicite acesso.
        </p>
      </div>

      <Card>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>ID do Prédio</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '10px 14px', color: 'rgba(255,255,255,0.85)', fontSize: 14, outline: 'none' }}
            placeholder="Cole o ID do prédio..."
            value={inputId}
            onChange={e => setInputId(e.target.value)}
          />
          <Button variant="secondary" onClick={() => { setSearchId(inputId); setRequested(false); }}>
            <Search size={15} />
          </Button>
        </div>
      </Card>

      {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>}
      {error && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>Prédio não encontrado</p>}

      {data && !requested && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, background: 'rgba(245,197,24,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={18} color="#F5C518" />
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 15 }}>{data.building?.name}</p>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{data.floors?.length} andar(es)</p>
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

// Tela com vínculo: seleciona andares do prédio vinculado
function StepSelectFloors({ building, floors, onStart }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const { mutateAsync: startInspection, isPending } = useStartInspection();

  function toggle(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleStart() {
    if (!selectedIds.length) return;
    try {
      const report = await startInspection({ building_id: building.id, floor_ids: selectedIds });
      onStart(report, floors.filter(f => selectedIds.includes(f.id)));
    } catch (e) {
      alert(e?.response?.data?.error?.message || 'Erro ao iniciar inspeção');
    }
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

      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Selecione os andares</p>

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

      <Button onClick={handleStart} loading={isPending} disabled={!selectedIds.length} className="w-full">
        Iniciar ({selectedIds.length} andar{selectedIds.length !== 1 ? 'es' : ''})
      </Button>
    </div>
  );
}

export default function InspecaoPage() {
  const router = useRouter();
  const [step, setStep] = useState('select');
  const [report, setReport] = useState(null);
  const [floors, setFloors] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finishedReport, setFinishedReport] = useState(null);

  const { data: myBuildings = [], isLoading: buildingsLoading } = useMyBuildings();
  const hasBuilding = myBuildings.length > 0;
  const myBuilding = myBuildings[0];

  const { data: floorsData, isLoading: floorsLoading } = useFloors(myBuilding?.id);

  const { mutateAsync: saveFloor, isPending: isSaving } = useSaveFloorForm();
  const { mutateAsync: finishInspection, isPending: isFinishing } = useFinishInspection();

  function handleStart(rep, selectedFloors) {
    setReport(rep);
    setFloors(selectedFloors);
    setCurrentIndex(0);
    setStep('form');
  }

  async function handleFloorSubmit(formData) {
    try {
      await saveFloor({
        reportId: report.id,
        floorId: floors[currentIndex].id,
        ...formData,
        observations: formData.observations.filter(Boolean),
      });
      if (currentIndex < floors.length - 1) {
        setCurrentIndex(i => i + 1);
      } else {
        const finished = await finishInspection(report.id);
        setFinishedReport(finished);
        setStep('done');
      }
    } catch (e) {
      alert(e?.response?.data?.error?.message || 'Erro ao salvar andar');
    }
  }

  return (
    <RouteGuard roles={['ADMIN', 'INSPECTOR']}>
      <div style={{ minHeight: '100vh', background: '#0D0D0D', paddingBottom: 40 }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, background: 'rgba(13,13,13,0.95)', backdropFilter: 'blur(12px)', padding: '48px 20px 16px', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => step === 'select' ? router.back() : setStep('select')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}>
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700, fontSize: 18 }}>
                {step === 'select' && 'Nova Inspeção'}
                {step === 'form' && floors[currentIndex]?.label}
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
            buildingsLoading || floorsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
            ) : !hasBuilding ? (
              <StepSemVinculo />
            ) : (
              <StepSelectFloors
                building={myBuilding}
                floors={floorsData?.floors ?? []}
                onStart={handleStart}
              />
            )
          )}

          {step === 'form' && (
            <FloorForm
              floor={floors[currentIndex]}
              onSubmit={handleFloorSubmit}
              isLoading={isSaving || isFinishing}
              isLast={currentIndex === floors.length - 1}
            />
          )}

          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, paddingTop: 40, textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, background: 'rgba(245,197,24,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 36 }}>✓</span>
              </div>
              <div>
                <h2 style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700, fontSize: 22 }}>Inspeção Finalizada!</h2>
                <p style={{ color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>Relatório gerado com sucesso</p>
              </div>
              <Card className="w-full text-left">
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginBottom: 4 }}>Google Forms</p>
                <p style={{ fontWeight: 600, color: finishedReport?.google_form_synced ? '#4ade80' : '#facc15' }}>
                  {finishedReport?.google_form_synced ? '✓ Sincronizado' : '⏳ Sincronização pendente'}
                </p>
              </Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                {finishedReport?.excel_url && (
                  <a href={finishedReport.excel_url} target="_blank" rel="noreferrer">
                    <Button variant="secondary" className="w-full">📊 Baixar Planilha Excel</Button>
                  </a>
                )}
                <Button onClick={() => router.push('/historico')} className="w-full">Ver Histórico</Button>
                <Button variant="ghost" onClick={() => { setStep('select'); setReport(null); setFloors([]); }} className="w-full">
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
