import { AuditAction, FloorStatus, InspectionStatus } from '@prisma/client';
import { inspectionRepository, FloorSubmission } from '../repositories/inspection.repository';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { generateInspectionExcel } from './excel.service';
import { storageService } from './storage.service';
import { SubmitInspectionPayload } from '../validators/inspection.validator';
import { isBuildingManager } from '../middlewares/buildingAccess';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { floorRank } from '../utils/floorOrder';
import { zonedDateOnly, zonedDayKey, zonedParts, zonedRange } from '../utils/timezone';

export type CalendarDay = {
  count: number;
  inspectors: string[];
  reports: Array<{ id: string; inspector: string; excel_url: string | null; finished_at: Date }>;
};

/**
 * Agrupa as vistorias por dia de conclusão.
 * Cada dia leva os relatórios do dia para o app abrir a prévia e a planilha.
 *
 * O dia é o do calendário local (ver utils/timezone): agrupar pelo dia UTC
 * jogava tudo que foi enviado depois das 21h para o dia seguinte.
 */
export function buildHeatmap(
  data: Array<{
    id: string;
    finished_at: Date | null;
    excel_url: string | null;
    inspector: { id: string; name: string } | null;
  }>
): Record<string, CalendarDay> {
  const heatmap: Record<string, CalendarDay> = {};

  for (const item of data) {
    if (!item.finished_at) continue;
    const day = zonedDayKey(item.finished_at);
    if (!heatmap[day]) heatmap[day] = { count: 0, inspectors: [], reports: [] };

    const inspectorName = item.inspector?.name ?? 'Usuário removido';
    heatmap[day].count++;
    if (!heatmap[day].inspectors.includes(inspectorName)) {
      heatmap[day].inspectors.push(inspectorName);
    }
    heatmap[day].reports.push({
      id: item.id,
      inspector: inspectorName,
      excel_url: item.excel_url,
      finished_at: item.finished_at,
    });
  }

  return heatmap;
}

export type Viewer = { id: string; role: string };

/**
 * O relatório só é visível a quem está vinculado ao prédio dele.
 * Quem administra o prédio (ADMIN, ou o gestor que o criou) passa direto.
 */
async function assertCanSeeReport(user: Viewer, buildingId: string) {
  if (user.role === 'ADMIN') return;

  if (user.role === 'GESTOR') {
    const building = await buildingRepository.findById(buildingId);
    if (building && isBuildingManager(user, building)) return;
  }

  const member = await buildingRepository.findMember(buildingId, user.id);
  if (!member) throw new NotFoundError('Relatório');
}

/** Status do andar derivado da maior prioridade entre as ocorrências relatadas. */
function deriveFloorStatus(records: Array<{ priority: string }>): FloorStatus {
  if (records.some((r) => r.priority === 'ALTA')) return FloorStatus.PROBLEMA;
  if (records.some((r) => r.priority === 'MEDIA')) return FloorStatus.ATENCAO;
  return FloorStatus.OK;
}

type FullReport = NonNullable<Awaited<ReturnType<typeof inspectionRepository.findById>>>;

/**
 * Gera a planilha do relatório, sobe para o storage e grava a URL.
 * Usado no envio da vistoria e na regeração manual quando o upload falhou.
 *
 * Recebe o relatório já carregado: quem chama sempre acabou de lê-lo (ou de
 * criá-lo), então buscar de novo aqui seria uma ida ao banco a mais.
 */
async function buildAndStoreExcel(report: FullReport, userId?: string) {
  const buffer = await generateInspectionExcel(
    report as Parameters<typeof generateInspectionExcel>[0]
  );
  const excelUrl = await storageService.uploadExcel(report.id, buffer);
  await inspectionRepository.update(report.id, { excel_url: excelUrl });

  await auditRepository.log({
    user_id: userId,
    action: AuditAction.GENERATE_EXCEL,
    entity: 'InspectionReport',
    entity_id: report.id,
    metadata: { excel_url: excelUrl },
  });

  return excelUrl;
}

