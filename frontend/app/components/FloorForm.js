'use client';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Plus, Trash2, CalendarDays, UserRound } from 'lucide-react';
import { Button, Card, Select, Toggle } from '@/app/components/ui';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  RESPONSIBLES,
  RECORD_STATUS,
  emptyRecord,
} from '@/app/lib/maintenanceOptions';

const S = {
  label: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  error: { fontSize: 12, color: 'rgba(248,113,113,0.9)' },
  readonly: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '12px 16px', color: 'rgba(255,255,255,0.65)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 },
};

const schema = yup.object({
  nothing_to_report: yup.boolean(),
  records: yup.array().when('nothing_to_report', {
    is: true,
    then: (s) => s.strip(),
    otherwise: (s) =>
      s
        .of(
          yup.object({
            maintenance_type: yup.string().required('Selecione o tipo de manutenção'),
            category: yup.string().required('Selecione a categoria'),
            priority: yup.string().required('Selecione a prioridade'),
            description: yup.string().trim().required('Descreva a ocorrência'),
            responsible: yup.string().required('Selecione o responsável'),
            status: yup.string().required('Selecione o status'),
          })
        )
        .min(1, 'Adicione ao menos uma informação'),
  }),
});

/** Um droplist do formulário. */
function Field({ control, name, label, options, placeholder, error }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Select
            label={label}
            options={[{ value: '', label: placeholder }, ...options]}
            {...field}
          />
          {error && <span style={S.error}>{error}</span>}
        </div>
      )}
    />
  );
}

export function FloorForm({ floor, inspectorName, initialRecords, onSubmit, isLoading, isLast }) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      // Rascunho salvo com zero ocorrências = andar marcado como "nada a relatar"
      nothing_to_report: Array.isArray(initialRecords) && initialRecords.length === 0,
      records: initialRecords?.length ? initialRecords : [emptyRecord()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'records' });
  const nothingToReport = watch('nothing_to_report');

  const today = new Date().toLocaleDateString('pt-BR');

  function submit(data) {
    onSubmit(data.nothing_to_report ? [] : data.records);
  }

  return (
    <form onSubmit={handleSubmit(submit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Andar em vistoria + lembrete de quem está fazendo */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <p style={S.label}>Andar - Unidade</p>
          <p style={{ color: '#F5C518', fontWeight: 700, fontSize: 20, marginTop: 4 }}>{floor?.label}</p>
        </div>
        <div style={S.readonly}>
          <UserRound size={15} color="rgba(245,197,24,0.8)" />
          <span>Vistoria feita por <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{inspectorName || '—'}</strong></span>
        </div>
        <div>
          <p style={S.label}>Data de abertura</p>
          <div style={{ ...S.readonly, marginTop: 6 }}>
            <CalendarDays size={15} color="rgba(245,197,24,0.8)" />
            <span>{today}</span>
          </div>
        </div>
      </Card>

      <Card>
        <Toggle
          checked={!!nothingToReport}
          onChange={(v) => setValue('nothing_to_report', v)}
          label="Nada a relatar neste andar"
        />
      </Card>

      {!nothingToReport && fields.map((field, index) => (
        <Card key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ color: '#F5C518', fontWeight: 600, fontSize: 13 }}>Informação {index + 1}</p>
            {fields.length > 1 && (
              <button type="button" onClick={() => remove(index)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 4 }}>
                <Trash2 size={16} />
              </button>
            )}
          </div>

          <Field control={control} name={`records.${index}.maintenance_type`} label="Tipo de manutenção"
            options={MAINTENANCE_TYPES} placeholder="Selecione o tipo"
            error={errors.records?.[index]?.maintenance_type?.message} />

          <Field control={control} name={`records.${index}.category`} label="Categoria"
            options={CATEGORIES} placeholder="Selecione a categoria"
            error={errors.records?.[index]?.category?.message} />

          <Field control={control} name={`records.${index}.priority`} label="Prioridade"
            options={PRIORITIES} placeholder="Selecione a prioridade"
            error={errors.records?.[index]?.priority?.message} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={S.label}>Descrição</label>
            <textarea
              rows={3}
              placeholder="Descreva o que foi encontrado..."
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, padding: '12px 16px', color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none', width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              {...register(`records.${index}.description`)}
            />
            {errors.records?.[index]?.description && (
              <span style={S.error}>{errors.records[index].description.message}</span>
            )}
          </div>

          <Field control={control} name={`records.${index}.responsible`} label="Responsável"
            options={RESPONSIBLES} placeholder="Selecione o responsável"
            error={errors.records?.[index]?.responsible?.message} />

          <Field control={control} name={`records.${index}.status`} label="Status"
            options={RECORD_STATUS} placeholder="Selecione o status"
            error={errors.records?.[index]?.status?.message} />
        </Card>
      ))}

      {!nothingToReport && (
        <Button type="button" variant="secondary" onClick={() => append(emptyRecord())} style={{ width: '100%' }}>
          <Plus size={16} /> Adicionar mais informações
        </Button>
      )}

      <Button type="submit" loading={isLoading} style={{ width: '100%' }}>
        {isLast ? '✓ Enviar vistoria' : 'Próximo andar →'}
      </Button>
    </form>
  );
}
