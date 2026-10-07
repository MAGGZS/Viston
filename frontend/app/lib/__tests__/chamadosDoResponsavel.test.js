import { destinoNoComputador } from '@/app/components/TelaPorLargura';
import {
  eventosDaAtividade,
  ordenarColuna,
  precisaDeAtencao,
  textoDoPrazo,
} from '@/app/lib/chamadosDoResponsavel';

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

const sla = (o = {}) => ({ limite: 5, dias: 1, consumo: 0.2, restantes: 4, atrasado: false, em_risco: false, congelado: false, ...o });

/**
 * Para onde a tela de celular manda cada conta no computador.
 *
 * Errar aqui é o defeito que motivou a regra: a tela de telefone esticada no
 * monitor, ou a conta caindo numa mesa que não é a dela.
 */
describe('destinoNoComputador', () => {
  const m = (...roles) => ({ kind: 'USER', role: 'NONE', memberships: roles.map((role, i) => ({ building_id: `p${i}`, role })) });

  it.each([
    ['admin', { kind: 'USER', role: 'ADMIN', memberships: [] }, '/desktop/admin/dashboard'],
    ['gestor', { kind: 'MANAGER', memberships: [] }, '/gestor'],
    ['moderador', m('MODERADOR'), '/moderador'],
    ['responsável que não vistoria', m('RESPONSAVEL'), '/responsavel/painel'],
    ['responsável que também vistoria', m('RESPONSAVEL', 'INSPECTOR'), '/desktop/inspetor'],
    ['inspetor', m('INSPECTOR'), '/desktop/inspetor'],
    ['visualizador', m('VIEWER'), '/desktop/visualizacao'],
  ])('%s', (_nome, user, destino) => {
    expect(destinoNoComputador(user)).toBe(destino);
  });
});

describe('o quadro do responsável', () => {
  it('põe o atrasado na frente, seja qual for a prioridade', () => {
    const alta = { id: 'a', priority: 'ALTA', sla: sla() };
    const baixaAtrasada = { id: 'b', priority: 'BAIXA', sla: sla({ atrasado: true, dias: 7, restantes: -2 }) };
    expect(ordenarColuna('ANDAMENTO', [alta, baixaAtrasada]).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('lê o que acabou pelo fim, e não pela abertura', () => {
    const antigoFechadoOntem = { id: 'a', created_at: '2026-01-01', closed_at: '2026-09-29' };
    const novoFechadoHaUmMes = { id: 'b', created_at: '2026-08-01', closed_at: '2026-08-30' };
    expect(ordenarColuna('CONCLUIDOS', [novoFechadoHaUmMes, antigoFechadoOntem]).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('cobra atenção do que espera aceite e do que está apertado — e só disso', () => {
    expect(precisaDeAtencao({ status: 'ENCAMINHADO', sla: sla() })).toBe(true);
    expect(precisaDeAtencao({ status: 'EM_ANDAMENTO', sla: sla({ em_risco: true }) })).toBe(true);
    expect(precisaDeAtencao({ status: 'EM_ANDAMENTO', sla: sla() })).toBe(false);
    // Com o moderador, o prazo não é mais trabalho dele.
    expect(precisaDeAtencao({ status: 'AGUARDANDO_FECHAMENTO', sla: sla({ atrasado: true }) })).toBe(false);
  });

  it('escreve o atraso, e não só o pinta', () => {
    expect(textoDoPrazo({ sla: sla({ atrasado: true, dias: 8, limite: 5 }) })).toBe('Atrasado há 3 dias úteis');
    expect(textoDoPrazo({ sla: sla({ restantes: 1 }) })).toBe('1 dia útil para o prazo');
    expect(textoDoPrazo({})).toBe('Sem prazo');
  });
});

describe('a atividade', () => {
  it('vira um evento por carimbo, do mais recente para o mais antigo', () => {
    const t = {
      id: 't1',
      forwarded_at: '2026-09-01T10:00:00Z',
      received_at: '2026-09-02T10:00:00Z',
      done_at: '2026-09-05T10:00:00Z',
      closed_at: null,
    };
    expect(eventosDaAtividade([t]).map((e) => e.tipo)).toEqual(['CONCLUIDO', 'RECEBIDO', 'ENCAMINHADO']);
  });
});
