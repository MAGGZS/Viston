import { generateInspectionExcel } from '../services/excel.service';
import { InspectionStatus, ItemCategory, ItemStatus } from '@prisma/client';

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
    floors_inspected: ['floor-1'],
    status: InspectionStatus.COMPLETED,
    excel_url: null,
    google_form_synced: false,
    google_form_synced_at: null,
    created_at: new Date(),
    inspector: { id: 'user-1', name: 'Carlos', email: 'carlos@test.com', role: 'INSPECTOR' },
    building: { id: 'building-1', name: 'Edifício Principal' },
    floor_form_entries: [
      {
        id: 'entry-1',
        report_id: 'report-1',
        floor_id: 'floor-1',
        status_geral: 'OK',
        observations: ['Tudo ok'],
        photos: [],
        completed_at: new Date(),
        floor: { id: 'floor-1', building_id: 'building-1', label: '6º Andar', order: 6 },
        form_item_responses: [
          { id: 'r1', floor_form_entry_id: 'entry-1', category: ItemCategory.MANUTENCAO, item_name: 'Cadeiras', has_item: true, quantity: 5, is_marked: true, status: null },
          { id: 'r2', floor_form_entry_id: 'entry-1', category: ItemCategory.MANUTENCAO, item_name: 'Ar-condicionado', has_item: null, quantity: null, is_marked: null, status: ItemStatus.OK },
          { id: 'r3', floor_form_entry_id: 'entry-1', category: ItemCategory.LIMPEZA, item_name: 'Carpete', has_item: null, quantity: null, is_marked: null, status: ItemStatus.OK },
        ],
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
});
