import { inspectionService } from '../services/inspection.service';
import { inspectionRepository } from '../repositories/inspection.repository';
import { buildingRepository } from '../repositories/building.repository';
import { generateInspectionExcel } from '../services/excel.service';
import { storageService } from '../services/storage.service';
import { syncGoogleForms } from '../services/googleForms.service';
import { ConflictError, NotFoundError } from '../utils/errors';
import { InspectionStatus } from '@prisma/client';

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/building.repository');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');
jest.mock('../services/googleForms.service');

const mockInspectionRepo = inspectionRepository as jest.Mocked<typeof inspectionRepository>;
const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockGenerateExcel = generateInspectionExcel as jest.MockedFunction<typeof generateInspectionExcel>;
const mockStorage = storageService as jest.Mocked<typeof storageService>;
const mockSyncGoogleForms = syncGoogleForms as jest.MockedFunction<typeof syncGoogleForms>;

const mockBuilding = { id: 'building-1', name: 'Edifício Principal' };
const mockFloor1 = { id: 'floor-1', building_id: 'building-1', label: '6º Andar', order: 6 };
const mockFloor2 = { id: 'floor-2', building_id: 'building-1', label: '5º Andar', order: 5 };

function makeReport(overrides = {}) {
  return {
    id: 'report-1',
    inspector_id: 'user-1',
    building_id: 'building-1',
    date: new Date(),
    started_at: new Date(),
    finished_at: null,
    floors_inspected: ['floor-1', 'floor-2'],
    status: InspectionStatus.IN_PROGRESS,
    excel_url: null,
    google_form_synced: false,
    google_form_synced_at: null,
    created_at: new Date(),
    inspector: { id: 'user-1', name: 'Carlos', email: 'carlos@test.com', role: 'INSPECTOR' },
    building: mockBuilding,
    floor_form_entries: [],
    ...overrides,
  } as any;
}

// ── Testes: inspectionService.start ──────────────────────────────────────────
describe('inspectionService.start', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cria relatório quando prédio e andares são válidos', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor1, mockFloor2] as any);
    mockInspectionRepo.create.mockResolvedValue(makeReport());

    const result = await inspectionService.start('user-1', 'building-1', ['floor-1', 'floor-2']);
    expect(result.status).toBe(InspectionStatus.IN_PROGRESS);
    expect(mockInspectionRepo.create).toHaveBeenCalledTimes(1);
  });

  it('lança NotFoundError quando prédio não existe', async () => {
    mockBuildingRepo.findById.mockResolvedValue(null);
    await expect(
      inspectionService.start('user-1', 'invalid-building', ['floor-1'])
    ).rejects.toThrow(NotFoundError);
  });

  it('lança NotFoundError quando andar não existe', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor1] as any); // só 1 de 2
    await expect(
      inspectionService.start('user-1', 'building-1', ['floor-1', 'floor-invalid'])
    ).rejects.toThrow(NotFoundError);
  });

  it('lança ConflictError quando andar não pertence ao prédio', async () => {
    const wrongFloor = { ...mockFloor2, building_id: 'other-building' };
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor1, wrongFloor] as any);
    await expect(
      inspectionService.start('user-1', 'building-1', ['floor-1', 'floor-2'])
    ).rejects.toThrow(ConflictError);
  });
});

// ── Testes: inspectionService.finish ─────────────────────────────────────────
describe('inspectionService.finish', () => {
  beforeEach(() => jest.clearAllMocks());

  it('finaliza relatório quando todos os andares estão preenchidos', async () => {
    const completedReport = makeReport({
      status: InspectionStatus.IN_PROGRESS,
      floors_inspected: ['floor-1'],
      floor_form_entries: [{ floor_id: 'floor-1', form_item_responses: [] }],
    });
    const finishedReport = makeReport({ status: InspectionStatus.COMPLETED, finished_at: new Date() });

    mockInspectionRepo.findById
      .mockResolvedValueOnce(completedReport)
      .mockResolvedValueOnce(completedReport)
      .mockResolvedValueOnce(finishedReport);
    mockInspectionRepo.update.mockResolvedValue(finishedReport);
    mockGenerateExcel.mockResolvedValue(Buffer.from('excel'));
    mockStorage.uploadExcel.mockResolvedValue('https://storage.example.com/report.xlsx');
    mockSyncGoogleForms.mockResolvedValue(undefined);

    const result = await inspectionService.finish('report-1', 'user-1');
    expect(mockInspectionRepo.update).toHaveBeenCalledWith('report-1', expect.objectContaining({
      status: InspectionStatus.COMPLETED,
    }));
  });

  it('lança ConflictError quando há andares não preenchidos', async () => {
    const incompleteReport = makeReport({
      floors_inspected: ['floor-1', 'floor-2'],
      floor_form_entries: [{ floor_id: 'floor-1' }], // floor-2 faltando
    });
    mockInspectionRepo.findById.mockResolvedValue(incompleteReport);

    await expect(inspectionService.finish('report-1', 'user-1')).rejects.toThrow(ConflictError);
  });

  it('lança ConflictError quando relatório já está COMPLETED', async () => {
    mockInspectionRepo.findById.mockResolvedValue(
      makeReport({ status: InspectionStatus.COMPLETED })
    );
    await expect(inspectionService.finish('report-1', 'user-1')).rejects.toThrow(ConflictError);
  });

  it('lança NotFoundError quando relatório não existe', async () => {
    mockInspectionRepo.findById.mockResolvedValue(null);
    await expect(inspectionService.finish('invalid-id', 'user-1')).rejects.toThrow(NotFoundError);
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
