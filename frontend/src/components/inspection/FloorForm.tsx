'use client';

import { useForm, Controller } from 'react-hook-form';
import { cn, STATUS_BG, STATUS_LABELS } from '@/lib/utils';
import Button from '@/components/ui/Button';
import type { Floor, ItemStatus, FloorGeneralStatus } from '@/types';

const CHECKLIST_ITEMS = [
  'Elétrica',
  'Hidráulica',
  'Extintores',
  'Iluminação',
  'Iluminação de emergência',
  'Sinalização',
  'Limpeza',
  'Estrutura',
  'Portas corta-fogo',
  'Câmeras de segurança',
];

const ITEM_STATUSES: { value: ItemStatus; label: string }[] = [
  { value: 'OK', label: 'OK' },
  { value: 'NOK', label: 'NOK' },
  { value: 'NA', label: 'N/A' },
];

const GENERAL_STATUSES: { value: FloorGeneralStatus; label: string; color: string }[] = [
  { value: 'OK', label: 'OK', color: 'border-status-ok bg-status-ok/10 text-status-ok' },
  { value: 'ATENCAO', label: 'Atenção', color: 'border-status-warning bg-status-warning/10 text-status-warning' },
  { value: 'PROBLEMA', label: 'Problema', color: 'border-status-error bg-status-error/10 text-status-error' },
];

export interface FloorFormValues {
  statusGeral: FloorGeneralStatus;
  notes: string;
  items: { itemName: string; status: ItemStatus; observation: string }[];
}

interface FloorFormProps {
  floor: Floor;
  floorIndex: number;
  totalFloors: number;
  defaultValues?: Partial<FloorFormValues>;
  onSubmit: (data: FloorFormValues) => void;
  isLoading?: boolean;
  isLast?: boolean;
}

export default function FloorForm({
  floor,
  floorIndex,
  totalFloors,
  defaultValues,
  onSubmit,
  isLoading,
  isLast,
}: FloorFormProps) {
  const { register, handleSubmit, control, watch } = useForm<FloorFormValues>({
    defaultValues: {
      statusGeral: defaultValues?.statusGeral || 'OK',
      notes: defaultValues?.notes || '',
      items: CHECKLIST_ITEMS.map((name, i) => ({
        itemName: name,
        status: defaultValues?.items?.[i]?.status || 'OK',
        observation: defaultValues?.items?.[i]?.observation || '',
      })),
    },
  });

  const statusGeral = watch('statusGeral');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {/* Progresso */}
      <div>
        <div className="flex justify-between text-xs text-text-secondary mb-1.5">
          <span>Andar {floorIndex + 1} de {totalFloors}</span>
          <span>{Math.round(((floorIndex + 1) / totalFloors) * 100)}%</span>
        </div>
        <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: `${((floorIndex + 1) / totalFloors) * 100}%` }}
          />
        </div>
      </div>

      {/* Nome do andar */}
      <div>
        <h2 className="text-xl font-extrabold text-text-primary">{floor.label}</h2>
        <p className="text-text-secondary text-sm">Preencha o checklist de vistoria</p>
      </div>

      {/* Status geral */}
      <div>
        <p className="text-sm font-semibold text-text-secondary mb-2">Status Geral do Andar</p>
        <Controller
          name="statusGeral"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-3 gap-2">
              {GENERAL_STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => field.onChange(s.value)}
                  className={cn(
                    'py-2.5 rounded-xl border-2 text-sm font-bold transition-all',
                    field.value === s.value ? s.color : 'border-white/10 text-text-muted bg-bg-elevated',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        />
      </div>

      {/* Checklist */}
      <div>
        <p className="text-sm font-semibold text-text-secondary mb-3">Checklist de Itens</p>
        <div className="flex flex-col gap-3">
          {CHECKLIST_ITEMS.map((itemName, i) => (
            <div key={itemName} className="bg-bg-elevated rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-text-primary">{itemName}</span>
                <Controller
                  name={`items.${i}.status`}
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-1">
                      {ITEM_STATUSES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => field.onChange(s.value)}
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-xs font-bold transition-all',
                            field.value === s.value
                              ? STATUS_BG[s.value]
                              : 'bg-bg-card text-text-muted',
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>
              <input
                {...register(`items.${i}.itemName`)}
                type="hidden"
                value={itemName}
              />
              <input
                {...register(`items.${i}.observation`)}
                placeholder="Observação (opcional)"
                className="w-full bg-transparent text-xs text-text-secondary placeholder:text-text-muted border-none outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Observações gerais */}
      <div>
        <label className="text-sm font-semibold text-text-secondary block mb-2">
          Observações Gerais
        </label>
        <textarea
          {...register('notes')}
          rows={3}
          placeholder="Descreva observações gerais sobre este andar..."
          className="w-full bg-bg-elevated border border-white/10 rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
        />
      </div>

      <Button type="submit" size="lg" loading={isLoading}>
        {isLast ? '✓ Finalizar Inspeção' : 'Próximo Andar →'}
      </Button>
    </form>
  );
}
