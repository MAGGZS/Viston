import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseReportDate } from '@/app/lib/date';

/**
 * Formatação compartilhada das telas de chamado.
 *
 * Vive fora dos componentes porque a mesa de processamento e a lista de
 * finalizados mostram as mesmas datas e a mesma cor de prioridade. Duplicar
 * isso faria as duas telas divergirem no dia em que uma delas mudasse.
 */

export const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/** O dia da vistoria por extenso — a data que dá contexto à ocorrência. */
export function dayLabel(value) {
  const date = parseReportDate(value);
  return date ? format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '—';
}

/** Dia de um carimbo do chamado (encaminhado, recebido, concluído, fechado). */
export function stampLabel(value) {
  return value ? format(new Date(value), 'dd/MM/yyyy', { locale: ptBR }) : '—';
}
