const ExcelJS = require('exceljs');

const STATUS_LABEL = { OK: 'OK', ATENCAO: 'Atenção', PROBLEMA: 'Problema' };
const ITEM_STATUS_LABEL = { OK: 'OK', NOK: 'NOK', NA: 'N/A' };

async function generateExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Viston';

  // Summary sheet
  const summary = workbook.addWorksheet('Resumo');
  summary.columns = [
    { header: 'Andar', key: 'floor', width: 20 },
    { header: 'Status Geral', key: 'status', width: 15 },
    { header: 'Observações', key: 'notes', width: 40 },
    { header: 'Fotos', key: 'photos', width: 10 },
  ];

  styleHeader(summary.getRow(1));

  const entries = [...report.floorEntries].sort((a, b) => b.floor.order - a.floor.order);

  for (const entry of entries) {
    const row = summary.addRow({
      floor: entry.floor.label,
      status: STATUS_LABEL[entry.statusGeral],
      notes: entry.notes || '',
      photos: entry.photos?.length || 0,
    });
    colorStatusCell(row.getCell('status'), entry.statusGeral);
  }

  // One sheet per floor
  for (const entry of entries) {
    const ws = workbook.addWorksheet(entry.floor.label.substring(0, 31));
    ws.columns = [
      { header: 'Item', key: 'item', width: 30 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Observação', key: 'observation', width: 40 },
    ];
    styleHeader(ws.getRow(1));

    for (const item of entry.items) {
      const row = ws.addRow({
        item: item.itemName,
        status: ITEM_STATUS_LABEL[item.status],
        observation: item.observation || '',
      });
      colorItemStatusCell(row.getCell('status'), item.status);
    }

    if (entry.notes) {
      ws.addRow([]);
      ws.addRow(['Observações gerais:', entry.notes]);
    }
  }

  return workbook.xlsx.writeBuffer();
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FF1A1A1A' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5C518' } };
  row.alignment = { vertical: 'middle' };
}

function colorStatusCell(cell, status) {
  const colors = { OK: 'FF22c55e', ATENCAO: 'FFf59e0b', PROBLEMA: 'FFef4444' };
  if (colors[status]) {
    cell.font = { color: { argb: colors[status] }, bold: true };
  }
}

function colorItemStatusCell(cell, status) {
  const colors = { OK: 'FF22c55e', NOK: 'FFef4444', NA: 'FF9A9A9A' };
  if (colors[status]) {
    cell.font = { color: { argb: colors[status] }, bold: true };
  }
}

module.exports = { generateExcel };
