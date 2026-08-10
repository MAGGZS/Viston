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
import { APP_TIMEZONE } from '../utils/timezone';

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

// Paleta do documento
const BRAND = 'FFC00000'; // vermelho do cabeçalho e das faixas de andar
const HEADER = 'FF900000'; // vermelho mais escuro que a faixa, na linha de títulos das colunas
const GOLD = 'FFF5C518'; // status do andar sobre a faixa
const WHITE = 'FFFFFFFF';
const ZEBRA = 'FFF6F6F8';
const BORDER = 'FFD9D9E0';

const PRIORITY_COLOR: Record<string, string> = {
  ALTA: 'FFB91C1C',
  MEDIA: 'FFB45309',
  BAIXA: 'FF5B5B66',
};

const COLUMNS = [
  { header: 'Tipo de manutenção', width: 22 },
  { header: 'Categoria', width: 16 },
  { header: 'Prioridade', width: 13 },
  { header: 'Descrição', width: 58 },
  { header: 'Responsável', width: 16 },
  { header: 'Status', width: 20 },
];

const LAST_COL = 'F';

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: BORDER } },
    bottom: { style: 'thin', color: { argb: BORDER } },
    left: { style: 'thin', color: { argb: BORDER } },
    right: { style: 'thin', color: { argb: BORDER } },
  };
}

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/**
 * Planilha da vistoria, no mesmo formato do relatório do sistema:
 * prédio e responsável no topo, andares em faixas e as ocorrências abaixo de cada um.
 */
export async function generateInspectionExcel(report: FullReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Viston';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Vistoria', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });

  ws.columns = COLUMNS.map((c) => ({ width: c.width }));

  const entries = sortFloorsDesc(
    report.floor_form_entries.map((entry) => ({ ...entry, label: entry.floor.label }))
  );
  // `date` é coluna DATE (meia-noite UTC): formatar em UTC, senão cai no dia anterior
  const openedAt = new Date(report.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const inspectorName = report.inspector?.name ?? 'Usuário removido';

  // ── Cabeçalho: prédio, responsável e dia ───────────────────────────────────
  const titleRow = ws.addRow([report.building.name]);
  ws.mergeCells(`A${titleRow.number}:${LAST_COL}${titleRow.number}`);
  titleRow.height = 34;
  const titleCell = ws.getCell(`A${titleRow.number}`);
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: WHITE } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  titleRow.eachCell({ includeEmpty: true }, (cell) => fill(cell, BRAND));

  const subtitleRow = ws.addRow([`Vistoria realizada por ${inspectorName}  ·  ${openedAt}`]);
  ws.mergeCells(`A${subtitleRow.number}:${LAST_COL}${subtitleRow.number}`);
  subtitleRow.height = 22;
  const subtitleCell = ws.getCell(`A${subtitleRow.number}`);
  subtitleCell.font = { name: 'Calibri', size: 11, color: { argb: WHITE } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  subtitleRow.eachCell({ includeEmpty: true }, (cell) => fill(cell, BRAND));

  const totalRecords = entries.reduce((sum, e) => sum + e.maintenance_records.length, 0);
  const statsRow = ws.addRow([
    `${entries.length} andar(es) vistoriado(s)  ·  ${totalRecords} ocorrência(s)`,
  ]);
  ws.mergeCells(`A${statsRow.number}:${LAST_COL}${statsRow.number}`);
  statsRow.height = 20;
  const statsCell = ws.getCell(`A${statsRow.number}`);
  statsCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF6B6B78' } };
  statsCell.alignment = { vertical: 'middle', indent: 1 };

  ws.addRow([]);

  // ── Um bloco por andar, do mais alto para o mais baixo ─────────────────────
  for (const entry of entries) {
    const status = FLOOR_STATUS_LABEL[entry.status_geral] ?? entry.status_geral;

    const bandRow = ws.addRow([`${entry.floor.label}`, '', '', '', '', status]);
    ws.mergeCells(`A${bandRow.number}:E${bandRow.number}`);
    bandRow.height = 26;
    bandRow.eachCell({ includeEmpty: true }, (cell) => fill(cell, BRAND));
    const bandLabel = ws.getCell(`A${bandRow.number}`);
    bandLabel.font = { name: 'Calibri', size: 13, bold: true, color: { argb: WHITE } };
    bandLabel.alignment = { vertical: 'middle', indent: 1 };
    const bandStatus = ws.getCell(`${LAST_COL}${bandRow.number}`);
    bandStatus.font = { name: 'Calibri', size: 10, bold: true, color: { argb: GOLD } };
    bandStatus.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };

    if (entry.maintenance_records.length === 0) {
      const emptyRow = ws.addRow(['Nada a relatar neste andar.']);
      ws.mergeCells(`A${emptyRow.number}:${LAST_COL}${emptyRow.number}`);
      const emptyCell = ws.getCell(`A${emptyRow.number}`);
      emptyCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF8A8A96' } };
      emptyCell.alignment = { vertical: 'middle', indent: 1 };
      emptyCell.border = thinBorder();
      ws.addRow([]);
      continue;
    }

    const headerRow = ws.addRow(COLUMNS.map((c) => c.header));
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      fill(cell, HEADER);
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = thinBorder();
    });

    entry.maintenance_records.forEach((record, index) => {
      const row = ws.addRow([
        MAINTENANCE_TYPE_LABEL[record.maintenance_type] ?? record.maintenance_type,
        CATEGORY_LABEL[record.category] ?? record.category,
        PRIORITY_LABEL[record.priority] ?? record.priority,
        record.description,
        record.responsible,
        RECORD_STATUS_LABEL[record.status] ?? record.status,
      ]);

      row.eachCell((cell) => {
        cell.border = thinBorder();
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1B1B1F' } };
        if (index % 2 === 1) fill(cell, ZEBRA);
      });

      // Prioridade em destaque
      const priorityCell = row.getCell(3);
      priorityCell.font = {
        name: 'Calibri',
        size: 10,
        bold: record.priority === 'ALTA',
        color: { argb: PRIORITY_COLOR[record.priority] ?? 'FF1B1B1F' },
      };
    });

    ws.addRow([]);
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────
  const footerRow = ws.addRow([
    `Concluída em ${
      report.finished_at
        ? new Date(report.finished_at).toLocaleString('pt-BR', { timeZone: APP_TIMEZONE })
        : '—'
    }  ·  Viston`,
  ]);
  ws.mergeCells(`A${footerRow.number}:${LAST_COL}${footerRow.number}`);
  const footerCell = ws.getCell(`A${footerRow.number}`);
  footerCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF8A8A96' } };
  footerCell.alignment = { vertical: 'middle', indent: 1 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
