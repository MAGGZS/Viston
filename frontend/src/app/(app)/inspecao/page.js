'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CheckSquare, Square, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useInspectionStore } from '@/store/inspection';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Spinner } from '@/components/ui';
import clsx from 'clsx';

const BUILDING_ID = 'building-main-001';

export default function InspecaoPage() {
  useRequireAuth(['ADMIN', 'INSPECTOR']);
  const router = useRouter();
  const { user } = useAuthStore();
  const { start } = useInspectionStore();
  const [selected, setSelected] = useState([]);
  const [starting, setStarting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['floors', BUILDING_ID],
    queryFn: () => api.get(`/buildings/${BUILDING_ID}/floors`).then((r) => r.data),
  });

  const floors = data?.floors || [];

  function toggle(floorId) {
    setSelected((prev) =>
      prev.includes(floorId) ? prev.filter((id) => id !== floorId) : [...prev, floorId]
    );
  }

  function selectAll() {
    setSelected(floors.map((f) => f.id));
  }

  async function handleStart() {
    if (!selected.length) return;
    setStarting(true);
    try {
      const { data: report } = await api.post('/inspections', {
        buildingId: BUILDING_ID,
        floorIds: selected,
      });
      // Sort selected floors by building order
      const orderedFloors = floors
        .filter((f) => selected.includes(f.id))
        .sort((a, b) => b.order - a.order);
      start(report.id, orderedFloors);
      router.push('/inspecao/form');
    } catch (err) {
      console.error(err);
    } finally {
      setStarting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-extrabold">Selecionar Andares</h1>
        <button onClick={selectAll} className="text-accent text-sm font-semibold">
          Todos
        </button>
      </div>
      <p className="text-text-secondary text-sm mb-5">
        Escolha os andares que serão vistoriados nesta inspeção.
      </p>

      <div className="flex flex-col gap-2 mb-6">
        {floors.map((floor) => {
          const isSelected = selected.includes(floor.id);
          return (
            <button
              key={floor.id}
              onClick={() => toggle(floor.id)}
              className={clsx(
                'flex items-center gap-3 p-4 rounded-2xl border transition-colors text-left',
                isSelected
                  ? 'bg-accent/10 border-accent text-white'
                  : 'bg-bg-card border-white/10 text-text-secondary'
              )}
            >
              {isSelected
                ? <CheckSquare className="w-5 h-5 text-accent flex-shrink-0" />
                : <Square className="w-5 h-5 flex-shrink-0" />
              }
              <span className="font-semibold">{floor.label}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={handleStart}
        disabled={!selected.length || starting}
        className="btn-primary w-full py-4 text-base disabled:opacity-40"
      >
        {starting ? <Spinner size="sm" /> : (
          <>
            Iniciar Inspeção ({selected.length} andar{selected.length !== 1 ? 'es' : ''})
            <ArrowRight className="w-5 h-5" />
          </>
        )}
      </button>
    </div>
  );
}
