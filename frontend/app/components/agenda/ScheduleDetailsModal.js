'use client';
import { Building2, CalendarDays, Clock, Pencil, User } from 'lucide-react';
import { Badge, Modal } from '@/app/components/ui';
import { T, R, W } from '@/app/lib/theme';
import {
  formatAte,
  formatDataCurta,
  formatDiaCurto,
  formatDiaMes,
  scheduleState,
  scheduleStateMeta,
  sortByUrgency,
} from '@/app/lib/agenda';

function Linha({ icon: Icon, label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <Icon size={15} aria-hidden="true" style={{ color: T.faint, marginTop: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <span className="so-leitor">{label}: </span>
        {children}
      </div>
    </div>
  );
}

const PODE_EDITAR = (s) => s.status === 'PENDENTE';

function Detalhe({ schedule, showBuilding, showInspector, showStatus, onEdit, canEdit }) {
  const meta = scheduleStateMeta(schedule);
  const estado = scheduleState(schedule);
  const atrasado = estado === 'atrasado';
  const vencido = estado === 'prazo_vencido';
  const editavel = onEdit && canEdit(schedule);

  return (
    <article
      style={{ background: T.chip, borderRadius: R.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {(showStatus || editavel) && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showStatus && <Badge variant={meta.badge}>{meta.label}</Badge>}
        <span style={{ flex: 1 }} />
        {editavel && (
          <button
            type="button"
            className="icone-btn icone-btn--compacto"
            aria-label="Editar agendamento"
            onClick={() => onEdit(schedule)}
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: T.text }}>
        {showBuilding && schedule.building_name && (
          <Linha icon={Building2} label="Prédio">{schedule.building_name}</Linha>
        )}
        {showInspector && (
          <Linha icon={User} label="Inspetor">
            <span style={{ fontWeight: W.strong }}>{schedule.inspector?.name ?? '—'}</span>
          </Linha>
        )}
        <Linha icon={CalendarDays} label="Data">
          <span style={{ textTransform: 'capitalize', color: atrasado ? T.accentInk : T.text, fontWeight: atrasado ? W.strong : W.body }}>
            {formatDiaCurto(schedule.scheduled_date)}
          </span>
          {atrasado && <span style={{ color: T.accentInk }}> · dia agendado já passou</span>}
        </Linha>
        <Linha icon={Clock} label="Prazo">
          <span style={{ color: vencido ? T.danger : T.text, fontWeight: vencido ? W.strong : W.body }}>
            {formatAte(schedule.due_date)}
            {vencido && ' · prazo vencido'}
          </span>
        </Linha>
      </div>

      {schedule.floors?.length > 0 && (
        <div>
          <p style={{ fontSize: 12, color: T.mute, marginBottom: 6 }}>Andares</p>
          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
            {schedule.floors.map((f) => (
              <li
                key={f.id}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: R.badge, background: T.card, color: T.text, boxShadow: T.cardRing }}
              >
                {f.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {schedule.notes && (
        <div>
          <p style={{ fontSize: 12, color: T.mute, marginBottom: 4 }}>Observação</p>
          <p style={{ fontSize: 14, color: T.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {schedule.notes}
          </p>
        </div>
      )}

      {(schedule.completed_at || schedule.created_by?.name) && (
        <p style={{ fontSize: 12, color: T.faint, lineHeight: 1.5 }}>
          {schedule.completed_at &&
            `Concluída em ${formatDataCurta(schedule.completed_at)}${estado === 'concluido_atraso' ? ', depois do dia agendado' : ''}`}
          {schedule.completed_at && schedule.created_by?.name && ' · '}
          {schedule.created_by?.name && `Agendada por ${schedule.created_by.name}`}
        </p>
      )}
    </article>
  );
}

/**
 * Os agendamentos de um dia (ou um só), numa caixa.
 *
 * Props:
 * - `open`, `onClose`.
 * - `schedules`: `Schedule[]` — um ou mais; vêm ordenados do mais urgente.
 * - `dateKey`: `'yyyy-MM-dd'` opcional; com ele o título vira "Agenda de
 *   7 de outubro". Sem ele, e com um agendamento só, "Vistoria agendada".
 * - `showBuilding`: mostra o prédio em cada um (padrão `true`).
 * - `showInspector`: mostra o inspetor (padrão `true`; o inspetor vendo a
 *   própria agenda passa `false` — o nome dele ali é só ruído).
 * - `onEdit(schedule)`: opcional; mostra o lápis nos editáveis.
 * - `canEdit(schedule)`: quais são editáveis (padrão: só `PENDENTE`).
 * - `footer`: nó opcional embaixo da lista (ex.: botão "Agendar neste dia").
 * - `title`: troca o título calculado (ex.: "Agendamento cancelado").
 * - `aviso`: frase opcional acima da lista — por que a caixa mostra o que mostra.
 * - `showStatus`: mostra a etiqueta de estado (padrão `true`). Desligue quando
 *   o estado não é conhecido — um agendamento que só existe no aviso do sino.
 *
 * Usa o `Modal` do produto: centralizado, até a altura da janela, miolo que
 * rola — no telefone ocupa a largura menos 16px de cada lado.
 */
export function ScheduleDetailsModal({
  open,
  onClose,
  schedules = [],
  dateKey,
  showBuilding = true,
  showInspector = true,
  onEdit,
  canEdit = PODE_EDITAR,
  footer,
  title: tituloFixo,
  aviso,
  showStatus = true,
}) {
  const lista = sortByUrgency(schedules);
  const title = tituloFixo ?? (dateKey
    ? `Agenda de ${formatDiaMes(dateKey)}`
    : lista.length === 1
      ? 'Vistoria agendada'
      : 'Agendamentos');

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={460}>
      {aviso && <p style={{ fontSize: 14, color: T.mute, lineHeight: 1.55, margin: '0 0 12px' }}>{aviso}</p>}
      {lista.length === 0 ? (
        <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.6 }}>Nenhuma vistoria agendada para este dia.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista.map((s) => (
            <Detalhe key={s.id} schedule={s} showBuilding={showBuilding} showInspector={showInspector} showStatus={showStatus} onEdit={onEdit} canEdit={canEdit} />
          ))}
        </div>
      )}
      {footer && <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>{footer}</div>}
    </Modal>
  );
}