export const inspectionService = {
  /**
   * Recebe a vistoria completa (todos os andares de uma vez) e grava tudo.
   * O app segura os dados em memória até o envio final, então aqui não existe rascunho:
   * o relatório já nasce COMPLETED, com Excel, calendário e histórico.
   */
  async submit(
    inspectorId: string,
    payload: SubmitInspectionPayload,
    inspectorRole: string = 'INSPECTOR'
  ) {
    const building = await buildingRepository.findById(payload.building_id);
    if (!building) throw new NotFoundError('Prédio');

    // Quem administra o prédio vistoria sem vínculo; os demais precisam dele.
    if (!isBuildingManager({ id: inspectorId, role: inspectorRole }, building)) {
      const member = await buildingRepository.findMember(payload.building_id, inspectorId);
      if (!member) throw new ForbiddenError('Você não tem acesso a este prédio');
    }

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
      // `date` é coluna DATE: precisa ser o dia do calendário de quem vistoriou,
      // não o dia UTC do servidor (senão o envio da noite cai no dia seguinte).
      date: zonedDateOnly(now),
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
      const excelUrl = await buildAndStoreExcel(report, inspectorId);
      return { ...report, excel_url: excelUrl };
    } catch (err) {
      console.error('[Excel] Falha na geração:', err);
      // Não bloqueia o envio — relatório fica COMPLETED sem excel_url
      // e a planilha pode ser gerada depois em POST /inspections/:id/excel
      return report;
    }
  },

  /** Gera (ou refaz) a planilha de um relatório já concluído. */
  async generateExcel(id: string, user: Viewer) {
    const report = await inspectionRepository.findById(id);
    if (!report) throw new NotFoundError('Relatório');
    await assertCanSeeReport(user, report.building_id);
    if (report.status === InspectionStatus.IN_PROGRESS) {
      throw new ConflictError('Relatório ainda não foi concluído');
    }

    const excelUrl = await buildAndStoreExcel(report, user.id);
    return { excel_url: excelUrl };
  },

  /**
   * Descarta uma vistoria (só quem administra o prédio). Andares e ocorrências
   * saem em cascata e a planilha é removida do storage.
   */
  async remove(id: string, user: Viewer) {
    const report = await inspectionRepository.findById(id);
    if (!report) throw new NotFoundError('Relatório');

    const building = await buildingRepository.findById(report.building_id);
    if (!building || !isBuildingManager(user, building)) {
      throw new ForbiddenError('Apenas o gestor do prédio pode descartar a vistoria');
    }

    if (report.excel_url) {
      try {
        await storageService.removeExcel(report.excel_url);
      } catch (err) {
        console.error('[Excel] Falha ao remover planilha do storage:', err);
        // Arquivo órfão no bucket não impede o descarte do relatório
      }
    }

    await inspectionRepository.delete(id);

    await auditRepository.log({
      user_id: user.id,
      action: AuditAction.DELETE,
      entity: 'InspectionReport',
      entity_id: id,
      metadata: { building_id: report.building_id, date: report.date },
    });
  },

  async findAll(
    filters: {
      page: number;
      limit: number;
      status?: InspectionStatus;
      inspector_id?: string;
      floor_id?: string;
      date_from?: string;
      date_to?: string;
    },
    buildingIds: string[] | null
  ) {
    const [inspections, total] = await inspectionRepository.findAll({ ...filters, building_ids: buildingIds });
    return {
      inspections,
      total,
      page: filters.page,
      limit: filters.limit,
      pages: Math.ceil(total / filters.limit),
    };
  },

  async findById(id: string, user: Viewer) {
    const report = await inspectionRepository.findById(id);
    if (!report || report.status === InspectionStatus.IN_PROGRESS) {
      throw new NotFoundError('Relatório');
    }
    await assertCanSeeReport(user, report.building_id);
    return report;
  },

  async getExcelUrl(id: string, user: Viewer) {
    const report = await inspectionRepository.findById(id);
    if (!report) throw new NotFoundError('Relatório');
    await assertCanSeeReport(user, report.building_id);
    if (!report.excel_url) throw new NotFoundError('Excel ainda não gerado para este relatório');
    return { excel_url: report.excel_url };
  },

  async getCalendar(
    params: { month?: number; year?: number; range?: 'semestral' | 'anual' },
    buildingIds: string[] | null
  ) {
    // Os limites são do calendário local: o mês fecha às 23:59 do fuso do
    // usuário, não do UTC — senão a última noite do mês some da contagem.
    const today = zonedParts();
    let range: { start: Date; end: Date };

    if (params.range === 'anual') {
      range = zonedRange(today.year, 0, 12);
    } else if (params.range === 'semestral') {
      range = zonedRange(today.year, today.monthIndex < 6 ? 0 : 6, 6);
    } else {
      const year = params.year ?? today.year;
      const monthIndex = (params.month ?? today.monthIndex + 1) - 1;
      range = zonedRange(year, monthIndex, 1);
    }

    const data = await inspectionRepository.getCalendarData(
      range.start,
      range.end,
      undefined,
      buildingIds
    );
    return { date_from: range.start, date_to: range.end, heatmap: buildHeatmap(data) };
  },
};
