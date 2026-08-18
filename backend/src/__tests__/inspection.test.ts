import { inspectionService } from '../services/inspection.service';
import { inspectionRepository } from '../repositories/inspection.repository';
import { buildingRepository } from '../repositories/building.repository';
import { generateDayExcel } from '../services/excel.service';
import { storageService } from '../services/storage.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { FloorStatus, InspectionStatus } from '@prisma/client';

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/building.repository');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');

const mockInspectionRepo = inspectionRepository as jest.Mocked<typeof inspectionRepository>;
const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockGenerateExcel = generateDayExcel as jest.MockedFunction<typeof generateDayExcel>;
const mockStorage = storageService as jest.Mocked<typeof storageService>;

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
const FLOOR_6 = '22222222-2222-4222-8222-222222222222';
const FLOOR_SUB1 = '33333333-3333-4333-8333-333333333333';

const mockBuilding = { id: BUILDING_ID, name: 'Edifício Principal' };
const mockFloor6 = { id: FLOOR_6, building_id: BUILDING_ID, label: '6º Andar' };
const mockFloorSub1 = { id: FLOOR_SUB1, building_id: BUILDING_ID, label: '1º Subsolo' };

const RESPONSIBLE_ID = '44444444-4444-4444-8444-444444444444';

function makeRecord(overrides = {}) {
  return {
    maintenance_type: 'ELETRICA',
    category: 'CORRETIVA',
    priority: 'BAIXA',
    description: 'Lâmpada queimada',
    // O chamado pode nascer sem dono: quem sugere um responsável escolhe entre
    // os do prédio, e o serviço confere isso.
    responsible_id: null,
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

/** Quem envia a vistoria. Sempre conta de usuário: gestor não vistoria. */
function inspetor(id = 'user-1') {
  return { id, kind: 'USER', role: 'NONE' } as any;
}

/** Conta de gestor, para os casos em que ela não deve poder vistoriar. */
function gestor(id = 'gestor-1') {
  return { id, kind: 'MANAGER', role: 'NONE' } as any;
}

// ── Testes: inspectionService.submit ─────────────────────────────────────────
describe('inspectionService.submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateExcel.mockResolvedValue(Buffer.from('excel'));
    mockStorage.uploadDayExcel.mockResolvedValue('https://storage.example.com/day.xlsx');
    mockInspectionRepo.createCompleted.mockResolvedValue(makeReport());
    mockInspectionRepo.findById.mockResolvedValue(makeReport());
    mockInspectionRepo.findDayReports.mockResolvedValue([makeReport()]);
    mockBuildingRepo.getResponsibles.mockResolvedValue([
      { id: RESPONSIBLE_ID, name: 'Marina', email: 'marina@test.com', avatar_url: null },
    ] as any);
    // Inspetor vinculado ao prédio — o caso sem vínculo tem bloco próprio.
    // É o papel do vínculo que autoriza a vistoria; `users.role` não entra.
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'member-1', role: 'INSPECTOR' } as any);
  });

  it('grava a vistoria inteira já concluída em uma única chamada', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6, mockFloorSub1] as any);

    await inspectionService.submit(
      inspetor(),
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
      inspetor(),
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
      inspetor(),
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
      inspectionService.submit(inspetor(), payload([{ floor_id: FLOOR_6, records: [] }]))
    ).rejects.toThrow(NotFoundError);
  });

  it('lança NotFoundError quando andar não existe', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any); // só 1 de 2
    await expect(
      inspectionService.submit(
      inspetor(),
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
      inspetor(),
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
      inspetor(),
        payload([
          { floor_id: FLOOR_6, records: [] },
          { floor_id: FLOOR_6, records: [] },
        ])
      )
    ).rejects.toThrow(ConflictError);
  });

  it('grava o chamado sem dono quando o inspetor não sugere responsável', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any);

    await inspectionService.submit(
      inspetor(),
      payload([{ floor_id: FLOOR_6, records: [makeRecord()] }])
    );

    const arg = mockInspectionRepo.createCompleted.mock.calls[0][0];
    expect(arg.floors[0].records[0].responsible_id).toBeNull();
    expect(arg.floors[0].records[0].responsible).toBeNull();
  });

  it('grava o nome do responsável sugerido junto com o id', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any);

    await inspectionService.submit(
      inspetor(),
      payload([{ floor_id: FLOOR_6, records: [makeRecord({ responsible_id: RESPONSIBLE_ID })] }])
    );

    const arg = mockInspectionRepo.createCompleted.mock.calls[0][0];
    expect(arg.floors[0].records[0].responsible_id).toBe(RESPONSIBLE_ID);
    expect(arg.floors[0].records[0].responsible).toBe('Marina');
  });

  it('recusa responsável que não é responsável naquele prédio', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any);

    await expect(
      inspectionService.submit(
        inspetor(),
        payload([{ floor_id: FLOOR_6, records: [makeRecord({ responsible_id: 'outro-id' })] }])
      )
    ).rejects.toThrow(ConflictError);
  });

  it('gera a planilha do dia inteiro, e não a da vistoria recém-enviada', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any);
    // Já havia outra vistoria do mesmo prédio hoje
    const doDia = [makeReport({ id: 'report-0' }), makeReport()];
    mockInspectionRepo.findDayReports.mockResolvedValue(doDia as any);

    await inspectionService.submit(inspetor(), payload([{ floor_id: FLOOR_6, records: [] }]));

    expect(mockGenerateExcel).toHaveBeenCalledWith(doDia);
    // A URL nova vale para as duas vistorias daquele dia
    expect(mockInspectionRepo.setDayExcelUrl).toHaveBeenCalledWith(
      BUILDING_ID,
      expect.any(Date),
      'https://storage.example.com/day.xlsx'
    );
  });

  it('apaga a versão anterior da planilha do dia ao refazê-la', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any);
    mockInspectionRepo.findDayReports.mockResolvedValue([
      makeReport({ excel_url: 'https://storage.example.com/day-antiga.xlsx' }),
    ] as any);

    await inspectionService.submit(inspetor(), payload([{ floor_id: FLOOR_6, records: [] }]));

    // Nenhum relatório aponta mais para ela depois do setDayExcelUrl
    expect(mockStorage.removeExcel).toHaveBeenCalledWith('https://storage.example.com/day-antiga.xlsx');
  });

  it('conclui a vistoria mesmo se a geração do Excel falhar', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any);
    mockGenerateExcel.mockRejectedValue(new Error('boom'));

    const result = await inspectionService.submit(
      inspetor(),
      payload([{ floor_id: FLOOR_6, records: [] }])
    );

    expect(result?.status).toBe(InspectionStatus.COMPLETED);
  });
});

