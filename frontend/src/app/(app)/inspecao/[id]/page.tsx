'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect } from 'react';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import FloorForm, { FloorFormValues } from '@/components/inspection/FloorForm';
import { useInspectionFlowStore } from '@/store/inspection-flow.store';
import { useSaveFloorForm, useFinishInspection } from '@/hooks/useInspections';
import Button from '@/components/ui/Button';

export default function InspecaoEmAndamentoPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const {
    reportId,
    selectedFloors,
    currentFloorIndex,
    formsData,
    setCurrentFloorIndex,
    saveFloorData,
    reset,
  } = useInspectionFlowStore();

  const saveFloor = useSaveFloorForm();
  const finishMutation = useFinishInspection();

  // Redireciona se não há inspeção em andamento
  useEffect(() => {
    if (!reportId || reportId !== id) {
      router.replace('/inspecao');
    }
  }, [reportId, id, router]);

  if (!reportId || selectedFloors.length === 0) return null;

  const currentFloor = selectedFloors[currentFloorIndex];
  const isLast = currentFloorIndex === selectedFloors.length - 1;
  const allDone = Object.keys(formsData).length === selectedFloors.length;

  const handleFloorSubmit = async (data: FloorFormValues) => {
    saveFloorData(currentFloor.id, { ...data, floorId: currentFloor.id, photos: [] });

    await saveFloor.mutateAsync({
      reportId: id,
      floorId: currentFloor.id,
      data: {
        statusGeral: data.statusGeral,
        notes: data.notes,
        items: data.items,
        photos: [],
      },
    });

    if (isLast) {
      // Finaliza a inspeção
      finishMutation.mutate(id, {
        onSuccess: (report) => {
          reset();
          router.push(`/historico/${report.id}?concluido=1`);
        },
      });
    } else {
      setCurrentFloorIndex(currentFloorIndex + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goBack = () => {
    if (currentFloorIndex > 0) {
      setCurrentFloorIndex(currentFloorIndex - 1);
    } else {
      router.back();
    }
  };

  return (
    <div className="px-4 pt-6 pb-8 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={goBack} className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-text-primary">Vistoria em Andamento</h1>
      </div>

      {finishMutation.isPending ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <span className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary font-medium">Gerando relatório...</p>
        </div>
      ) : (
        <FloorForm
          floor={currentFloor}
          floorIndex={currentFloorIndex}
          totalFloors={selectedFloors.length}
          defaultValues={formsData[currentFloor.id]}
          onSubmit={handleFloorSubmit}
          isLoading={saveFloor.isPending}
          isLast={isLast}
        />
      )}

      {(saveFloor.isError || finishMutation.isError) && (
        <p className="text-sm text-status-error text-center mt-4">
          Erro ao salvar. Tente novamente.
        </p>
      )}
    </div>
  );
}
