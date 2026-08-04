'use client';
import { useForm, useFieldArray } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Toggle, Card } from '@/app/components/ui';

const STATUS_OPTIONS = ['OK', 'ATENCAO', 'PROBLEMA'];
const STATUS_LABELS = { OK: 'OK', ATENCAO: 'Atenção', PROBLEMA: 'Problema' };

function StatusSelector({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {STATUS_OPTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
            value === s
              ? s === 'OK' ? 'bg-green-500 text-white' : s === 'ATENCAO' ? 'bg-yellow-500 text-black' : 'bg-red-500 text-white'
              : 'bg-[#2A2A2A] text-[#9A9A9A]'
          }`}
        >
          {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

function ItemWithSubForm({ label, register, watch, setValue, prefix, errors }) {
  const hasItem = watch(`${prefix}.has_item`);
  return (
    <div className="flex flex-col gap-3">
      <Toggle
        checked={!!hasItem}
        onChange={(v) => setValue(`${prefix}.has_item`, v)}
        label={label}
      />
      {hasItem && (
        <div className="ml-4 flex flex-col gap-3 border-l-2 border-[#F5C518]/30 pl-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#9A9A9A]">Quantidade</label>
            <input
              type="number"
              min="0"
              className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-3 py-2 text-white w-28 focus:outline-none focus:border-[#F5C518]"
              {...register(`${prefix}.quantity`, { valueAsNumber: true })}
            />
            {errors?.[prefix]?.quantity && (
              <span className="text-xs text-red-400">{errors[prefix].quantity.message}</span>
            )}
          </div>
          <Toggle
            checked={!!watch(`${prefix}.is_marked`)}
            onChange={(v) => setValue(`${prefix}.is_marked`, v)}
            label="Estão marcadas?"
          />
        </div>
      )}
    </div>
  );
}

function ItemWithStatus({ label, watch, setValue, prefix }) {
  const status = watch(`${prefix}.status`);
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-white">{label}</label>
      <StatusSelector value={status} onChange={(v) => setValue(`${prefix}.status`, v)} />
    </div>
  );
}

const schema = yup.object({
  status_geral: yup.string().oneOf(['OK', 'ATENCAO', 'PROBLEMA']).required(),
  observations: yup.array().of(yup.string()),
  manutencao: yup.object({
    cadeiras: yup.object({ has_item: yup.boolean().required() }),
    tomadas: yup.object({ has_item: yup.boolean().required() }),
    ar_condicionado: yup.object({ status: yup.string().oneOf(['OK','ATENCAO','PROBLEMA']).required('Selecione um status') }),
    mesas: yup.object({ has_item: yup.boolean().required() }),
    portas: yup.object({ status: yup.string().oneOf(['OK','ATENCAO','PROBLEMA']).required('Selecione um status') }),
  }),
  limpeza: yup.object({
    carpete: yup.object({ status: yup.string().oneOf(['OK','ATENCAO','PROBLEMA']).required('Selecione um status') }),
    vidros: yup.object({ status: yup.string().oneOf(['OK','ATENCAO','PROBLEMA']).required('Selecione um status') }),
    cadeiras: yup.object({ has_item: yup.boolean().required() }),
  }),
});

export function FloorForm({ floor, onSubmit, isLoading, isLast }) {
  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      status_geral: 'OK',
      observations: [''],
      manutencao: {
        cadeiras: { has_item: false },
        tomadas: { has_item: false },
        ar_condicionado: { status: 'OK' },
        mesas: { has_item: false },
        portas: { status: 'OK' },
      },
      limpeza: {
        carpete: { status: 'OK' },
        vidros: { status: 'OK' },

        cadeiras: { has_item: false },
      },
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'observations' });

  const statusGeral = watch('status_geral');
  const STATUS_GERAL = [
    { value: 'OK', label: 'OK', color: 'bg-green-500' },
    { value: 'ATENCAO', label: 'Atenção', color: 'bg-yellow-500' },
    { value: 'PROBLEMA', label: 'Problema', color: 'bg-red-500' },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {/* Status geral do andar */}
      <Card>
        <p className="text-[#9A9A9A] text-xs mb-2">Status geral do andar</p>
        <div className="flex gap-2">
          {STATUS_GERAL.map(({ value, label, color }) => (
            <button
              key={value}
              type="button"
              onClick={() => setValue('status_geral', value)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
                statusGeral === value ? `${color} text-white` : 'bg-[#2A2A2A] text-[#9A9A9A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {/* Manutenção */}
      <Card>
        <h3 className="text-[#F5C518] font-semibold mb-4">🔧 Manutenção</h3>
        <div className="flex flex-col gap-5">
          <ItemWithSubForm label="Cadeiras" prefix="manutencao.cadeiras" register={register} watch={watch} setValue={setValue} errors={errors} />
          <div className="h-px bg-[#2A2A2A]" />
          <ItemWithSubForm label="Tomadas" prefix="manutencao.tomadas" register={register} watch={watch} setValue={setValue} errors={errors} />
          <div className="h-px bg-[#2A2A2A]" />
          <ItemWithStatus label="Ar-condicionado" prefix="manutencao.ar_condicionado" watch={watch} setValue={setValue} />
          <div className="h-px bg-[#2A2A2A]" />
          <ItemWithSubForm label="Mesas" prefix="manutencao.mesas" register={register} watch={watch} setValue={setValue} errors={errors} />
          <div className="h-px bg-[#2A2A2A]" />
          <ItemWithStatus label="Portas" prefix="manutencao.portas" watch={watch} setValue={setValue} />
        </div>
      </Card>

      {/* Limpeza */}
      <Card>
        <h3 className="text-[#F5C518] font-semibold mb-4">🧹 Limpeza</h3>
        <div className="flex flex-col gap-5">
          <ItemWithStatus label="Carpete" prefix="limpeza.carpete" watch={watch} setValue={setValue} />
          <div className="h-px bg-[#2A2A2A]" />
          <ItemWithStatus label="Vidros" prefix="limpeza.vidros" watch={watch} setValue={setValue} />
          <div className="h-px bg-[#2A2A2A]" />
          <ItemWithSubForm label="Cadeiras" prefix="limpeza.cadeiras" register={register} watch={watch} setValue={setValue} errors={errors} />
        </div>
      </Card>

      {/* Observações */}
      <Card>
        <h3 className="text-[#F5C518] font-semibold mb-4">📝 Observações</h3>
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <textarea
                className="flex-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-3 py-2 text-white placeholder-[#555] focus:outline-none focus:border-[#F5C518] resize-none"
                rows={2}
                placeholder="Observação opcional..."
                {...register(`observations.${index}`)}
              />
              {fields.length > 1 && (
                <button type="button" onClick={() => remove(index)} className="text-[#9A9A9A] hover:text-red-400">
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => append('')}
            className="flex items-center gap-2 text-[#9A9A9A] hover:text-[#F5C518] text-sm transition-colors"
          >
            <Plus size={16} /> Adicionar observação
          </button>
        </div>
      </Card>

      <Button type="submit" loading={isLoading} className="w-full">
        {isLast ? '✓ Finalizar Inspeção' : 'Próximo Andar →'}
      </Button>
    </form>
  );
}
