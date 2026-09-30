import { PlanCode, SubscriptionStatus } from '@prisma/client';
import { createLimiter } from '../lib/concurrency';
import { planService } from '../services/plan.service';
import { planRepository } from '../repositories/plan.repository';
import { paginationSchema } from '../validators/pagination.validator';

jest.mock('../repositories/plan.repository');

const mockPlans = planRepository as jest.Mocked<typeof planRepository>;

/** Uma tarefa que só termina quando o teste manda. */
function adiada() {
  let terminar!: () => void;
  const promessa = new Promise<void>((resolve) => {
    terminar = resolve;
  });
  return { promessa, terminar };
}

const tique = () => new Promise((resolve) => setImmediate(resolve));

describe('createLimiter', () => {
  it('nunca passa do teto, nem quando alguém chega na hora em que uma vaga abre', async () => {
    const run = createLimiter(2);
    let rodando = 0;
    let pico = 0;

    const tarefas = Array.from({ length: 6 }, () => adiada());
    const execucoes = tarefas.map((t) =>
      run(async () => {
        rodando++;
        pico = Math.max(pico, rodando);
        await t.promessa;
        rodando--;
      })
    );

    await tique();
    expect(rodando).toBe(2);

    // Solta uma e, no mesmo instante, chega mais uma de fora da fila.
    tarefas[0].terminar();
    const intrusa = run(async () => {
      rodando++;
      pico = Math.max(pico, rodando);
      rodando--;
    });
    await tique();
    expect(pico).toBe(2);

    tarefas.forEach((t) => t.terminar());
    await Promise.all([...execucoes, intrusa]);
    expect(pico).toBe(2);
  });

  it('libera a vaga mesmo quando a tarefa falha', async () => {
    const run = createLimiter(1);

    await expect(run(() => Promise.reject(new Error('falhou')))).rejects.toThrow('falhou');
    await expect(run(() => Promise.resolve('seguiu'))).resolves.toBe('seguiu');
  });
});

describe('planService.resolvePlans', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolve várias contas em duas consultas, com a mesma precedência de resolvePlan', async () => {
    mockPlans.findActiveGrants.mockResolvedValue([
      // Mais recente primeiro: é a que vale.
      { manager_id: 'a', plan: PlanCode.PRO },
      { manager_id: 'a', plan: PlanCode.ESSENCIAL },
    ] as never);
    mockPlans.findActiveSubscriptions.mockResolvedValue([
      { manager_id: 'a', plan: PlanCode.ESSENCIAL, status: SubscriptionStatus.ACTIVE, extra_buildings: 0 },
      { manager_id: 'b', plan: PlanCode.ESSENCIAL, status: SubscriptionStatus.ACTIVE, extra_buildings: 1 },
    ] as never);

    const planos = await planService.resolvePlans(['a', 'b', 'c']);

    expect(mockPlans.findActiveGrants).toHaveBeenCalledTimes(1);
    expect(mockPlans.findActiveSubscriptions).toHaveBeenCalledTimes(1);
    expect(planos.get('a')).toMatchObject({ code: PlanCode.PRO, source: 'CONCESSAO' });
    expect(planos.get('b')).toMatchObject({ code: PlanCode.ESSENCIAL, source: 'ASSINATURA', extraBuildings: 1 });
    expect(planos.get('c')).toMatchObject({ source: 'PADRAO' });
  });

  it('lista vazia não vai ao banco', async () => {
    await planService.resolvePlans([]);

    expect(mockPlans.findActiveGrants).not.toHaveBeenCalled();
  });
});

describe('paginationSchema', () => {
  it('recusa página que não é número e limite acima do teto', () => {
    expect(() => paginationSchema.parse({ page: 'abc' })).toThrow();
    expect(() => paginationSchema.parse({ limit: '100000' })).toThrow();
  });

  it('assume página 1 e 20 por página', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 20 });
  });
});
