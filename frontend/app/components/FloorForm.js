'use client';
import { useId } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Plus, Trash2, CalendarDays, UserRound } from 'lucide-react';
import { Toggle } from '@/app/components/ui';
import { M, MCard, MSelect, MButton, MButtonSoft } from '@/app/components/mobile/kit';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  emptyRecord,
} from '@/app/lib/maintenanceOptions';
import { T, R, W } from '@/app/lib/theme';

const S = {
  label: { fontSize: 12, fontWeight: W.body, color: T.mute },
  error: { fontSize: 12, color: T.danger },
  readonly: { background: T.chip, borderRadius: R.control, padding: '13px 15px', color: T.mute, fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 },
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
            // Sem `required`: o chamado pode nascer sem dono, e o moderador o
            // encaminha. Obrigar aqui travaria a vistoria em prédio que ainda
            // não tem responsável nenhum cadastrado.
            responsible_id: yup.string(),
          })
        )
        .min(1, 'Adicione ao menos uma informação'),
  }),
});

/** Um droplist do formulário. */
/**
 * O que foi encontrado no andar.
 *
 * Componente próprio por causa do `useId`: o erro precisa de um id para ser
 * amarrado ao campo, e hook não pode nascer dentro do `map` das ocorrências.
 * `role="alert"` é o que faz o leitor de tela anunciar o erro no instante em que
 * ele aparece — é aqui que o inspetor mais erra, porque é o único campo livre.
 */
function DescriptionField({ index, register, error }) {
  const fieldId = useId();
  const errorId = `${fieldId}-erro`;

  // O erro fica *fora* do `<label>`, e o rótulo aponta para o campo por
  // `htmlFor`. Dentro do label, o texto do erro entrava no nome do campo: o
  // leitor de tela passava a anunciar "Descrição Descreva a ocorrência" como
  // se fosse o rótulo — e o rótulo mudava conforme o erro ia e vinha.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <label htmlFor={fieldId} style={{ color: M.mute, fontSize: 12 }}>Descrição</label>
      <textarea
        id={fieldId}
        rows={3}
        placeholder="O que foi encontrado?"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{ background: M.chip, border: 'none', borderRadius: 16, padding: '14px 16px', color: M.text, fontSize: 16, outline: 'none', width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
        {...register(`records.${index}.description`)}
      />
      {error && (
        <span id={errorId} role="alert" style={{ color: M.danger, fontSize: 12 }}>{error}</span>
      )}
    </div>
  );
}

function Field({ control, name, label, options, placeholder, error }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <MSelect
          label={label}
          error={error}
          options={[{ value: '', label: placeholder }, ...options]}
          {...field}
        />
      )}
    />
  );
}

/**
 * Um andar do formulário de vistoria.
 *
 * `responsibles` são as contas com papel de responsável naquele prédio — a
 * lista fixa de nomes saiu do produto. Prédio sem responsável nenhum ainda
 * vistoria: o campo some e o chamado chega ao moderador sem dono.
 */
export function FloorForm({ floor, inspectorName, initialRecords, responsibles = [], onSubmit, isLoading, isLast }) {
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

  const responsibleOptions = responsibles.map((r) => ({ value: r.id, label: r.name }));

  const today = new Date().toLocaleDateString('pt-BR');

  function submit(data) {
    onSubmit(data.nothing_to_report ? [] : data.records);
  }

  return (
    <form onSubmit={handleSubmit(submit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Quem está vistoriando e quando */}
      <MCard style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <UserRound size={15} color={M.accent} style={{ flexShrink: 0 }} />
          <span style={{ color: M.mute, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {inspectorName || '—'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <CalendarDays size={15} color={M.accent} />
          <span style={{ color: M.mute, fontSize: 14 }}>{today}</span>
        </div>
      </MCard>

      <MCard>
        <Toggle
          checked={!!nothingToReport}
          onChange={(v) => setValue('nothing_to_report', v)}
          label="Nada a relatar neste andar"
        />
      </MCard>

      {!nothingToReport && fields.map((field, index) => (
        // `field.id` é novo a cada "Adicionar ocorrência": o cartão recém-criado
        // entra animado, e os que já estavam na tela não repetem a animação.
        <MCard key={field.id} className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.text }}>Ocorrência {index + 1}</p>
            {fields.length > 1 && (
              <button type="button" onClick={() => remove(index)} aria-label="Remover ocorrência"
                style={{ background: M.chip, border: 'none', cursor: 'pointer', color: M.mute, padding: 8, borderRadius: 12, display: 'flex' }}>
                <Trash2 size={15} />
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

          <DescriptionField
            index={index}
            register={register}
            error={errors.records?.[index]?.description?.message}
          />

          {responsibles.length > 0 ? (
            <Field control={control} name={`records.${index}.responsible_id`} label="Responsável (opcional)"
              options={responsibleOptions} placeholder="Deixar para o moderador encaminhar"
              error={errors.records?.[index]?.responsible_id?.message} />
          ) : (
            <p className="anim-fade-in" style={{ color: M.faint, fontSize: 12, lineHeight: 1.5 }}>
              Este prédio ainda não tem responsáveis cadastrados. O chamado vai
              para o moderador encaminhar.
            </p>
          )}
        </MCard>
      ))}

      {!nothingToReport && (
        <MButtonSoft onClick={() => append(emptyRecord())} style={{ width: '100%' }}>
          <Plus size={16} /> Adicionar ocorrência
        </MButtonSoft>
      )}

      <MButton type="submit" loading={isLoading} style={{ width: '100%', marginTop: 4 }}>
        {isLast ? 'Enviar vistoria' : 'Próximo andar'}
      </MButton>
    </form>
  );
}
