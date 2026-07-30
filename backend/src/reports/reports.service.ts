import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createClient } from '@supabase/supabase-js';
import * as ExcelJS from 'exceljs';

type FullReport = {
  id: string;
  building: { name: string };
  inspector: { name: string };
  date: Date;
  floorEntries: Array<{
    floor: { label: string };
    statusGeral: string;
    notes: string | null;
    photos: string[];
    items: Array<{ itemName: string; status: string; observation: string | null }>;
  }>;
};

@Injectable()
export class ReportsService {
  private supabase = createClient(
    process.env.SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );

  constructor(private prisma: PrismaService) {}

  async generate(report: FullReport): Promise<{ pdfUrl: string; excelUrl: string }> {
    const [pdfBuffer, excelBuffer] = await Promise.all([
      this.buildPdfBuffer(report),
      this.buildExcelBuffer(report),
    ]);

    const dateStr = new Date(report.date).toISOString().split('T')[0];
    const pdfPath = `reports/${report.id}/${dateStr}-vistoria.pdf`;
    const excelPath = `reports/${report.id}/${dateStr}-vistoria.xlsx`;

    const [pdfUpload, excelUpload] = await Promise.all([
      this.supabase.storage.from('viston').upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      }),
      this.supabase.storage.from('viston').upload(excelPath, excelBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      }),
    ]);

    const pdfUrl = pdfUpload.error
      ? ''
      : this.supabase.storage.from('viston').getPublicUrl(pdfPath).data.publicUrl;

    const excelUrl = excelUpload.error
      ? ''
      : this.supabase.storage.from('viston').getPublicUrl(excelPath).data.publicUrl;

    return { pdfUrl, excelUrl };
  }

  async generatePdfBuffer(reportId: string): Promise<Buffer> {
    const report = await this.getFullReport(reportId);
    return this.buildPdfBuffer(report);
  }

  async generateExcelBuffer(reportId: string): Promise<Buffer> {
    const report = await this.getFullReport(reportId);
    return this.buildExcelBuffer(report);
  }

  private async getFullReport(reportId: string): Promise<FullReport> {
    const report = await this.prisma.inspectionReport.findUnique({
      where: { id: reportId },
      include: {
        building: true,
        inspector: { select: { id: true, name: true } },
        floorEntries: {
          include: { floor: true, items: true },
          orderBy: { floor: { order: 'desc' } },
        },
      },
    });
    if (!report) throw new NotFoundException('Relatório não encontrado');
    return report as any;
  }

  private async buildPdfBuffer(report: FullReport): Promise<Buffer> {
    const statusColor = (s: string) => {
      if (s === 'OK') return '#22c55e';
      if (s === 'ATENCAO') return '#f59e0b';
      return '#ef4444';
    };

    const statusLabel = (s: string) => {
      if (s === 'OK') return 'OK';
      if (s === 'ATENCAO') return 'Atenção';
      if (s === 'PROBLEMA') return 'Problema';
      if (s === 'NOK') return 'Não OK';
      if (s === 'NA') return 'N/A';
      return s;
    };

    const floorsHtml = report.floorEntries
      .map(
        (entry) => `
      <div class="floor-section">
        <div class="floor-header">
          <h2>${entry.floor.label}</h2>
          <span class="badge" style="background:${statusColor(entry.statusGeral)}">${statusLabel(entry.statusGeral)}</span>
        </div>
        <table>
          <thead><tr><th>Item</th><th>Status</th><th>Observação</th></tr></thead>
          <tbody>
            ${entry.items
              .map(
                (item) => `
              <tr>
                <td>${item.itemName}</td>
                <td><span style="color:${statusColor(item.status)};font-weight:bold">${statusLabel(item.status)}</span></td>
                <td>${item.observation || '—'}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
        ${entry.notes ? `<p class="notes"><strong>Observações:</strong> ${entry.notes}</p>` : ''}
      </div>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #fff; color: #111; padding: 40px; }
  .cover { text-align: center; padding: 60px 0; border-bottom: 3px solid #F5C518; margin-bottom: 40px; }
  .cover h1 { font-size: 32px; color: #0D0D0D; }
  .cover .subtitle { font-size: 16px; color: #555; margin-top: 8px; }
  .cover .meta { margin-top: 24px; font-size: 14px; color: #333; }
  .floor-section { margin-bottom: 32px; page-break-inside: avoid; }
  .floor-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .floor-header h2 { font-size: 18px; }
  .badge { padding: 4px 12px; border-radius: 20px; color: #fff; font-size: 12px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #F5C518; color: #0D0D0D; padding: 8px; text-align: left; }
  td { padding: 7px 8px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .notes { margin-top: 10px; font-size: 13px; color: #444; padding: 8px; background: #fffbea; border-left: 3px solid #F5C518; }
  .summary { margin-bottom: 40px; padding: 20px; background: #f5f5f5; border-radius: 8px; }
  .summary h2 { margin-bottom: 12px; }
  .summary-grid { display: flex; gap: 16px; }
  .summary-item { flex: 1; text-align: center; padding: 12px; border-radius: 8px; color: #fff; }
</style>
</head>
<body>
  <div class="cover">
    <h1>Relatório de Vistoria Predial</h1>
    <div class="subtitle">${report.building.name}</div>
    <div class="meta">
      <p>Data: ${new Date(report.date).toLocaleDateString('pt-BR')}</p>
      <p>Inspetor: ${report.inspector.name}</p>
      <p>Andares vistoriados: ${report.floorEntries.length}</p>
    </div>
  </div>

  <div class="summary">
    <h2>Resumo Geral</h2>
    <div class="summary-grid">
      <div class="summary-item" style="background:#22c55e">
        <div style="font-size:24px;font-weight:bold">${report.floorEntries.filter((e) => e.statusGeral === 'OK').length}</div>
        <div>OK</div>
      </div>
      <div class="summary-item" style="background:#f59e0b">
        <div style="font-size:24px;font-weight:bold">${report.floorEntries.filter((e) => e.statusGeral === 'ATENCAO').length}</div>
        <div>Atenção</div>
      </div>
      <div class="summary-item" style="background:#ef4444">
        <div style="font-size:24px;font-weight:bold">${report.floorEntries.filter((e) => e.statusGeral === 'PROBLEMA').length}</div>
        <div>Problema</div>
      </div>
    </div>
  </div>

  ${floorsHtml}
</body>
</html>`;

    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } });
      await browser.close();
      return Buffer.from(pdf);
    } catch {
      // Fallback: retorna HTML como buffer se Puppeteer não estiver disponível
      return Buffer.from(html, 'utf-8');
    }
  }

  private async buildExcelBuffer(report: FullReport): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Viston';
    workbook.created = new Date();

    // Aba de resumo
    const summary = workbook.addWorksheet('Resumo');
    summary.columns = [
      { header: 'Andar', key: 'floor', width: 20 },
      { header: 'Status Geral', key: 'status', width: 15 },
      { header: 'Observações', key: 'notes', width: 40 },
    ];
    summary.getRow(1).font = { bold: true };
    summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5C518' } };

    for (const entry of report.floorEntries) {
      summary.addRow({
        floor: entry.floor.label,
        status: entry.statusGeral,
        notes: entry.notes || '',
      });
    }

    // Uma aba por andar
    for (const entry of report.floorEntries) {
      const sheet = workbook.addWorksheet(entry.floor.label.substring(0, 31));
      sheet.columns = [
        { header: 'Item', key: 'item', width: 30 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Observação', key: 'obs', width: 40 },
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5C518' } };

      for (const item of entry.items) {
        sheet.addRow({ item: item.itemName, status: item.status, obs: item.observation || '' });
      }

      if (entry.notes) {
        sheet.addRow([]);
        sheet.addRow(['Observações gerais:', entry.notes]);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
