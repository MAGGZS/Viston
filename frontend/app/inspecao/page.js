'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { FloorForm } from '@/app/components/FloorForm';
import { Button, Card, Spinner } from '@/app/components/ui';
import { useFloors, useStartInspection, useSaveFloorForm, useFinishInspection } from '@/app/hooks/useApi';

function StepSelectFloors({ onStart }) {
  const [inputId, setInputId] = useState('');
  const [resolvedId, setResolvedId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const { data, isLoading, error } = useFloors(resolvedId);
  const { mutateAsync: startInspection, isPending } = useStartInspection();

  function toggle(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleStart() {
    if (!selectedIds.length || !resolvedId) return;
    try {
      const report = await startInspection({ building_id: resolvedId, floor_ids: selectedIds });
      onStart(report, data.floors.filter(f => selectedIds.includes(f.id)));
    } catch (e) {
      alert(e?.response?.data?.error?.message || 'Erro ao iniciar inspeção');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <p className="text-[#9A9A9A] text-xs mb-2">ID do Prédio</p>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#F5C518]"
            placeholder="Cole o ID do prédio..."
            value={inputId}
            onChange={e => setInputId(e.target.value)}
          />
          <Button variant="secondary" onClick={() => setResolvedId(inputId)}>Buscar</Button>
        </div>
      </Card>

      {isLoading && <div className="flex justify-center py-8"><Spinner /></div>}
      {error && <p className="text-red-400 text-sm text-center">Prédio não encontrado</p>}

      {data && (
        <>
          <p className="text-white font-semibold">{data.building?.name}</p>
          <div className="grid grid-cols-2 gap-3">
            {data.floors?.map(floor => (
              <button
                key={floor.id}
                onClick={() => toggle(floor.id)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  selectedIds.includes(floor.id)
                    ? 'border-[#F5C518] bg-[#F5C518]/10'
                    : 'border-[#2A2A2A] bg-[#1E1E1E]'
                }`}
              >
                <Building2 size={20} className={selectedIds.includes(floor.id) ? 'text-[#F5C518]' : 'text-[#9A9A9A]'} />
                <p className={`mt-2 font-semibold text-sm ${selectedIds.includes(floor.id) ? 'text-[#F5C518]' : 'text-white'}`}>
                  {floor.label}
                </p>
              </button>
            ))}
          </div>
          <Button onClick={handleStart} loading={isPending} disabled={!selectedIds.length} className="w-full">
            Iniciar ({selectedIds.length} andar{selectedIds.length !== 1 ? 'es' : ''})
          </Button>
        </>
      )}
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
      <div className="min-h-screen bg-[#0D0D0D] pb-10">
        {/* Header */}
        <div className="sticky top-0 bg-[#0D0D0D]/95 backdrop-blur px-5 pt-12 pb-4 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => step === 'select' ? router.back() : setStep('select')} className="text-[#9A9A9A] hover:text-white">
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-white font-bold text-lg">
                {step === 'select' && 'Selecionar Andares'}
                {step === 'form' && floors[currentIndex]?.label}
                {step === 'done' && 'Inspeção Concluída'}
              </h1>
              {step === 'form' && (
                <p className="text-[#9A9A9A] text-xs">Andar {currentIndex + 1} de {floors.length}</p>
              )}
            </div>
          </div>

          {step === 'form' && (
            <div className="mt-3 h-1 bg-[#2A2A2A] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F5C518] transition-all"
                style={{ width: `${((currentIndex + 1) / floors.length) * 100}%` }}
              />
            </div>
          )}
        </div>

        <div className="px-5 mt-4">
          {step === 'select' && <StepSelectFloors onStart={handleStart} />}

          {step === 'form' && (
            <FloorForm
              floor={floors[currentIndex]}
              onSubmit={handleFloorSubmit}
              isLoading={isSaving || isFinishing}
              isLast={currentIndex === floors.length - 1}
            />
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-6 pt-10 text-center">
              <div className="w-20 h-20 bg-[#F5C518]/20 rounded-full flex items-center justify-center">
                <span className="text-4xl">✓</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Inspeção Finalizada!</h2>
                <p className="text-[#9A9A9A] mt-2">Relatório gerado com sucesso</p>
              </div>
              <Card className="w-full text-left">
                <p className="text-[#9A9A9A] text-xs mb-1">Google Forms</p>
                <p className={`font-semibold ${finishedReport?.google_form_synced ? 'text-green-400' : 'text-yellow-400'}`}>
                  {finishedReport?.google_form_synced ? '✓ Sincronizado' : '⏳ Sincronização pendente'}
                </p>
              </Card>
              <div className="flex flex-col gap-3 w-full">
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
