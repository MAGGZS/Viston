import { T } from '@/app/lib/theme';
import {
  SCHEDULE_STATES,
  estiloMarca,
  isAtrasado,
  scheduleState,
  sortByUrgency,
  textoNotificacao,
} from '@/app/lib/agenda';

/**
 * A regra de atraso do proprietário: atrasado desde o dia agendado, prazo
 * vencido depois do "até quando", concluído com atraso depois do dia agendado.
 */
const pend = (extra = {}) => ({ id: 'x', status: 'PENDENTE', overdue: false, ...extra });

describe('scheduleState', () => {
  it('lê os campos calculados pelo backend', () => {
    expect(scheduleState(pend())).toBe('pendente');
    expect(scheduleState(pend({ overdue: true }))).toBe('atrasado');
    expect(scheduleState(pend({ overdue: true, past_deadline: true }))).toBe('prazo_vencido');
    expect(scheduleState({ status: 'CONCLUIDO' })).toBe('concluido');
    expect(scheduleState({ status: 'CONCLUIDO', completed_late: true })).toBe('concluido_atraso');
    expect(scheduleState({ status: 'CANCELADO', overdue: true })).toBe('cancelado');
  });

  it('rótulos e cores: prazo vencido em vermelho, concluído com atraso no verde do concluído', () => {
    expect(SCHEDULE_STATES.prazo_vencido).toMatchObject({ label: 'Prazo vencido', badge: 'danger' });
    // Dourado só em ação e estado ativo: atrasado é neutro forte com o
    // triângulo de alerta; pendente, neutro apagado.
    expect(SCHEDULE_STATES.atrasado).toMatchObject({ label: 'Atrasada', badge: 'default', alerta: true, color: T.text });
    expect(SCHEDULE_STATES.pendente).toMatchObject({ badge: 'default', color: T.mute, vazado: true });
    for (const meta of Object.values(SCHEDULE_STATES)) {
      expect([T.accent, T.accentInk]).not.toContain(meta.color);
      expect(meta.badge).not.toBe('warning');
    }
    expect(SCHEDULE_STATES.concluido_atraso.label).toBe('Concluída com atraso');
    expect(SCHEDULE_STATES.concluido_atraso.color).toBe(SCHEDULE_STATES.concluido.color);
  });

  it('pendente é marca vazada; os outros, cheia', () => {
    expect(estiloMarca('pendente')).toMatchObject({ background: 'transparent' });
    expect(estiloMarca('pendente').boxShadow).toContain('inset');
    expect(estiloMarca('atrasado').boxShadow).toBeUndefined();
  });
});

describe('ordem e contagem', () => {
  it('sortByUrgency: prazo vencido > atrasado > pendente > concluído > cancelado', () => {
    const lista = sortByUrgency([
      { id: 'c', status: 'CANCELADO' },
      { id: 'ok', status: 'CONCLUIDO', completed_late: true },
      pend({ id: 'p' }),
      pend({ id: 'a', overdue: true }),
      pend({ id: 'v', overdue: true, past_deadline: true }),
    ]);
    expect(lista.map((s) => s.id)).toEqual(['v', 'a', 'p', 'ok', 'c']);
  });

  it('isAtrasado vale para atrasado e prazo vencido, nunca para concluído', () => {
    expect(isAtrasado(pend({ overdue: true }))).toBe(true);
    expect(isAtrasado(pend({ overdue: true, past_deadline: true }))).toBe(true);
    expect(isAtrasado({ status: 'CONCLUIDO', completed_late: true })).toBe(false);
  });
});

describe('textoNotificacao', () => {
  it('aviso antigo de atraso ainda tem título, e tipo desconhecido vira "Atualização"', () => {
    expect(textoNotificacao({ type: 'SCHEDULE_OVERDUE', payload: {} }).title).toBe('Vistoria atrasada');
    expect(textoNotificacao({ type: 'QUALQUER', payload: {} }).title).toBe('Atualização');
  });
});
