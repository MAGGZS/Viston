import { AuditAction, FloorStatus, InspectionStatus } from '@prisma/client';
import { inspectionRepository, FloorSubmission } from '../repositories/inspection.repository';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { generateInspectionExcel } from './excel.service';
import { storageService } from './storage.service';
import { SubmitInspectionPayload } from '../validators/inspection.validator';
import { NotFoundError, ConflictError } from '../utils/errors';
import { floorRank } from '../utils/floorOrder';

/** Status do andar derivado da maior prioridade entre as ocorrências relatadas. */
function deriveFloorStatus(records: Array<{ priority: string }>): FloorStatus {
  if (records.some((r) => r.priority === 'ALTA')) return FloorStatus.PROBLEMA;
  if (records.some((r) => r.priority === 'MEDIA')) return FloorStatus.ATENCAO;
  return FloorStatus.OK;
}

export const inspectionService = {
  /**
   * Recebe a vistoria completa (todos os andares de uma vez) e grava tudo.
   * O app segura os dados em memória até o envio final, então aqui não existe rascunho:
   * o relatório já nasce COMPLETED, com Excel, calendário e histórico.
   */
  async submit(inspectorId: string, payload: SubmitInspectionPayload) {
    const building = await buildingRepository.findById(payload.building_id);
    if (!building) throw new NotFoundError('Prédio');

    const floorIds = payload.floors.map((f) => f.floor_id);
    if (new Set(floorIds).size !== floorIds.length) {
      throw new ConflictError('Andar repetido no envio da vistoria');
    }

    const floors = await buildingRepository.findFloorsByIds(floorIds);
    if (floors.length !== floorIds.length) {
      throw new NotFoundError('Um ou mais andares não encontrados');
    }

    const invalidFloor = floors.find((f) => f.building_id !== payload.building_id);
    if (invalidFloor) {
      throw new ConflictError(`Andar "${invalidFloor.label}" não pertence ao prédio selecionado`);
    }

    // Ordem decrescente: do andar mais alto para o mais baixo
    const labelById = new Map(floors.map((f) => [f.id, f.label]));
    const submissions: FloorSubmission[] = payload.floors
      .map((floor) => ({
        floor_id: floor.floor_id,
        status_geral: deriveFloorStatus(floor.records),
        records: floor.records,
      }))
      .sort(
        (a, b) =>
          floorRank(labelById.get(b.floor_id) ?? '') - floorRank(labelById.get(a.floor_id) ?? '')
      );

    const now = new Date();
    const report = await inspectionRepository.createCompleted({
      inspector_id: inspectorId,
      building_id: payload.building_id,
      date: now,
      started_at: now,
      finished_at: now,
      floors: submissions,
    });

    await auditRepository.log({
      user_id: inspectorId,
      action: AuditAction.FINISH_INSPECTION,
      entity: 'InspectionReport',
      entity_id: report.id,
      metadata: { floors: submissions.length },
    });

    // Gerar Excel e fazer upload (síncrono — bloqueia a resposta)
    try {
      const buffer = await generateInspectionExcel(
        report as Parameters<typeof generateInspectionExcel>[0]
      );
      const excelUrl = await storageService.uploadExcel(report.id, buffer);
      await inspectionRepository.update(report.id, { excel_url: excelUrl });

      await auditRepository.log({
        user_id: inspectorId,
        action: AuditAction.GENERATE_EXCEL,
        entity: 'InspectionReport',
        entity_id: report.id,
        metadata: { excel_url: excelUrl },
      });
    } catch (err) {
      console.error('[Excel] Falha na geração:', err);
      // Não bloqueia o envio — relatório fica COMPLETED sem excel_url
    }

    return inspectionRepository.findById(report.id);
  },

  async findAll(filters: {
    page: number;
    limit: number;
    status?: InspectionStatus;
    inspector_id?: string;
    floor_id?: string;
    date_from?: string;
    date_to?: string;
  }) {
    const [inspections, total] = await inspectionRepository.findAll(filters);
    return {
      inspections,
      total,
      page: filters.page,
      limit: filters.limit,
      pages: Math.ceil(total / filters.limit),
    };
  },

  async findById(id: string) {
    const report = await inspectionRepository.findById(id);
    if (!report || report.status === InspectionStatus.IN_PROGRESS) {
      throw new NotFoundError('Relatório');
    }
    return report;
  },

  async getExcelUrl(id: string) {
    const report = await inspectionRepository.findById(id);
    if (!report) throw new NotFoundError('Relatório');
    if (!report.excel_url) throw new NotFoundError('Excel ainda não gerado para este relatório');
    return { excel_url: report.excel_url };
  },

  async getCalendar(params: { month?: number; year?: number; range?: 'semestral' | 'anual' }) {
    const now = new Date();
    let dateFrom: Date;
    let dateTo: Date;

    if (params.range === 'anual') {
      dateFrom = new Date(now.getFullYear(), 0, 1);
      dateTo = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    } else if (params.range === 'semestral') {
      const month = now.getMonth();
      const halfStart = month < 6 ? 0 : 6;
      dateFrom = new Date(now.getFullYear(), halfStart, 1);
      dateTo = new Date(now.getFullYear(), halfStart + 6, 0, 23, 59, 59);
    } else {
      const year = params.year ?? now.getFullYear();
      const month = (params.month ?? now.getMonth() + 1) - 1;
      dateFrom = new Date(year, month, 1);
      dateTo = new Date(year, month + 1, 0, 23, 59, 59);
    }

    const data = await inspectionRepository.getCalendarData(dateFrom, dateTo);

    // Agrupar por dia
    const heatmap: Record<string, { count: number; inspectors: string[] }> = {};
    for (const item of data) {
      if (!item.finished_at) continue;
      const day = item.finished_at.toISOString().split('T')[0];
      if (!heatmap[day]) heatmap[day] = { count: 0, inspectors: [] };
      heatmap[day].count++;
      const inspectorName = item.inspector?.name ?? 'Usuário removido';
      if (!heatmap[day].inspectors.includes(inspectorName)) {
        heatmap[day].inspectors.push(inspectorName);
      }
    }

    return { date_from: dateFrom, date_to: dateTo, heatmap };
  },
};