// ── Testes: descarte e a planilha compartilhada do dia ───────────────────────
describe('inspectionService.remove', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateExcel.mockResolvedValue(Buffer.from('excel'));
    mockStorage.uploadDayExcel.mockResolvedValue('https://storage.example.com/day-2.xlsx');
    // Quem descarta é o gestor do prédio
    mockBuildingRepo.findManagerLink.mockResolvedValue({ id: 'bm1' } as any);
  });

  it('refaz a planilha do dia quando ainda sobra vistoria naquela data', async () => {
    const alvo = makeReport({ excel_url: 'https://storage.example.com/day.xlsx' });
    mockInspectionRepo.findById.mockResolvedValue(alvo);
    mockInspectionRepo.findDayReports.mockResolvedValue([makeReport({ id: 'report-2' })] as any);

    await inspectionService.remove('report-1', gestor());

    expect(mockInspectionRepo.delete).toHaveBeenCalledWith('report-1');
    // O arquivo é de todas as vistorias do dia: apagá-lo deixaria as que
    // sobraram apontando para uma URL morta.
    expect(mockStorage.removeExcel).not.toHaveBeenCalledWith('https://storage.example.com/day.xlsx');
    expect(mockInspectionRepo.setDayExcelUrl).toHaveBeenCalled();
  });

  it('tira a planilha do bucket quando o dia fica sem nenhuma vistoria', async () => {
    const alvo = makeReport({ excel_url: 'https://storage.example.com/day.xlsx' });
    mockInspectionRepo.findById.mockResolvedValue(alvo);
    mockInspectionRepo.findDayReports.mockResolvedValue([]);

    await inspectionService.remove('report-1', gestor());

    expect(mockStorage.removeExcel).toHaveBeenCalledWith('https://storage.example.com/day.xlsx');
  });
});

// ── Testes: relatório completo do dia ────────────────────────────────────────
describe('inspectionService.getDayReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'VIEWER' } as any);
  });

  it('junta as vistorias do dia num documento só, com os inspetores separados', async () => {
    const entrada = (floorId: string, label: string, status: string, descricao: string) => ({
      floor_id: floorId,
      status_geral: status,
      floor: { id: floorId, label },
      maintenance_records: [
        { id: `r-${descricao}`, description: descricao, maintenance_cost: null },
      ],
    });

    const primeira = makeReport({
      floor_form_entries: [entrada(FLOOR_6, '6º Andar', 'OK', 'Lâmpada')],
    });
    const segunda = makeReport({
      id: 'report-2',
      inspector: { id: 'user-2', name: 'Marina', email: 'marina@test.com' },
      floor_form_entries: [entrada(FLOOR_6, '6º Andar', 'PROBLEMA', 'Infiltração')],
    });

    mockInspectionRepo.findById.mockResolvedValue(primeira);
    mockInspectionRepo.findDayReports.mockResolvedValue([primeira, segunda] as any);

    const day = await inspectionService.getDayReport('report-1', inspetor());

    expect(day.inspectors).toEqual(['Carlos', 'Marina']);
    expect(day.reports).toHaveLength(2);
    // O andar aparece uma vez, com as ocorrências das duas vistorias e a pior
    // situação relatada no dia.
    expect(day.floor_form_entries).toHaveLength(1);
    expect(day.floor_form_entries[0].status_geral).toBe('PROBLEMA');
    expect(day.floor_form_entries[0].maintenance_records).toHaveLength(2);
    // Cada ocorrência leva quem a relatou — é o que o documento do dia mostra
    expect(day.floor_form_entries[0].maintenance_records).toEqual([
      expect.objectContaining({ description: 'Lâmpada', inspector: 'Carlos' }),
      expect.objectContaining({ description: 'Infiltração', inspector: 'Marina' }),
    ]);
  });

  it('esconde o dia de quem não tem ligação com o prédio', async () => {
    mockInspectionRepo.findById.mockResolvedValue(makeReport());
    mockBuildingRepo.findMember.mockResolvedValue(null);

    await expect(inspectionService.getDayReport('report-1', inspetor('outro'))).rejects.toThrow(
      NotFoundError
    );
  });
});

