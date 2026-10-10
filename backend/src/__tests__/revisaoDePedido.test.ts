/**
 * A revisão do pedido de acesso só vale uma vez (SEC-02).
 *
 * Como em `donoDoPredio.test.ts`, esta suíte troca o Prisma por um dublê em vez
 * de mockar o repositório: o que se cobre é justamente a condição que o
 * repositório põe no UPDATE, e nas suítes que importam o app o repositório é o
 * que está mockado. Não importa o app, então não há rota nem repositório a
 * mockar além do Prisma.
 *
 * O cenário que importa é o de duas revisões do mesmo pedido em paralelo, cada
 * uma numa instância do backend: as duas passam pela conferência do controller
 * (o pedido ainda estava PENDING quando leram), e quem decide é o UPDATE
 * condicional. Quem chega depois encontra zero linhas e não pode criar vínculo.
 */
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    buildingAccessRequest: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    buildingMember: { create: jest.fn() },
  },
}));

import { BuildingRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { buildingRepository } from '../repositories/building.repository';
import { ConflictError } from '../utils/errors';

const mockPrisma = prisma as unknown as {
  $transaction: jest.Mock;
  buildingAccessRequest: { updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
  buildingMember: { create: jest.Mock };
};

const REQUEST_ID = 'dddddddd-4444-4444-8444-444444444444';
const BUILDING_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const USER_ID = 'cccccccc-3333-4333-8333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();

  // A transação roda o que lhe deram, com o mesmo cliente dublê.
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
  mockPrisma.buildingAccessRequest.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.buildingAccessRequest.findUniqueOrThrow.mockResolvedValue({
    id: REQUEST_ID,
    building_id: BUILDING_ID,
    user_id: USER_ID,
    status: 'APPROVED',
  });
  mockPrisma.buildingMember.create.mockResolvedValue({ id: 'member-1' });
});

describe('buildingRepository.reviewAccessRequest', () => {
  it('só troca o status do pedido que ainda está PENDING e é deste prédio', async () => {
    await buildingRepository.reviewAccessRequest(REQUEST_ID, BUILDING_ID, 'APPROVED', BuildingRole.INSPECTOR);

    expect(mockPrisma.buildingAccessRequest.updateMany).toHaveBeenCalledWith({
      where: { id: REQUEST_ID, building_id: BUILDING_ID, status: 'PENDING' },
      data: { status: 'APPROVED', reviewed_at: expect.any(Date) },
    });
    expect(mockPrisma.buildingMember.create).toHaveBeenCalledWith({
      data: { building_id: BUILDING_ID, user_id: USER_ID, role: BuildingRole.INSPECTOR },
    });
  });

  it('revisado em paralelo (zero linhas) dá 409 e não cria vínculo', async () => {
    mockPrisma.buildingAccessRequest.updateMany.mockResolvedValue({ count: 0 });

    const revisao = buildingRepository.reviewAccessRequest(
      REQUEST_ID,
      BUILDING_ID,
      'APPROVED',
      BuildingRole.INSPECTOR
    );

    await expect(revisao).rejects.toBeInstanceOf(ConflictError);
    await expect(revisao).rejects.toMatchObject({ statusCode: 409, message: 'Solicitação já foi revisada' });
    expect(mockPrisma.buildingAccessRequest.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockPrisma.buildingMember.create).not.toHaveBeenCalled();
  });

  it('a recusa usa a mesma condição e nunca cria vínculo', async () => {
    mockPrisma.buildingAccessRequest.findUniqueOrThrow.mockResolvedValue({
      id: REQUEST_ID,
      building_id: BUILDING_ID,
      user_id: USER_ID,
      status: 'REJECTED',
    });

    const row = await buildingRepository.reviewAccessRequest(REQUEST_ID, BUILDING_ID, 'REJECTED');

    expect(row.status).toBe('REJECTED');
    expect(mockPrisma.buildingAccessRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REQUEST_ID, building_id: BUILDING_ID, status: 'PENDING' } })
    );
    expect(mockPrisma.buildingMember.create).not.toHaveBeenCalled();
  });
});
