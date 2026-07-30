'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckSquare } from 'lucide-react';
import api from '@/lib/api';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useStartInspection } from '@/hooks/useInspections';
import { useInspectionFlowStore } from '@/store/inspection-flow.store';
import type { Building } from '@/types';

const BUILDING_ID = '00000000-0000-0000-0000-000000000001';

export default function InspecaoPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const { setSelectedFloors, setReportId, setBuildingId } = useInspectionFlowStore();
  const startMutation = useStartInspection();

  const { data: floors = [], isLoading } = useQuery({
    queryKey: ['floors', BUILDING_ID],
    queryFn: () =>
      api.get<Building['floors']>(`/buildings/${BUILDING_ID}/floors`).then((r) => r.data),
  });

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );

  const selectAll = () => setSelected(floors.map((f) => f.id));
  const clearAll = () => setSelected([]);

  const handleStart = () => {
    if (selected.length === 0) return;
    startMutation.mutate(
      { buildingId: BUILDING_ID, floorIds: selected },
      {
        onSuccess: (report) => {
          const orderedFloors = floors.filter((f) => selected.includes(f.id));
          setSelectedFloors(orderedFloors);
          setReportId(report.id);
          setBuildingId(BUILDING_ID);
          router.push(`/inspecao/${report.id}`);
        },
      },
    );
  };

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-text-primary">Selecionar Andares</h1>
      </div>

      <p className="text-text-secondary text-sm mb-4">
        Escolha os andares que serão vistoriados nesta inspeção.
      </p>

      <div className="flex gap-2 mb-4">
        <button onClick={selectAll} className="text-xs text-accent font-semibold hover:underline">
          Selecionar todos
        </button>
        <span className="text-text-muted">·</span>
        <button onClick={clearAll} className="text-xs text-text-secondary hover:underline">
          Limpar
        </button>
        <span className="ml-auto text-xs text-text-secondary">
          {selected.length} selecionado{selected.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {floors.map((floor) => {
            const isSelected = selected.includes(floor.id);
            return (
              <button
                key={floor.id}
                onClick={() => toggle(floor.id)}
                className={cn(
                  'flex items-center justify-between p-4 rounded-2xl border transition-all text-left',
                  isSelected
                    ? 'bg-accent/10 border-accent text-text-primary'
                    : 'bg-bg-card border-white/10 text-text-secondary hover:border-white/20',
                )}
              >
                <span className="font-semibold text-sm">{floor.label}</span>
                <div
                  className={cn(
                    'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                    isSelected ? 'bg-accent border-accent' : 'border-white/20',
                  )}
                >
                  {isSelected && <CheckSquare size={12} className="text-bg-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Button
        size="lg"
        onClick={handleStart}
        disabled={selected.length === 0}
        loading={startMutation.isPending}
      >
        Iniciar Inspeção ({selected.length} andares)
      </Button>
    </div>
  );
}
