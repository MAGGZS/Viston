/**
 * O dono do prédio nasce com ele.
 *
 * Esta suíte troca o Prisma por um dublê, o que nenhuma outra faz aqui — e é de
 * propósito: o que se cobre é exatamente a coluna que o repositório grava, e em
 * todas as outras suítes o repositório é justamente o que está mockado. Sem
 * isto, "o prédio novo nasce sem dono" passa por todos os 480 testes, como
 * passou.
 */
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    building: { create: jest.fn() },
    buildingManager: { create: jest.fn() },
  },
}));

import { prisma } from '../lib/prisma';
import { buildingRepository } from '../repositories/building.repository';

const mockPrisma = prisma as unknown as {
  $transaction: jest.Mock;
  building: { create: jest.Mock };
  buildingManager: { create: jest.Mock };
};

const MANAGER_ID = 'm1111111-1111-4111-8111-111111111111';
const BUILDING_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();

  // A transação roda o que lhe deram, com o mesmo cliente dublê.
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
  mockPrisma.building.create.mockResolvedValue({ id: BUILDING_ID });
  mockPrisma.buildingManager.create.mockResolvedValue({ id: 'link-1' });
});

describe('buildingRepository.create', () => {
  it('grava quem criou como dono do prédio', async () => {
    await buildingRepository.create({ name: 'Edifício Aurora', created_by: MANAGER_ID });

    expect(mockPrisma.building.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Edifício Aurora',
        created_by: MANAGER_ID,
        owner_manager_id: MANAGER_ID,
      }),
    });
  });

  it('o vínculo de gestão continua saindo no mesmo gesto', async () => {
    await buildingRepository.create({ name: 'Edifício Aurora', created_by: MANAGER_ID });

    expect(mockPrisma.buildingManager.create).toHaveBeenCalledWith({
      data: { building_id: BUILDING_ID, manager_id: MANAGER_ID },
    });
  });

  it('a chave de compartilhamento vai junto, e não vem de fora', async () => {
    await buildingRepository.create({ name: 'Edifício Aurora', created_by: MANAGER_ID });

    const { data } = mockPrisma.building.create.mock.calls[0][0];
    expect(typeof data.share_key).toBe('string');
    expect(data.share_key.length).toBeGreaterThan(6);
  });
});
