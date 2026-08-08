import ExcelJS from 'exceljs';
import {
  InspectionReport,
  FloorFormEntry,
  MaintenanceRecord,
  Floor,
  Building,
  User,
} from '@prisma/client';
import { sortFloorsDesc } from '../utils/floorOrder';
import {
  MAINTENANCE_TYPE_LABEL,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  RECORD_STATUS_LABEL,
} from '../utils/maintenanceOptions';

type FullReport = InspectionReport & {
  inspector: Pick<User, 'id' | 'name' | 'email'> | null;
  building: Building;
  floor_form_entries: (FloorFormEntry & {
    floor: Floor;
    maintenance_records: MaintenanceRecord[];
  })[];
};

const FLOOR_STATUS_LABEL: Record<string, string> = {
  OK: 'OK',
  ATENCAO: 'Atenção',
  PROBLEMA: 'Problema',
};

function headerStyle(row: ExcelJS.Row, color = 'FF1F3A5F') {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
}

function dataCell(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };
  cell.alignment = { vertical: 'middle', wrapText: true };
}

/** Nome de aba válido no Excel: sem caracteres proibidos e no máximo 31 chars. */
function sheetName(label: string) {
  return label.replace(/[\\/*?:[\]]/g, '-').slice(0, 31);
}

export async function generateInspectionExcel(report: FullReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Viston';
  workbook.created = new Date();

  // Andares do mais alto para o mais baixo — mesma ordem da vistoria
  const entries = sortFloorsDesc(
    report.floor_form_entries.map((entry) => ({ ...entry, label: entry.floor.label }))
  );

  const openedAt = new Date(report.date).toLocaleDateString('pt-BR');
  const inspectorName = report.inspector?.name ?? 'Usuário removido';
  const totalRecords = entries.reduce((sum, e) => sum + e.maintenance_records.length, 0);

  // ── Aba de Resumo ──────────────────────────────────────────────────────────
  const summary = workbook.addWorksheet('Resumo Geral');
  summary.columns = [
    { header: 'Campo', key: 'campo', width: 25 },
    { header: 'Valor', key: 'valor', width: 45 },
  ];
  headerStyle(summary.getRow(1));

  const summaryData = [
    ['Prédio', report.building.name],
    ['Data de abertura', openedAt],
    ['Responsável pela vistoria', inspectorName],
    ['Conclusão', report.finished_at ? new Date(report.finished_at).toLocaleString('pt-BR') : '-'],
    ['Andares vistoriados', entries.map((e) => e.floor.label).join(', ') || '-'],
    ['Total de ocorrências', String(totalRecords)],
  ];

  summaryData.forEach(([campo, valor]) => {
    const row = summary.addRow({ campo, valor });
    row.eachCell(dataCell);
  });

  summary.addRow([]);
  const statusHeader = summary.addRow(['Andar', 'Status geral', 'Ocorrências']);
  headerStyle(statusHeader, 'FF2D6A4F');

  entries.forEach((entry) => {
    const row = summary.addRow([
      entry.floor.label,
      FLOOR_STATUS_LABEL[entry.status_geral] ?? entry.status_geral,
      entry.maintenance_records.length,
    ]);
    row.eachCell(dataCell);
  });

  // ── Aba única com todas as ocorrências ─────────────────────────────────────
  const occurrenceColumns: Partial<ExcelJS.Column>[] = [
    { header: 'Data de abertura', key: 'data', width: 18 },
    { header: 'Andar - Unidade', key: 'andar', width: 18 },
    { header: 'Tipo de manutenção', key: 'tipo', width: 22 },
    { header: 'Categoria', key: 'categoria', width: 16 },
    { header: 'Prioridade', key: 'prioridade', width: 12 },
    { header: 'Descrição', key: 'descricao', width: 50 },
    { header: 'Responsável', key: 'responsavel', width: 16 },
    { header: 'Status', key: 'status', width: 20 },
  ];

  function recordRow(entry: (typeof entries)[number], record: MaintenanceRecord) {
    return {
      data: openedAt,
      andar: entry.floor.label,
      tipo: MAINTENANCE_TYPE_LABEL[record.maintenance_type] ?? record.maintenance_type,
      categoria: CATEGORY_LABEL[record.category] ?? record.category,
      prioridade: PRIORITY_LABEL[record.priority] ?? record.priority,
      descricao: record.description,
      responsavel: record.responsible,
      status: RECORD_STATUS_LABEL[record.status] ?? record.status,
    };
  }

  const all = workbook.addWorksheet('Ocorrências');
  all.columns = occurrenceColumns;
  headerStyle(all.getRow(1));

  entries.forEach((entry) => {
    entry.maintenance_records.forEach((record) => {
      all.addRow(recordRow(entry, record)).eachCell(dataCell);
    });
  });

  // ── Uma aba por andar ──────────────────────────────────────────────────────
  for (const entry of entries) {
    const ws = workbook.addWorksheet(sheetName(entry.floor.label));
    ws.columns = occurrenceColumns.filter((c) => c.key !== 'andar');
    headerStyle(ws.getRow(1));

    if (entry.maintenance_records.length === 0) {
      const row = ws.addRow(['Nenhuma ocorrência relatada neste andar']);
      ws.mergeCells(`A${row.number}:G${row.number}`);
      row.eachCell(dataCell);
      continue;
    }

    entry.maintenance_records.forEach((record) => {
      const { andar, ...rest } = recordRow(entry, record);
      ws.addRow(rest).eachCell(dataCell);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
