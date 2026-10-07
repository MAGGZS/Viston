'use client';
import { useId, useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { Check, CircleCheck, Sparkles, XCircle } from 'lucide-react';
import { Button, Input, Textarea, Skeleton } from '@/app/components/ui';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import {
  useCreateSchedule,
  useFloors,
  useScheduleSuggestion,
  useUpdateSchedule,
} from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { mensagemDoErro } from '@/app/lib/erros';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { dateKeyOf, formatDataCurta, parseDateKey, toDateKey } from '@/app/lib/agenda';
import { T, R, W, NUM } from '@/app/lib/theme';

/**
 * Uma semana de folga entre a data marcada e o prazo.
 *
 * É o padrão de quem não mexe no campo: o prazo segue a data enquanto ninguém o
 * toca, e quem quer outro escolhe. Vazio obrigaria a pessoa a pensar num número
 * a cada agendamento, e o mesmo dia da data deixaria a ronda atrasada no
 * primeiro imprevisto.
 */
export const PRAZO_PADRAO_DIAS = 7;

export function prazoPadrao(dateKey) {
  const d = parseDateKey(dateKey);
  return d ? toDateKey(addDays(d, PRAZO_PADRAO_DIAS)) : '';
}

/**
 * O que impede o envio, campo a campo.
 *
 * As datas são `yyyy-MM-dd`, e comparar o texto é comparar o dia — a mesma
 * regra do validador do backend, que continua sendo a palavra final.
 */
export function validarAgendamento({ date, dueDate, floorIds, inspectorId, hoje, editando }) {
  const erros = {};
  if (!date) erros.date = 'Escolha a data da vistoria';
  else if (!editando && hoje && date < hoje) erros.date = 'A data não pode estar no passado';
  if (floorIds.length === 0) erros.floors = 'Escolha ao menos um andar';
  if (!inspectorId) erros.inspector = 'Escolha quem vai vistoriar';
  if (!dueDate) erros.due = 'Escolha até quando a vistoria pode ser feita';
  else if (date && dueDate < date) erros.due = 'O prazo não pode ser antes da data agendada';
  return erros;
}

/**
 * Por que o sistema sugeriu essa pessoa, em poucas palavras.
 *
 * Segue a mesma ordem de critérios do servidor (`scheduleService.suggestion`):
 * primeiro menos rondas pendentes; no empate, quem está há mais tempo sem passar
 * por aqueles andares. Dizer o critério que de fato decidiu é o que faz a
 * sugestão ser aceita ou recusada com motivo, em vez de no escuro.
 */
export function motivoDaSugestao(sugerido, todos = [], hoje = new Date()) {
  if (!sugerido) return '';
  if (todos.length <= 1) return 'Único inspetor do prédio';

  const empatados = todos.filter((i) => i.id !== sugerido.id && i.pending_count === sugerido.pending_count);
  if (empatados.length === 0) {
    return sugerido.pending_count === 0
      ? 'Nenhuma vistoria pendente no período'
      : 'Menos vistorias pendentes no período';
  }

  if (!sugerido.last_inspected_at) return 'Nunca vistoriou esses andares';
  const dias = differenceInCalendarDays(hoje, parseDateKey(sugerido.last_inspected_at));
  if (dias <= 0) return 'Vistoriou esses andares hoje';
  return `Não vistoria esses andares há ${dias} dia${dias !== 1 ? 's' : ''}`;
}

function detalheDoInspetor(i) {
  const pend = `${i.pending_count} pendente${i.pending_count !== 1 ? 's' : ''}`;
  const ultima = i.last_inspected_at
    ? `nesses andares em ${formatDataCurta(i.last_inspected_at)}`
    : 'nunca nesses andares';
  return `${pend} · ${ultima}`;
}

const rotulo = { fontSize: 12, fontWeight: W.strong, color: T.mute, margin: 0 };

function Secao({ titulo, id, acao, erro, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-labelledby={id}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 20 }}>
        <h3 id={id} style={rotulo}>{titulo}</h3>
        {acao}
      </div>
      {children}
      {erro && <span role="alert" style={{ fontSize: 12, color: T.danger }}>{erro}</span>}
    </section>
  );
}

