const puppeteer = require('puppeteer');

const STATUS_LABEL = { OK: 'OK', ATENCAO: 'Atenção', PROBLEMA: 'Problema' };
const STATUS_COLOR = { OK: '#22c55e', ATENCAO: '#f59e0b', PROBLEMA: '#ef4444' };
const ITEM_STATUS_LABEL = { OK: 'OK', NOK: 'NOK', NA: 'N/A' };

function buildHtml(report) {
  const date = new Date(report.date).toLocaleDateString('pt-BR');
  const entries = [...report.floorEntries].sort((a, b) => b.floor.order - a.floor.order);

  const floorSections = entries.map((entry) => {
    const color = STATUS_COLOR[entry.statusGeral] || '#9A9A9A';
    const rows = entry.items.map((item) => `
      <tr>
        <td>${item.itemName}</td>
        <td style="color:${item.status === 'OK' ? '#22c55e' : item.status === 'NOK' ? '#ef4444' : '#9A9A9A'}">${ITEM_STATUS_LABEL[item.status]}</td>
        <td>${item.observation || '—'}</td>
      </tr>`).join('');

    return `
      <div class="floor-section">
        <h3>${entry.floor.label} <span style="color:${color}">[${STATUS_LABEL[entry.statusGeral]}]</span></h3>
        <table>
          <thead><tr><th>Item</th><th>Status</th><th>Observação</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${entry.notes ? `<p class="notes"><strong>Observações:</strong> ${entry.notes}</p>` : ''}
        ${entry.photos?.length ? `<div class="photos">${entry.photos.map((p) => `<img src="${p}" />`).join('')}</div>` : ''}
      </div>`;
  }).join('');

  const summary = entries.map((e) => {
    const color = STATUS_COLOR[e.statusGeral] || '#9A9A9A';
    return `<tr><td>${e.floor.label}</td><td style="color:${color}">${STATUS_LABEL[e.statusGeral]}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; }
  .cover { text-align: center; padding: 60px 0; border-bottom: 3px solid #F5C518; margin-bottom: 32px; }
  .cover h1 { font-size: 28px; margin: 0 0 8px; }
  .cover p { color: #555; margin: 4px 0; }
  h2 { color: #1a1a1a; border-bottom: 2px solid #F5C518; padding-bottom: 6px; }
  h3 { margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
  th { background: #F5C518; padding: 8px; text-align: left; }
  td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
  .floor-section { margin-bottom: 32px; page-break-inside: avoid; }
  .notes { background: #f9f9f9; padding: 8px 12px; border-left: 3px solid #F5C518; font-size: 13px; }
  .photos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .photos img { width: 120px; height: 90px; object-fit: cover; border-radius: 4px; }
</style>
</head>
<body>
  <div class="cover">
    <h1>${report.building.name}</h1>
    <p>Relatório de Vistoria Predial</p>
    <p>Data: ${date}</p>
    <p>Inspetor: ${report.inspector.name}</p>
    <p>Andares vistoriados: ${entries.length}</p>
  </div>

  <h2>Resumo Geral</h2>
  <table>
    <thead><tr><th>Andar</th><th>Status</th></tr></thead>
    <tbody>${summary}</tbody>
  </table>

  <h2>Detalhamento por Andar</h2>
  ${floorSections}
</body>
</html>`;
}

async function generatePdf(report) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(report), { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } });
    return buffer;
  } finally {
    await browser.close();
  }
}

module.exports = { generatePdf };