// ── Testes: inspectionService.findAll (histórico) ────────────────────────────
describe('inspectionService.findAll', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna apenas relatórios COMPLETED por padrão', async () => {
    mockInspectionRepo.findAll.mockResolvedValue([[], 0]);
    await inspectionService.findAll({ page: 1, limit: 20 }, null);
    expect(mockInspectionRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20, building_ids: null })
    );
  });

  it('restringe a listagem aos prédios visíveis ao usuário', async () => {
    mockInspectionRepo.findAll.mockResolvedValue([[], 0]);
    await inspectionService.findAll({ page: 1, limit: 20 }, [BUILDING_ID]);
    expect(mockInspectionRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ building_ids: [BUILDING_ID] })
    );
  });
});

// ── Testes: isolamento por prédio ────────────────────────────────────────────
describe('isolamento por prédio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateExcel.mockResolvedValue(Buffer.from('excel'));
    mockStorage.uploadDayExcel.mockResolvedValue('https://storage.example.com/day.xlsx');
    mockInspectionRepo.createCompleted.mockResolvedValue(makeReport());
    mockInspectionRepo.findById.mockResolvedValue(makeReport());
    mockInspectionRepo.findDayReports.mockResolvedValue([makeReport()]);
    mockBuildingRepo.getResponsibles.mockResolvedValue([] as any);
  });

  it('bloqueia o envio quando o inspetor não é membro do prédio', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findMember.mockResolvedValue(null);

    await expect(
      inspectionService.submit(inspetor(), payload([{ floor_id: FLOOR_6, records: [] }]))
    ).rejects.toThrow(ForbiddenError);
  });

  it('bloqueia o envio de quem só visualiza o prédio', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'VIEWER' } as any);

    await expect(
      inspectionService.submit(inspetor(), payload([{ floor_id: FLOOR_6, records: [] }]))
    ).rejects.toThrow(ForbiddenError);
  });

  it('bloqueia o envio vindo de conta de gestor', async () => {
    // Gestor não vistoria: o relatório aponta para `users`, e ele não está lá.
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findManagerLink.mockResolvedValue({ id: 'bm1' } as any);

    await expect(
      inspectionService.submit(gestor(), payload([{ floor_id: FLOOR_6, records: [] }]))
    ).rejects.toThrow(ForbiddenError);
  });

  it('libera o envio para o inspetor do prédio', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any);
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'INSPECTOR' } as any);

    await inspectionService.submit(inspetor(), payload([{ floor_id: FLOOR_6, records: [] }]));

    expect(mockInspectionRepo.createCompleted).toHaveBeenCalledTimes(1);
  });

  it('libera o envio para ADMIN sem exigir vínculo', async () => {
    mockBuildingRepo.findById.mockResolvedValue(mockBuilding as any);
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([mockFloor6] as any);
    mockBuildingRepo.findMember.mockResolvedValue(null);

    await inspectionService.submit(
      { id: 'user-admin', kind: 'USER', role: 'ADMIN' } as any,
      payload([{ floor_id: FLOOR_6, records: [] }])
    );

    expect(mockBuildingRepo.findMember).not.toHaveBeenCalled();
    expect(mockInspectionRepo.createCompleted).toHaveBeenCalledTimes(1);
  });

  it('esconde o relatório de quem não é membro do prédio', async () => {
    mockBuildingRepo.findMember.mockResolvedValue(null);

    await expect(
      inspectionService.findById('report-1', inspetor('outro'))
    ).rejects.toThrow(NotFoundError);
  });

  it('entrega o relatório para o membro do prédio', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'VIEWER' } as any);

    const report = await inspectionService.findById('report-1', inspetor());
    expect(report.id).toBe('report-1');
  });
});
