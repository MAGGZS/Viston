import { inspectionService } from '../services/inspection.service';
import { inspectionRepository } from '../repositories/inspection.repository';
import { buildingRepository } from '../repositories/building.repository';
import { generateInspectionExcel } from '../services/excel.service';
import { storageService } from '../services/storage.service';
import { ConflictError, NotFoundError } from '../utils/errors';
import { FloorStatus, InspectionStatus } from '@prisma/client';

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/building.repository');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');

const mockInspectionRepo = inspectionRepository as jest.Mocked<typeof inspectionRepository>;
const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockGenerateExcel = generateInspectionExcel as jest.MockedFunction<typeof generateInspectionExcel>;
const mockStorage = storageService as jest.Mocked<typeof storageService>;

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
const FLOOR_6 = '22222222-2222-4222-8222-222222222222';
const FLOOR_SUB1 = '33333333-3333-4333-8333-333333333333';

const mockBuilding = { id: BUILDING_ID, name: 'Edifício Principal' };
const mockFloor6 = { id: FLOOR_6, building_id: BUILDING_ID, label: '6º Andar' };
const mockFloorSub1 = { id: FLOOR_SUB1, building_id: BUILDING_ID, label: '1º Subsolo' };

function makeRecord(overrides = {}) {
  return {
    maintenance_type: 'ELETRICA',
    category: 'CORRETIVA',
    priority: 'BAIXA',
    description: 'Lâmpada queimada',
    responsible: 'Alan',
    status: 'ABERTO',
    ...overrides,
  } as any;
}

function makeReport(overrides = {}) {
  return {
    id: 'report-1',
    inspector_id: 'user-1',
    building_id: BUILDING_ID,
    date: new Date(),
    started_at: new Date(),
    finished_at: new Date(),
    floors_inspected: [FLOOR_6, FLOOR_SUB1],
    status: InspectionStatus.COMPLETED,
    excel_url: null,
    inspector: { id: 'user-1', name: 'Carlos', email: 'carlos@test.com', role: 'INSPECTOR' },
    building: mockBuilding,
    floor_form_entries: [],
    ...overrides,
  } as any;
}

function payload(floors: any[]) {
  return { building_id: BUILDING_ID, floors } as any;
}

// ── Testes: inspectionService.submit ─────────────────────────────────────────
describe('inspectionService.submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateExcel.mockResolvedValue(Buffer.from('excel'));
    mockStorage.uploadExcel.mockResolvedValue('https://storage.example.com/report.xlsx');
    mockInspectionRepo.createCompleted.mockResolvedValue(makeReport());
    mockInspectionRepo.findById.mockResolvedValue(makeReport());
  });

  it('grava a vistoria inteira já concluída em uma única chamada', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6, mockFloorSub1] as any);

    await inspectionService.submit(
      'user-1',
      payload([
        { floor_id: FLOOR_6, records: [makeRecord()] },
        { floor_id: FLOOR_SUB1, records: [] },
      ])
    );

    expect(mockInspectionRepo.createCompleted).toHaveBeenCalledTimes(1);
    const arg = mockInspectionRepo.createCompleted.mock.calls[0][0];
    expect(arg.finished_at).toBeInstanceOf(Date);
  });

  it('ordena os andares do mais alto para o mais baixo', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6, mockFloorSub1] as any);

    // Enviado fora de ordem: subsolo primeiro
    await inspectionService.submit(
      'user-1',
      payload([
        { floor_id: FLOOR_SUB1, records: [] },
        { floor_id: FLOOR_6, records: [] },
      ])
    );

    const arg = mockInspectionRepo.createCompleted.mock.calls[0][0];
    expect(arg.floors.map((f) => f.floor_id)).toEqual([FLOOR_6, FLOOR_SUB1]);
  });

  it('deriva o status do andar pela maior prioridade relatada', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6, mockFloorSub1] as any);

    await inspectionService.submit(
      'user-1',
      payload([
        { floor_id: FLOOR_6, records: [makeRecord({ priority: 'ALTA' })] },
        { floor_id: FLOOR_SUB1, records: [makeRecord({ priority: 'MEDIA' })] },
      ])
    );

    const arg = mockInspectionRepo.createCompleted.mock.calls[0][0];
    expect(arg.floors[0].status_geral).toBe(FloorStatus.PROBLEMA);
    expect(arg.floors[1].status_geral).toBe(FloorStatus.ATENCAO);
  });

  it('lança NotFoundError quando prédio não existe', async () => {
    mockBuildingRepo.findById.mockResolvedValue(null);
    await expect(
      inspectionService.submit('user-1', payload([{ floor_id: FLOOR_6, records: [] }]))
    ).rejects.toThrow(NotFoundError);
  });

  it('lança NotFoundError quando andar não existe', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any); // só 1 de 2
    await expect(
      inspectionService.submit(
        'user-1',
        payload([
          { floor_id: FLOOR_6, records: [] },
          { floor_id: FLOOR_SUB1, records: [] },
        ])
      )
    ).rejects.toThrow(NotFoundError);
  });

  it('lança ConflictError quando andar não pertence ao prédio', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([
      mockFloor6,
      { ...mockFloorSub1, building_id: 'other-building' },
    ] as any);

    await expect(
      inspectionService.submit(
        'user-1',
        payload([
          { floor_id: FLOOR_6, records: [] },
          { floor_id: FLOOR_SUB1, records: [] },
        ])
      )
    ).rejects.toThrow(ConflictError);
  });

  it('lança ConflictError quando o mesmo andar é enviado duas vezes', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    await expect(
      inspectionService.submit(
        'user-1',
        payload([
          { floor_id: FLOOR_6, records: [] },
          { floor_id: FLOOR_6, records: [] },
        ])
      )
    ).rejects.toThrow(ConflictError);
  });

  it('conclui a vistoria mesmo se a geração do Excel falhar', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any);
    mockGenerateExcel.mockRejectedValue(new Error('boom'));

    const result = await inspectionService.submit(
      'user-1',
      payload([{ floor_id: FLOOR_6, records: [] }])
    );

    expect(result?.status).toBe(InspectionStatus.COMPLETED);
  });
});

// ── Testes: inspectionService.findAll (histórico) ────────────────────────────
describe('inspectionService.findAll', () => {
  it('retorna apenas relatórios COMPLETED por padrão', async () => {
    mockInspectionRepo.findAll.mockResolvedValue([[], 0]);
    await inspectionService.findAll({ page: 1, limit: 20 });
    expect(mockInspectionRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 })
    );
  });
});
