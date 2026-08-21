import ExcelJS from 'exceljs';
import { generateDayExcel } from '../services/excel.service';
import { InspectionStatus } from '@prisma/client';

jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/building.repository');

function makeFullReport(overrides: any = {}) {
  return {
    id: 'report-1',
    inspector_id: 'user-1',
    building_id: 'building-1',
    date: new Date('2024-01-15'),
    started_at: new Date('2024-01-15T08:00:00Z'),
    finished_at: new Date('2024-01-15T10:00:00Z'),
    floors_inspected: ['floor-1', 'floor-2'],
    status: InspectionStatus.COMPLETED,
    excel_path: null,
    created_at: new Date(),
    inspector: { id: 'user-1', name: 'Carlos', email: 'carlos@test.com', role: 'INSPECTOR' },
    building: { id: 'building-1', name: 'Edifício Principal' },
    floor_form_entries: [
      {
        id: 'entry-1',
        report_id: 'report-1',
        floor_id: 'floor-1',
        status_geral: 'PROBLEMA',
        completed_at: new Date(),
        floor: { id: 'floor-1', building_id: 'building-1', label: '6º Andar' },
        maintenance_records: [
          {
            id: 'r1',
            floor_form_entry_id: 'entry-1',
            maintenance_type: 'AR_CONDICIONADO',
            category: 'CORRETIVA',
            priority: 'ALTA',
            description: 'Split da sala 601 sem gelar',
            responsible: 'Alan',
            responsible_id: null,
            status: 'ABERTO',
            forwarded_at: null,
            done_at: null,
            closed_at: null,
            closed_by_id: null,
            maintenance_note: null,
            maintenance_cost: null,
            created_at: new Date(),
          },
        ],
      },
      {
        id: 'entry-2',
        report_id: 'report-1',
        floor_id: 'floor-2',
        status_geral: 'OK',
        completed_at: new Date(),
        floor: { id: 'floor-2', building_id: 'building-1', label: '1º Subsolo' },
        maintenance_records: [],
      },
    ],
    ...overrides,
  } as any;
}

/** Segunda vistoria do mesmo prédio no mesmo dia, por outra pessoa. */
function makeSecondReport() {
  return makeFullReport({
    id: 'report-2',
    inspector_id: 'user-2',
    inspector: { id: 'user-2', name: 'Marina', email: 'marina@test.com', role: 'INSPECTOR' },
    floor_form_entries: [
      {
        id: 'entry-3',
        report_id: 'report-2',
        floor_id: 'floor-2',
        status_geral: 'PROBLEMA',
        completed_at: new Date(),
        floor: { id: 'floor-2', building_id: 'building-1', label: '1º Subsolo' },
        maintenance_records: [
          {
            id: 'r2',
            floor_form_entry_id: 'entry-3',
            maintenance_type: 'VAZAMENTO',
            category: 'EMERGENCIAL',
            priority: 'ALTA',
            description: 'Vazamento na garagem',
            responsible: null,
            responsible_id: null,
            status: 'ABERTO',
            forwarded_at: null,
            done_at: null,
            closed_at: null,
            closed_by_id: null,
            maintenance_note: null,
            maintenance_cost: null,
            created_at: new Date(),
          },
        ],
      },
    ],
  });
}

// ── Testes: generateDayExcel ─────────────────────────────────────────────────
describe('generateDayExcel', () => {
  it('gera um Buffer válido com dados do relatório', async () => {
    const buffer = await generateDayExcel([makeFullReport()]);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('inclui dados do relatório no buffer gerado', async () => {
    const buffer = await generateDayExcel([makeFullReport()]);
    // Buffer de xlsx começa com PK (ZIP header)
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  it('monta o documento: prédio no topo, quem vistoriou e o dia, andares abaixo', async () => {
    const buffer = await generateDayExcel([makeFullReport()]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.getWorksheet('Vistoria')!;

    expect(ws).toBeDefined();
    expect(ws.getCell('A1').value).toBe('Edifício Principal');
    expect(String(ws.getCell('A2').value)).toContain('Carlos');
    expect(String(ws.getCell('A2').value)).toContain('15/01/2024');

    const texto: string[] = [];
    ws.eachRow((row) => row.eachCell((cell) => texto.push(String(cell.value ?? ''))));

    // Andares como faixa, do mais alto para o mais baixo
    expect(texto.indexOf('6º Andar')).toBeGreaterThan(-1);
    expect(texto.indexOf('6º Andar')).toBeLessThan(texto.indexOf('1º Subsolo'));

    // Dados exatos da ocorrência
    expect(texto).toContain('Ar condicionado');
    expect(texto).toContain('Corretiva');
    expect(texto).toContain('Alta');
    expect(texto).toContain('Split da sala 601 sem gelar');
    expect(texto).toContain('Alan');
    expect(texto).toContain('Aberto');

    // Andar sem ocorrência
    expect(texto).toContain('Nada a relatar neste andar.');
  });

  it('junta as vistorias do dia numa planilha só, com os nomes separados por barra', async () => {
    const buffer = await generateDayExcel([makeFullReport(), makeSecondReport()]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.getWorksheet('Vistoria')!;

    expect(String(ws.getCell('A2').value)).toBe('Inspeção feita por: Carlos / Marina  ·  15/01/2024');

    const texto: string[] = [];
    ws.eachRow((row) => row.eachCell((cell) => texto.push(String(cell.value ?? ''))));

    // As ocorrências das duas vistorias entram no mesmo documento
    expect(texto).toContain('Split da sala 601 sem gelar');
    expect(texto).toContain('Vazamento na garagem');

    // O andar aparece numa faixa só, com a pior situação relatada no dia: a
    // primeira vistoria deu OK no subsolo, a segunda achou problema lá.
    // (A faixa é mesclada A:E, então a contagem é por linha, não por célula.)
    const faixas: string[] = [];
    ws.eachRow((row) => faixas.push(String(row.getCell(1).value ?? '')));
    expect(faixas.filter((t) => t === '1º Subsolo')).toHaveLength(1);
    expect(texto).toContain('Problema');
    expect(texto).not.toContain('Nada a relatar neste andar.');
  });

  it('mostra "A encaminhar" na ocorrência que ainda não tem responsável', async () => {
    const buffer = await generateDayExcel([makeSecondReport()]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.getWorksheet('Vistoria')!;

    const texto: string[] = [];
    ws.eachRow((row) => row.eachCell((cell) => texto.push(String(cell.value ?? ''))));
    expect(texto).toContain('A encaminhar');
  });
});
