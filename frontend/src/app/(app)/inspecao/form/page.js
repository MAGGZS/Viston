'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Camera, X, ChevronRight, CheckCircle } from 'lucide-react';
import api from '@/lib/api';
import { useInspectionStore } from '@/store/inspection';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Spinner } from '@/components/ui';
import clsx from 'clsx';

const CHECKLIST_ITEMS = [
  'Elétrica', 'Hidráulica', 'Extintores', 'Iluminação',
  'Iluminação de emergência', 'Sinalização', 'Limpeza',
  'Estrutura', 'Portas corta-fogo', 'Câmeras de segurança',
];

const STATUS_OPTIONS = [
  { value: 'OK', label: 'OK', color: 'text-status-ok border-status-ok bg-status-ok/10' },
  { value: 'NOK', label: 'NOK', color: 'text-status-problema border-status-problema bg-status-problema/10' },
  { value: 'NA', label: 'N/A', color: 'text-text-secondary border-white/20 bg-white/5' },
];

const GENERAL_OPTIONS = [
  { value: 'OK', label: 'OK', color: 'border-status-ok bg-status-ok/10 text-status-ok' },
  { value: 'ATENCAO', label: 'Atenção', color: 'border-status-atencao bg-status-atencao/10 text-status-atencao' },
  { value: 'PROBLEMA', label: 'Problema', color: 'border-status-problema bg-status-problema/10 text-status-problema' },
];

export default function InspecaoFormPage() {
  useRequireAuth(['ADMIN', 'INSPECTOR']);
  const router = useRouter();
  const { reportId, selectedFloors, currentFloorIndex, getCurrentFloor, isLastFloor, nextFloor, reset } = useInspectionStore();
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState([]);

  const floor = getCurrentFloor();

  useEffect(() => {
    if (!reportId || !floor) router.replace('/inspecao');
  }, [reportId, floor, router]);

  const { register, handleSubmit, control, reset: resetForm, formState: { errors } } = useForm({
    defaultValues: {
      statusGeral: 'OK',
      notes: '',
      items: CHECKLIST_ITEMS.map((name) => ({ itemName: name, status: 'OK', observation: '' })),
    },
  });

  const { fields } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    resetForm({
      statusGeral: 'OK',
      notes: '',
      items: CHECKLIST_ITEMS.map((name) => ({ itemName: name, status: 'OK', observation: '' })),
    });
    setPhotos([]);
  }, [currentFloorIndex, resetForm]);

  function handlePhotoChange(e) {
    const files = Array.from(e.target.files || []);
    setPhotos((prev) => [...prev, ...files].slice(0, 10));
  }

  function removePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(values) {
    if (!reportId || !floor) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('statusGeral', values.statusGeral);
      if (values.notes) formData.append('notes', values.notes);
      formData.append('items', JSON.stringify(values.items));
      photos.forEach((file) => formData.append('photos', file));

      await api.patch(`/inspections/${reportId}/floors/${floor.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (isLastFloor()) {
        // Finish inspection
        await api.post(`/inspections/${reportId}/finish`);
        reset();
        router.replace('/inspecao/concluido');
      } else {
        nextFloor();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (!floor) return null;

  const total = selectedFloors.length;
  const current = currentFloorIndex + 1;
  const progress = (current / total) * 100;

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto pb-8">
      {/* Progress header */}
      <div className="mb-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-bold text-lg">{floor.label}</span>
          <span className="text-text-secondary">{current} de {total}</span>
        </div>
        <div className="h-1.5 bg-bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Status geral */}
        <div className="card">
          <p className="text-sm font-semibold mb-3">Status Geral do Andar</p>
          <Controller
            name="statusGeral"
            control={control}
            render={({ field }) => (
              <div className="flex gap-2">
                {GENERAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => field.onChange(opt.value)}
                    className={clsx(
                      'flex-1 py-2 rounded-xl border font-semibold text-sm transition-colors',
                      field.value === opt.value ? opt.color : 'border-white/10 text-text-secondary'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        {/* Checklist */}
        <div className="card">
          <p className="text-sm font-semibold mb-3">Checklist</p>
          <div className="flex flex-col gap-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{field.itemName}</span>
                  <Controller
                    name={`items.${index}.status`}
                    control={control}
                    render={({ field: f }) => (
                      <div className="flex gap-1">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => f.onChange(opt.value)}
                            className={clsx(
                              'px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors',
                              f.value === opt.value ? opt.color : 'border-white/10 text-text-secondary'
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  />
                </div>
                <input
                  {...register(`items.${index}.observation`)}
                  placeholder="Observação (opcional)"
                  className="input text-sm py-2"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="card">
          <label className="label">Observações gerais</label>
          <textarea
            {...register('notes')}
            rows={3}
            placeholder="Descreva ocorrências gerais do andar..."
            className="input resize-none"
          />
        </div>

        {/* Photos */}
        <div className="card">
          <p className="text-sm font-semibold mb-3">Fotos ({photos.length}/10)</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {photos.map((file, i) => (
              <div key={i} className="relative w-20 h-20">
                <img
                  src={URL.createObjectURL(file)}
                  alt=""
                  className="w-full h-full object-cover rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-status-problema rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
            {photos.length < 10 && (
              <label className="w-20 h-20 border-2 border-dashed border-white/20 rounded-xl flex items-center justify-center cursor-pointer hover:border-accent transition-colors">
                <Camera className="w-6 h-6 text-text-secondary" />
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
              </label>
            )}
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full py-4 text-base">
          {saving ? <Spinner size="sm" /> : (
            <>
              {isLastFloor() ? (
                <><CheckCircle className="w-5 h-5" /> Finalizar Inspeção</>
              ) : (
                <>Próximo Andar <ChevronRight className="w-5 h-5" /></>
              )}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
