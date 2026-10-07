'use client';
import { AlertTriangle, Pencil, UserX } from 'lucide-react';
import { Badge } from '@/app/components/ui';
import { T, W, NUM } from '@/app/lib/theme';
import {
  estiloMarca,
  formatAte,
  formatDataCurta,
  resumoAndares,
  scheduleState,
  scheduleStateMeta,
} from '@/app/lib/agenda';

/**
 * Uma linha da agenda — a lista lateral do gestor/visualizador e o cartão
 * "próximos agendamentos" do inspetor.
 *
 * Props:
 * - `schedule`: o `Schedule` do contrato da API.
 * - `onClick(schedule)`: opcional; torna o miolo da linha um botão (abrir
 *   detalhes). Sem ele, a linha só mostra.
 * - `onEdit(schedule)`: opcional; mostra o lápis à direita.
 * - `showBuilding`: mostra o nome do prédio (padrão `false` — na tela de um
 *   prédio só ele seria repetição; na agenda do inspetor, que cruza prédios,
 *   passe `true`).
 * - `showInspector`: mostra o inspetor (padrão `true`; o inspetor vendo a
 *   própria agenda passa `false`).
 * - `maxFloors`: quantos andares por nome antes do "+N" (padrão 2).
 *
 * O lápis é irmão do miolo, e não filho: botão dentro de botão é HTML
 * inválido, e o leitor de tela não saberia qual dos dois anunciar.
 * Renderiza uma `<div>`; para lista, envolva em `<ul>/<li>`.
 */
export function ScheduleListItem({
  schedule,
  onClick,
  onEdit,
  showBuilding = false,
  showInspector = true,
  maxFloors = 2,
}) {
  const meta = scheduleStateMeta(schedule);
  const state = scheduleState(schedule);
  const atrasado = state === 'atrasado';
  const vencido = state === 'prazo_vencido';
  const andares = resumoAndares(schedule.floors, maxFloors);
  // Inspetor que saiu do prédio com a ronda ainda aberta: alguém precisa
  // trocá-lo. Selo neutro — quem o lê é quem edita, e o lápis está ao lado.
  const saiu = !!schedule.inspector_left && (schedule.status ?? 'PENDENTE') === 'PENDENTE';
  const titulo = showInspector
    ? schedule.inspector?.name ?? 'Inspetor'
    : showBuilding
      ? schedule.building_name
      : andares || 'Vistoria';

  const linhaSecundaria = [
    showInspector && showBuilding ? schedule.building_name : null,
    titulo !== andares ? andares : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const miolo = (
    <>
      <span
        aria-hidden="true"
        style={{ width: 4, alignSelf: 'stretch', borderRadius: 999, flexShrink: 0, ...estiloMarca(state, { espessura: 1.25 }) }}
      />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: T.display, fontSize: 14, fontWeight: W.strong, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {titulo}
          </span>
          {saiu && (
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
                padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: W.strong,
                background: T.card, color: T.text, boxShadow: `inset 0 0 0 1px ${T.line}`,
              }}
            >
              <UserX size={11} aria-hidden="true" /> Inspetor saiu
            </span>
          )}
        </span>
        {linhaSecundaria && (
          <span style={{ fontSize: 12, color: T.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {linhaSecundaria}
          </span>
        )}
        {/* "dia agendado → até dd/MM". O destaque cai na data que estourou:
            atrasado acende o dia agendado (passou dele); prazo vencido acende
            o "até" (passou do limite final), em vermelho. */}
        <span style={{ ...NUM, fontSize: 12, color: T.faint }}>
          <span className="so-leitor">Agendada para </span>
          <span style={atrasado ? { color: T.text, fontWeight: W.strong } : undefined}>
            {formatDataCurta(schedule.scheduled_date)}
          </span>
          <span aria-hidden="true"> → </span>
          <span className="so-leitor">, </span>
          <span style={vencido ? { color: T.danger, fontWeight: W.strong } : undefined}>
            {formatAte(schedule.due_date)}
          </span>
        </span>
      </span>
      <span style={{ flexShrink: 0 }}>
        <Badge variant={meta.badge}>
          {meta.alerta && <AlertTriangle size={12} aria-hidden="true" />}
          {meta.label}
        </Badge>
      </span>
    </>
  );

  const mioloStyle = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    minHeight: 56,
    borderRadius: 12,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {onClick ? (
        <button
          type="button"
          className="agenda-linha"
          onClick={() => onClick(schedule)}
          style={{ ...mioloStyle, border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
        >
          {miolo}
        </button>
      ) : (
        <div style={mioloStyle}>{miolo}</div>
      )}
      {onEdit && (
        <button
          type="button"
          className="icone-btn icone-btn--compacto"
          aria-label={`Editar agendamento de ${schedule.inspector?.name || 'inspetor'}, ${formatDataCurta(schedule.scheduled_date)}`}
          onClick={() => onEdit(schedule)}
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
