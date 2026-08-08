import ExcelJS from 'exceljs';
import { InspectionReport, FloorFormEntry, FormItemResponse, Floor, Building, User } from '@prisma/client';

type FullReport = InspectionReport & {
  inspector: Pick<User, 'id' | 'name' | 'email'> | null;
  building: Building;
  floor_form_entries: (FloorFormEntry & {
    floor: Floor;
    form_item_responses: FormItemResponse[];
  })[];
};

const STATUS_LABEL: Record<string, string> = {
  OK: 'OK',
  NOK: 'Problema',
  NA: 'N/A',
  ATENCAO: 'Atenção',
  PROBLEMA: 'Problema',
};

function headerStyle(worksheet: ExcelJS.Worksheet, row: ExcelJS.Row, color = 'FF1F3A5F') {
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

export async function generateInspectionExcel(report: FullReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Viston';
  workbook.created = new Date();

  // ── Aba de Resumo ──────────────────────────────────────────────────────────
  const summary = workbook.addWorksheet('Resumo Geral');
  summary.columns = [
    { header: 'Campo', key: 'campo', width: 25 },
    { header: 'Valor', key: 'valor', width: 40 },
  ];
  headerStyle(summary, summary.getRow(1));

  const summaryData = [
    ['Prédio', report.building.name],
    ['Data da Vistoria', new Date(report.date).toLocaleDateString('pt-BR')],
    ['Inspetor', report.inspector?.name ?? 'Usuário removido'],
    ['Início', report.started_at ? new Date(report.started_at).toLocaleString('pt-BR') : '-'],
    ['Conclusão', report.finished_at ? new Date(report.finished_at).toLocaleString('pt-BR') : '-'],
    ['Andares Vistoriados', report.floor_form_entries.map((e) => e.floor.label).join(', ')],
    ['Sync Google Forms', report.google_form_synced ? 'Sim' : 'Não'],
  ];

  summaryData.forEach(([campo, valor]) => {
    const row = summary.addRow({ campo, valor });
    row.eachCell(dataCell);
  });

  // Tabela de status por andar
  summary.addRow([]);
  const statusHeader = summary.addRow(['Andar', 'Status Geral', 'Observações']);
  headerStyle(summary, statusHeader, 'FF2D6A4F');

  const sortedEntries = [...report.floor_form_entries].sort(
    (a, b) => a.floor.label.localeCompare(b.floor.label, 'pt-BR', { numeric: true })
  );

  sortedEntries.forEach((entry) => {
    const row = summary.addRow([
      entry.floor.label,
      STATUS_LABEL[entry.status_geral] ?? entry.status_geral,
      entry.observations.join(' | ') || '-',
    ]);
    row.eachCell(dataCell);
  });

  // ── Uma aba por andar ──────────────────────────────────────────────────────
  for (const entry of sortedEntries) {
    const ws = workbook.addWorksheet(entry.floor.label);
    ws.columns = [
      { header: 'Categoria', key: 'categoria', width: 15 },
      { header: 'Item', key: 'item', width: 20 },
      { header: 'Tem o item?', key: 'tem_item', width: 14 },
      { header: 'Quantidade', key: 'quantidade', width: 14 },
      { header: 'Marcado?', key: 'marcado', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    headerStyle(ws, ws.getRow(1));

    const items = entry.form_item_responses;

    // Manutenção
    const manutencaoItems = items.filter((i) => i.category === 'MANUTENCAO');
    manutencaoItems.forEach((item) => {
      const row = ws.addRow({
        categoria: 'Manutenção',
        item: item.item_name,
        tem_item: item.has_item === null ? '-' : item.has_item ? 'Sim' : 'Não',
        quantidade: item.quantity ?? '-',
        marcado: item.is_marked === null ? '-' : item.is_marked ? 'Sim' : 'Não',
        status: item.status ? STATUS_LABEL[item.status] : '-',
      });
      row.eachCell(dataCell);
    });

    // Limpeza
    const limpezaItems = items.filter((i) => i.category === 'LIMPEZA');
    limpezaItems.forEach((item) => {
      const row = ws.addRow({
        categoria: 'Limpeza',
        item: item.item_name,
        tem_item: item.has_item === null ? '-' : item.has_item ? 'Sim' : 'Não',
        quantidade: item.quantity ?? '-',
        marcado: item.is_marked === null ? '-' : item.is_marked ? 'Sim' : 'Não',
        status: item.status ? STATUS_LABEL[item.status] : '-',
      });
      row.eachCell(dataCell);
    });

    // Observações
    if (entry.observations.length > 0) {
      ws.addRow([]);
      const obsHeader = ws.addRow(['Observações', '', '', '', '', '']);
      ws.mergeCells(`A${obsHeader.number}:F${obsHeader.number}`);
      headerStyle(ws, obsHeader, 'FF6B4226');

      entry.observations.forEach((obs, i) => {
        const row = ws.addRow([`${i + 1}. ${obs}`, '', '', '', '', '']);
        ws.mergeCells(`A${row.number}:F${row.number}`);
        row.eachCell(dataCell);
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