/**
 * Os andares, em chips que ligam e desligam.
 *
 * Do mais alto para o mais baixo, que é a ordem em que a ronda anda (ver
 * `floorOrder`). O chip marcado é estado ativo — por isso o dourado, mas o
 * suave: com dez andares marcados, dez blocos de dourado cheio gritariam mais
 * que o botão de agendar, que é a ação da tela.
 */
function ChipsDeAndares({ andares, marcados, onToggle, disabled }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {andares.map((f) => {
        const ligado = marcados.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            className="press"
            aria-pressed={ligado}
            disabled={disabled}
            onClick={() => onToggle(f.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              minHeight: 32, padding: '5px 11px', borderRadius: R.badge,
              border: 'none', font: 'inherit', fontSize: 13,
              cursor: disabled ? 'not-allowed' : 'pointer',
              background: ligado ? T.accentSoft : T.chip,
              color: ligado ? T.accentInk : T.text,
              fontWeight: ligado ? W.strong : W.body,
              boxShadow: ligado ? `inset 0 0 0 1px ${T.accentLine}` : 'none',
              transition: 'background-color 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 160ms var(--ease-saida)',
            }}
          >
            {ligado && <Check size={13} aria-hidden="true" />}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

function OpcaoInspetor({ inspetor, marcado, onEscolher, disabled, sugerido, motivo }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcado}
      disabled={disabled}
      onClick={() => onEscolher(inspetor.id)}
      className="agenda-linha"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '10px 12px', minHeight: 52, borderRadius: R.card,
        border: 'none', font: 'inherit', textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: marcado ? T.accentSoft : sugerido ? T.chip : 'transparent',
        boxShadow: marcado ? `inset 0 0 0 1.5px ${T.accentInk}` : 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          boxShadow: `inset 0 0 0 1.5px ${marcado ? T.accentInk : T.faint}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {marcado && <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.accentInk }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: W.strong, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {inspetor.name}
          </span>
          {sugerido && (
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                padding: '2px 8px', borderRadius: R.badge, fontSize: 11, fontWeight: W.strong,
                // Neutro de propósito: dourado aqui é o da escolha marcada, e o
                // selo não pode parecer que já é ela.
                background: T.card, color: T.text, boxShadow: `inset 0 0 0 1px ${T.line}`,
              }}
            >
              <Sparkles size={11} aria-hidden="true" style={{ color: T.mute }} /> Sugerido
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, color: sugerido ? T.text : T.mute, ...NUM }}>
          {sugerido ? motivo : detalheDoInspetor(inspetor)}
        </span>
        {sugerido && (
          <span style={{ fontSize: 12, color: T.mute, ...NUM }}>{detalheDoInspetor(inspetor)}</span>
        )}
      </span>
    </button>
  );
}

/**
 * Quem vai vistoriar.
 *
 * Sem andar marcado não há lista: a sugestão é sobre aqueles andares (quem
 * passou por eles há mais tempo), e mostrar nomes antes disso seria oferecer
 * uma escolha sem o dado que a orienta. O pedido vem no lugar da lista, para a
 * pessoa saber por que ela ainda não está ali.
 */
function SeletorDeInspetor({ semAndares, carregando, erro, inspetores, escolhido, onEscolher, disabled, extra, labelledBy }) {
  if (semAndares) {
    return (
      <p style={{ fontSize: 13, color: T.mute, lineHeight: 1.55, background: T.chip, borderRadius: R.card, padding: '12px 14px', margin: 0 }}>
        Escolha os andares primeiro — a sugestão de quem vistoriar depende deles.
      </p>
    );
  }
  if (carregando && inspetores.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-busy="true">
        <Skeleton style={{ height: 52, borderRadius: R.card }} />
        <Skeleton style={{ height: 52, borderRadius: R.card }} />
      </div>
    );
  }
  if (erro) {
    return <p role="alert" style={{ fontSize: 13, color: T.danger, margin: 0 }}>Não foi possível carregar os inspetores.</p>;
  }
  if (inspetores.length === 0 && !extra) {
    return (
      <p style={{ fontSize: 13, color: T.mute, lineHeight: 1.55, margin: 0 }}>
        Este prédio ainda não tem inspetor. Convide alguém em Colaboradores para poder agendar.
      </p>
    );
  }

  const sugerido = inspetores.find((i) => i.suggested) ?? null;
  const motivo = motivoDaSugestao(sugerido, inspetores);
  const demais = inspetores.filter((i) => i !== sugerido);

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: carregando ? 0.6 : 1, transition: 'opacity 150ms ease' }}>
      {sugerido && (
        <OpcaoInspetor inspetor={sugerido} marcado={escolhido === sugerido.id} onEscolher={onEscolher} disabled={disabled} sugerido motivo={motivo} />
      )}
      {demais.length > 0 && sugerido && (
        <p style={{ fontSize: 11, color: T.faint, margin: '6px 0 2px 2px' }}>Outros inspetores</p>
      )}
      {demais.map((i) => (
        <OpcaoInspetor key={i.id} inspetor={i} marcado={escolhido === i.id} onEscolher={onEscolher} disabled={disabled} />
      ))}
      {extra && (
        <OpcaoInspetor
          inspetor={{ ...extra, pending_count: 0 }}
          marcado={escolhido === extra.id}
          onEscolher={onEscolher}
          disabled={disabled}
        />
      )}
    </div>
  );
}

/**
 * O formulário de agendar e de editar uma ronda.
 *
 * - `buildingId`.
 * - `schedule`: o agendamento em edição; ausente, é um novo.
 * - `date` / `onDateChange(dateKey)`: a data marcada mora em quem chama, porque
 *   ela é também o dia aceso no calendário ao lado — os dois são a mesma coisa.
 * - `antes`: nó opcional no topo da área que rola (os agendamentos já
 *   existentes naquele dia).
 * - `onDone()`: depois de salvar, concluir ou cancelar.
 * - `disabled`: prédio inativo — tudo só leitura.
 */
export function FormularioAgendamento({ buildingId, schedule = null, date, onDateChange, antes, onDone, disabled = false }) {
  const editando = !!schedule;
  const hoje = toDateKey(new Date());
  const ids = { andares: useId(), inspetor: useId() };
  const { show: toast } = useToastStore();

  const [floorIds, setFloorIds] = useState(() => (schedule?.floors ?? []).map((f) => f.id));
  const [inspectorChoice, setInspectorChoice] = useState(schedule?.inspector?.id ?? null);
  // `null` = ninguém tocou no prazo; ele acompanha a data.
  const [dueChoice, setDueChoice] = useState(schedule ? dateKeyOf(schedule.due_date) : null);
  const [notes, setNotes] = useState(schedule?.notes ?? '');
  const [tentou, setTentou] = useState(false);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  // Qual dos três botões disparou a alteração — só ele gira.
  const [acao, setAcao] = useState(null);

  const dueDate = dueChoice ?? prazoPadrao(date);
  const datasValidas = !!date && !!dueDate && dueDate >= date;

  const { data: floorsData, isLoading: floorsLoading } = useFloors(buildingId);
  const andares = useMemo(() => sortFloorsDesc(floorsData?.floors ?? []), [floorsData]);

  const sugestao = useScheduleSuggestion(buildingId, {
    floorIds,
    scheduledDate: date || undefined,
    dueDate: datasValidas ? dueDate : undefined,
  });
  const semAndares = floorIds.length === 0;
  const inspetores = semAndares ? [] : sugestao.data?.inspectors ?? [];
  const sugerido = inspetores.find((i) => i.suggested) ?? null;
  // Sem escolha feita, o sugerido já vem marcado — e acompanha a sugestão
  // quando ela muda com os andares ou as datas. Depois de um clique, a escolha
  // é da pessoa e não muda mais sozinha.
  const inspectorId = inspectorChoice ?? sugerido?.id ?? null;
  // Em edição, o inspetor atual pode ter saído do prédio e não vir na lista.
  const inspetorForaDaLista =
    editando && schedule.inspector && !semAndares && inspetores.length > 0 &&
    !inspetores.some((i) => i.id === schedule.inspector.id)
      ? schedule.inspector
      : null;

  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const salvando = create.isPending || update.isPending;

  const erros = validarAgendamento({ date, dueDate, floorIds, inspectorId, hoje, editando });
  // O prazo invertido aparece na hora; os outros, só depois da primeira tentativa.
  const mostrar = (campo) => (tentou || (campo === 'due' && date && dueDate && dueDate < date) ? erros[campo] : undefined);

  const todosMarcados = andares.length > 0 && andares.every((f) => floorIds.includes(f.id));

  function alternarAndar(id) {
    setFloorIds((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function falhou(err) {
    toast(mensagemDoErro(err), 'error', err);
  }

  function enviar(e) {
    e.preventDefault();
    if (disabled || salvando) return;
    setTentou(true);
    if (Object.keys(erros).length > 0) return;

    const notas = notes.trim() || null;

    if (!editando) {
      create.mutate(
        { buildingId, inspector_id: inspectorId, scheduled_date: date, due_date: dueDate, floor_ids: floorIds, notes: notas },
        { onSuccess: () => { toast('Vistoria agendada'); onDone?.(); }, onError: falhou }
      );
      return;
    }

    // Só o que mudou: cada campo alterado vira aviso ao inspetor no servidor,
    // e mandar o formulário inteiro faria toda edição parecer mudança de tudo.
    const patch = {};
    if (date !== dateKeyOf(schedule.scheduled_date)) patch.scheduled_date = date;
    if (dueDate !== dateKeyOf(schedule.due_date)) patch.due_date = dueDate;
    if (inspectorId !== schedule.inspector?.id) patch.inspector_id = inspectorId;
    const antesAndares = (schedule.floors ?? []).map((f) => f.id).sort().join(',');
    if ([...floorIds].sort().join(',') !== antesAndares) patch.floor_ids = floorIds;
    if (notas !== (schedule.notes ?? null)) patch.notes = notas;

    if (Object.keys(patch).length === 0) {
      toast('Nada foi alterado', 'info');
      return;
    }

    setAcao('salvar');
    update.mutate(
      { buildingId, scheduleId: schedule.id, ...patch },
      { onSuccess: () => { toast('Agendamento atualizado'); onDone?.(); }, onError: falhou }
    );
  }

  function mudarStatus(status) {
    setAcao(status);
    update.mutate(
      { buildingId, scheduleId: schedule.id, status },
      {
        onSuccess: () => {
          setConfirmarCancelamento(false);
          toast(status === 'CONCLUIDO' ? 'Vistoria marcada como concluída' : 'Agendamento cancelado');
          onDone?.();
        },
        onError: (err) => { setConfirmarCancelamento(false); falhou(err); },
      }
    );
  }

  const bloqueado = disabled || salvando;

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-label={editando ? 'Editar agendamento' : 'Agendar vistoria'}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {antes}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <Input
            label="Data da vistoria"
            type="date"
            name="scheduled_date"
            value={date ?? ''}
            min={editando ? undefined : hoje}
            disabled={bloqueado}
            onChange={(e) => e.target.value && onDateChange?.(e.target.value)}
            error={mostrar('date')}
            style={{ padding: '10px 12px', fontSize: 14 }}
          />
          <Input
            label="Até quando"
            type="date"
            name="due_date"
            value={dueDate}
            min={date || undefined}
            disabled={bloqueado}
            onChange={(e) => setDueChoice(e.target.value)}
            error={mostrar('due')}
            style={{ padding: '10px 12px', fontSize: 14 }}
          />
        </div>

        <Secao
          titulo={`Andares${floorIds.length ? ` · ${floorIds.length}` : ''}`}
          id={ids.andares}
          erro={mostrar('floors')}
          acao={
            andares.length > 1 && (
              <button
                type="button"
                disabled={bloqueado}
                onClick={() => setFloorIds(todosMarcados ? [] : andares.map((f) => f.id))}
                style={{ background: 'none', border: 'none', padding: '2px 4px', font: 'inherit', fontSize: 12, fontWeight: W.strong, color: T.accentInk, cursor: 'pointer' }}
              >
                {todosMarcados ? 'Limpar' : 'Selecionar todos'}
              </button>
            )
          }
        >
          {floorsLoading ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 32, width: 84, borderRadius: R.badge }} />)}
            </div>
          ) : andares.length === 0 ? (
            <p style={{ fontSize: 13, color: T.mute, margin: 0 }}>O prédio ainda não tem andares cadastrados.</p>
          ) : (
            <ChipsDeAndares andares={andares} marcados={floorIds} onToggle={alternarAndar} disabled={bloqueado} />
          )}
        </Secao>

        <Secao titulo="Inspetor" id={ids.inspetor} erro={mostrar('inspector')}>
          <SeletorDeInspetor
            semAndares={semAndares}
            carregando={sugestao.isFetching}
            erro={sugestao.isError}
            inspetores={inspetores}
            escolhido={inspectorId}
            onEscolher={setInspectorChoice}
            disabled={bloqueado}
            extra={inspetorForaDaLista}
            labelledBy={ids.inspetor}
          />
        </Secao>

        <Textarea
          label="Observação (opcional)"
          name="notes"
          rows={3}
          maxLength={1000}
          value={notes}
          disabled={bloqueado}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Algo que o inspetor precise saber"
          style={{ fontSize: 14, padding: '10px 12px' }}
        />
      </div>

      <div style={{ flexShrink: 0, borderTop: `1px solid ${T.line}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button type="submit" loading={create.isPending || (update.isPending && acao === 'salvar')} disabled={disabled || update.isPending} style={{ width: '100%' }}>
          {editando ? 'Salvar alterações' : 'Agendar vistoria'}
        </Button>
        {editando && schedule.status === 'PENDENTE' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button variant="secondary" loading={update.isPending && acao === 'CONCLUIDO'} disabled={bloqueado} onClick={() => mudarStatus('CONCLUIDO')} style={{ padding: '10px 12px', fontSize: 13 }}>
              <CircleCheck size={15} aria-hidden="true" /> Marcar como concluída
            </Button>
            <Button variant="ghost" disabled={bloqueado} onClick={() => setConfirmarCancelamento(true)} style={{ padding: '10px 12px', fontSize: 13, color: T.danger }}>
              <XCircle size={15} aria-hidden="true" /> Cancelar agendamento
            </Button>
          </div>
        )}
      </div>

      {editando && (
        <ConfirmModal
          open={confirmarCancelamento}
          title="Cancelar agendamento?"
          message={`A vistoria sai da agenda de ${schedule.inspector?.name ?? 'quem foi escalado'}, que recebe um aviso. O registro continua na lista como cancelado.`}
          confirmLabel="Cancelar agendamento"
          cancelLabel="Voltar"
          loading={update.isPending && acao === 'CANCELADO'}
          onConfirm={() => mudarStatus('CANCELADO')}
          onCancel={() => setConfirmarCancelamento(false)}
        />
      )}
    </form>
  );
}
