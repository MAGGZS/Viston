import ExcelJS from 'exceljs';
import { generateInspectionExcel } from '../services/excel.service';
import { InspectionStatus } from '@prisma/client';

jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/building.repository');

function makeFullReport() {
  return {
    id: 'report-1',
    inspector_id: 'user-1',
    building_id: 'building-1',
    date: new Date('2024-01-15'),
    started_at: new Date('2024-01-15T08:00:00Z'),
    finished_at: new Date('2024-01-15T10:00:00Z'),
    floors_inspected: ['floor-1', 'floor-2'],
    status: InspectionStatus.COMPLETED,
    excel_url: null,
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
            status: 'ABERTO',
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
  } as any;
}

// ── Testes: generateInspectionExcel ──────────────────────────────────────────
describe('generateInspectionExcel', () => {
  it('gera um Buffer válido com dados do relatório', async () => {
    const buffer = await generateInspectionExcel(makeFullReport());
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('inclui dados do relatório no buffer gerado', async () => {
    const buffer = await generateInspectionExcel(makeFullReport());
    // Buffer de xlsx começa com PK (ZIP header)
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  it('monta o documento: prédio no topo, responsável e dia, andares abaixo', async () => {
    const buffer = await generateInspectionExcel(makeFullReport());
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
});
