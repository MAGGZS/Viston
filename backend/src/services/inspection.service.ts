import { InspectionStatus } from '@prisma/client';
import { inspectionRepository } from '../repositories/inspection.repository';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { generateInspectionExcel } from './excel.service';
import { storageService } from './storage.service';
import { syncGoogleForms } from './googleForms.service';
import { FloorFormPayload } from '../validators/inspection.validator';
import { NotFoundError, ConflictError } from '../utils/errors';
import { AuditAction } from '@prisma/client';

export const inspectionService = {
  async start(inspectorId: string, buildingId: string, floorIds: string[]) {
    const building = await buildingRepository.findById(buildingId);
    if (!building) throw new NotFoundError('Prédio');

    const floors = await buildingRepository.findFloorsByIds(floorIds);
    if (floors.length !== floorIds.length) {
      throw new NotFoundError('Um ou mais andares não encontrados');
    }

    // Verificar se todos os andares pertencem ao prédio
    const invalidFloor = floors.find((f) => f.building_id !== buildingId);
    if (invalidFloor) {
      throw new ConflictError(`Andar "${invalidFloor.label}" não pertence ao prédio selecionado`);
    }

    const report = await inspectionRepository.create({
      inspector_id: inspectorId,
      building_id: buildingId,
      date: new Date(),
      floors_inspected: floorIds,
    });

    await auditRepository.log({
      user_id: inspectorId,
      action: AuditAction.CREATE,
      entity: 'InspectionReport',
      entity_id: report.id,
    });

    return report;
  },

  async saveFloorForm(
    reportId: string,
    floorId: string,
    payload: FloorFormPayload,
    inspectorId: string
  ) {
    const report = await inspectionRepository.findById(reportId);
    if (!report) throw new NotFoundError('Relatório');

    if (report.status === InspectionStatus.COMPLETED) {
      throw new ConflictError('Relatório já finalizado — não é possível editar');
    }

    if (!report.floors_inspected.includes(floorId)) {
      throw new ConflictError('Este andar não faz parte dos andares selecionados para esta inspeção');
    }

    // Mapear payload para items normalizados
    const items = [
      // MANUTENCAO
      {
        category: 'MANUTENCAO' as const,
        item_name: 'Cadeiras',
        has_item: payload.manutencao.cadeiras.has_item,
        quantity: payload.manutencao.cadeiras.quantity,
        is_marked: payload.manutencao.cadeiras.is_marked,
      },
      {
        category: 'MANUTENCAO' as const,
        item_name: 'Tomadas',
        has_item: payload.manutencao.tomadas.has_item,
        quantity: payload.manutencao.tomadas.quantity,
        is_marked: payload.manutencao.tomadas.is_marked,
      },
      {
        category: 'MANUTENCAO' as const,
        item_name: 'Ar-condicionado',
        status: payload.manutencao.ar_condicionado.status,
      },
      {
        category: 'MANUTENCAO' as const,
        item_name: 'Mesas',
        has_item: payload.manutencao.mesas.has_item,
        quantity: payload.manutencao.mesas.quantity,
        is_marked: payload.manutencao.mesas.is_marked,
      },
      {
        category: 'MANUTENCAO' as const,
        item_name: 'Portas',
        status: payload.manutencao.portas.status,
      },
      // LIMPEZA
      {
        category: 'LIMPEZA' as const,
        item_name: 'Carpete',
        status: payload.limpeza.carpete.status,
      },
      {
        category: 'LIMPEZA' as const,
        item_name: 'Vidros',
        status: payload.limpeza.vidros.status,
      },
      {
        category: 'LIMPEZA' as const,
        item_name: 'Cadeiras',
        has_item: payload.limpeza.cadeiras.has_item,
        quantity: payload.limpeza.cadeiras.quantity,
        is_marked: payload.limpeza.cadeiras.is_marked,
      },
    ];

    const entry = await inspectionRepository.upsertFloorEntry({
      report_id: reportId,
      floor_id: floorId,
      status_geral: payload.status_geral,
      observations: payload.observations,
      photos: [],
      items,
    });

    await auditRepository.log({
      user_id: inspectorId,
      action: AuditAction.UPDATE,
      entity: 'FloorFormEntry',
      entity_id: entry.id,
      metadata: { report_id: reportId, floor_id: floorId },
    });

    return entry;
  },

  async finish(reportId: string, inspectorId: string) {
    const report = await inspectionRepository.findById(reportId);
    if (!report) throw new NotFoundError('Relatório');

    if (report.status === InspectionStatus.COMPLETED) {
      throw new ConflictError('Relatório já foi finalizado');
    }

    // Verificar se todos os andares selecionados foram preenchidos
    const completedFloorIds = report.floor_form_entries.map((e) => e.floor_id);
    const missingFloors = report.floors_inspected.filter(
      (id) => !completedFloorIds.includes(id)
    );

    if (missingFloors.length > 0) {
      throw new ConflictError(
        `Ainda há ${missingFloors.length} andar(es) não preenchido(s). Finalize todos os andares antes de concluir.`
      );
    }

    // Marcar como COMPLETED
    const finished = await inspectionRepository.update(reportId, {
      status: InspectionStatus.COMPLETED,
      finished_at: new Date(),
    });

    await auditRepository.log({
      user_id: inspectorId,
      action: AuditAction.FINISH_INSPECTION,
      entity: 'InspectionReport',
      entity_id: reportId,
    });

    // Buscar relatório completo para gerar Excel
    const fullReport = await inspectionRepository.findById(reportId);
    if (!fullReport) throw new NotFoundError('Relatório');

    // Gerar Excel e fazer upload (síncrono — bloqueia a resposta)
    try {
      const buffer = await generateInspectionExcel(fullReport as Parameters<typeof generateInspectionExcel>[0]);
      const excelUrl = await storageService.uploadExcel(reportId, buffer);
      await inspectionRepository.update(reportId, { excel_url: excelUrl });

      await auditRepository.log({
        user_id: inspectorId,
        action: AuditAction.GENERATE_EXCEL,
        entity: 'InspectionReport',
        entity_id: reportId,
        metadata: { excel_url: excelUrl },
      });
    } catch (err) {
      console.error('[Excel] Falha na geração:', err);
      // Não bloqueia a finalização — relatório fica COMPLETED sem excel_url
    }

    // Sincronização com Google Forms (assíncrona — não bloqueia a resposta)
    setImmediate(() => {
      syncGoogleForms(reportId, inspectorId).catch((err) => {
        console.error('[GoogleForms] Falha na sincronização automática:', err);
      });
    });

    return inspectionRepository.findById(reportId);
  },

  async findAll(filters: {
    page: number;
    limit: number;
    status?: InspectionStatus;
    inspector_id?: string;
    floor_id?: string;
    google_form_synced?: boolean;
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

  async manualSyncGoogleForms(reportId: string, userId: string) {
    const report = await inspectionRepository.findById(reportId);
    if (!report) throw new NotFoundError('Relatório');
    if (report.status !== InspectionStatus.COMPLETED) {
      throw new ConflictError('Só é possível sincronizar relatórios finalizados');
    }
    await syncGoogleForms(reportId, userId);
    return inspectionRepository.findById(reportId);
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
      if (!heatmap[day].inspectors.includes(item.inspector.name)) {
        heatmap[day].inspectors.push(item.inspector.name);
      }
    }

    return { date_from: dateFrom, date_to: dateTo, heatmap };
  },
};
