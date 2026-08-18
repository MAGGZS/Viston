import { AuditAction, FloorStatus, InspectionStatus } from '@prisma/client';
import { inspectionRepository, FloorSubmission } from '../repositories/inspection.repository';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { generateDayExcel } from './excel.service';
import { storageService } from './storage.service';
import { SubmitInspectionPayload } from '../validators/inspection.validator';
import { canInspectBuilding, getBuildingStanding, isBuildingManager } from '../middlewares/buildingAccess';
import { Actor } from '../middlewares/authenticate';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { floorRank } from '../utils/floorOrder';
import { inspectorNames } from '../utils/inspectors';
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

export type Viewer = Actor;

/**
 * O relatório só é visível a quem tem ligação com o prédio dele — o gestor pela
 * conta de gestão, o usuário pelo vínculo.
 *
 * 404 e não 403: quem não tem ligação não deve nem saber que o relatório existe.
 */
async function assertCanSeeReport(user: Viewer, buildingId: string) {
  const standing = await getBuildingStanding(user, buildingId);
  if (!standing) throw new NotFoundError('Relatório');
}

/** Status do andar derivado da maior prioridade entre as ocorrências relatadas. */
function deriveFloorStatus(records: Array<{ priority: string }>): FloorStatus {
  if (records.some((r) => r.priority === 'ALTA')) return FloorStatus.PROBLEMA;
  if (records.some((r) => r.priority === 'MEDIA')) return FloorStatus.ATENCAO;
  return FloorStatus.OK;
}

type FullReport = NonNullable<Awaited<ReturnType<typeof inspectionRepository.findById>>>;

/**
 * Gera a planilha do dia, sobe para o storage e aponta todas as vistorias
 * daquele dia para ela.
 *
 * A planilha é do dia, e não da vistoria: três pessoas vistoriando o mesmo
 * prédio hoje produzem um arquivo só, com os três nomes no cabeçalho. Por isso
 * cada envio regenera o arquivo do dia — o terceiro envio precisa reescrever o
 * que os dois primeiros já tinham publicado.
 */
async function buildAndStoreDayExcel(buildingId: string, date: Date, userId?: string) {
  const reports = await inspectionRepository.findDayReports(buildingId, date);
  if (reports.length === 0) return null;

  const buffer = await generateDayExcel(reports as Parameters<typeof generateDayExcel>[0]);
  const excelUrl = await storageService.uploadDayExcel(buildingId, date, buffer);
  const replaced = reports.find((r) => r.excel_url)?.excel_url ?? null;
  await inspectionRepository.setDayExcelUrl(buildingId, date, excelUrl);

  // A versão anterior do arquivo do dia não serve mais a ninguém: nenhum
  // relatório aponta para ela depois da linha acima. Sem esta limpeza o bucket
  // ganharia um arquivo morto a cada vistoria enviada no mesmo dia.
  if (replaced && replaced !== excelUrl) {
    try {
      await storageService.removeExcel(replaced);
    } catch (err) {
      console.error('[Excel] Falha ao remover a planilha anterior do dia:', err);
    }
  }

  await auditRepository.log({
    user_id: userId,
    building_id: buildingId,
    action: AuditAction.GENERATE_EXCEL,
    entity: 'InspectionReport',
    entity_id: reports[0].id,
    metadata: { excel_url: excelUrl, reports: reports.length },
  });

  return excelUrl;
}

/**
 * O relatório completo de um dia: as vistorias daquele prédio naquela data,
 * juntas.
 *
 * Os andares são fundidos (ver mergeDayEntries, na planilha) e cada ocorrência
 * leva o nome de quem a relatou — sem isso, o documento do dia com três
 * inspetores não deixaria dizer quem viu o quê.
 */
function buildDayReport(reports: FullReport[]) {
  const first = reports[0];
  const byFloor = new Map<
    string,
    { floor_id: string; floor: { id: string; label: string }; status_geral: string; maintenance_records: unknown[] }
  >();

  const severity: Record<string, number> = { OK: 0, ATENCAO: 1, PROBLEMA: 2 };

  for (const report of reports) {
    const inspector = report.inspector?.name ?? 'Usuário removido';
    for (const entry of report.floor_form_entries) {
      const records = entry.maintenance_records.map((record) => ({
        ...record,
        maintenance_cost: record.maintenance_cost === null ? null : Number(record.maintenance_cost),
        inspector,
      }));

      const current = byFloor.get(entry.floor_id);
      if (!current) {
        byFloor.set(entry.floor_id, {
          floor_id: entry.floor_id,
          floor: { id: entry.floor.id, label: entry.floor.label },
          status_geral: entry.status_geral,
          maintenance_records: records,
        });
        continue;
      }

      current.maintenance_records.push(...records);
      if ((severity[entry.status_geral] ?? 0) > (severity[current.status_geral] ?? 0)) {
        current.status_geral = entry.status_geral;
      }
    }
  }

  return {
    date: first.date,
    building: first.building,
    // "Inspeção feita por: A / B / C" — a mesma linha da planilha.
    inspectors: inspectorNames(reports),
    reports: reports.map((r) => ({ id: r.id, inspector: r.inspector })),
    excel_url: reports.find((r) => r.excel_url)?.excel_url ?? null,
    floor_form_entries: [...byFloor.values()],
  };
}

export const inspectionService = {
  /**
   * Recebe a vistoria completa (todos os andares de uma vez) e grava tudo.
   * O app segura os dados em memória até o envio final, então aqui não existe rascunho:
   * o relatório já nasce COMPLETED, com Excel, calendário e histórico.
   */
  async submit(inspector: Actor, payload: SubmitInspectionPayload) {
    const inspectorId = inspector.id;

    const building = await buildingRepository.findById(payload.building_id);
    if (!building) throw new NotFoundError('Prédio');

    // Quem vistoria é o inspetor daquele prédio. Visualizador, quem não tem
    // vínculo e conta de gestor param aqui — gestor não vistoria, porque o
    // relatório aponta para `users` e ele não está lá.
    if (!(await canInspectBuilding(inspector, payload.building_id))) {
      throw new ForbiddenError('Você não tem permissão para vistoriar este prédio');
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

    // O responsável sugerido tem de ser responsável naquele prédio. A lista vem
    // de uma consulta só, e não uma por ocorrência: uma vistoria de 20 andares
    // pode trazer dezenas de ocorrências, quase sempre para as mesmas pessoas.
    const responsibles = await buildingRepository.getResponsibles(payload.building_id);
    const nameById = new Map(responsibles.map((r) => [r.id, r.name]));

    for (const floor of payload.floors) {
      for (const record of floor.records) {
        if (record.responsible_id && !nameById.has(record.responsible_id)) {
          throw new ConflictError('Responsável selecionado não pertence a este prédio');
        }
      }
    }

    // Ordem decrescente: do andar mais alto para o mais baixo
    const labelById = new Map(floors.map((f) => [f.id, f.label]));
    const submissions: FloorSubmission[] = payload.floors
      .map((floor) => ({
        floor_id: floor.floor_id,
        status_geral: deriveFloorStatus(floor.records),
        // O chamado nasce ABERTO e sem data de encaminhamento — é o que a fila
        // de novos chamados do moderador lista.
        records: floor.records.map((record) => ({
          maintenance_type: record.maintenance_type,
          category: record.category,
          priority: record.priority,
          description: record.description,
          responsible_id: record.responsible_id ?? null,
          responsible: record.responsible_id ? nameById.get(record.responsible_id) ?? null : null,
        })),
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
      building_id: payload.building_id,
      action: AuditAction.FINISH_INSPECTION,
      entity: 'InspectionReport',
      entity_id: report.id,
      metadata: { floors: submissions.length },
    });

    // Gerar Excel e fazer upload (síncrono — bloqueia a resposta). É a planilha
    // do dia inteiro: se já houver vistorias desta data, esta entra nelas.
    try {
      const excelUrl = await buildAndStoreDayExcel(payload.building_id, report.date, inspectorId);
      return { ...report, excel_url: excelUrl };
    } catch (err) {
      console.error('[Excel] Falha na geração:', err);
      // Não bloqueia o envio — relatório fica COMPLETED sem excel_url
      // e a planilha pode ser gerada depois em POST /inspections/:id/excel
      return report;
    }
  },

  /** Gera (ou refaz) a planilha do dia a que aquele relatório pertence. */
  async generateExcel(id: string, user: Viewer) {
    const report = await inspectionRepository.findById(id);
    if (!report) throw new NotFoundError('Relatório');
    await assertCanSeeReport(user, report.building_id);
    if (report.status === InspectionStatus.IN_PROGRESS) {
      throw new ConflictError('Relatório ainda não foi concluído');
    }

    const excelUrl = await buildAndStoreDayExcel(report.building_id, report.date, user.id);
    return { excel_url: excelUrl };
  },

  /**
   * O relatório completo do dia daquela vistoria.
   *
   * A tela continua listando vistoria por vistoria, com o nome de quem fez cada
   * uma — o que mudou é o clique: abrir uma delas abre o documento do dia, com
   * as vistorias dos outros inspetores daquela data juntas.
   */
  async getDayReport(id: string, user: Viewer) {
    const report = await inspectionRepository.findById(id);
    if (!report || report.status === InspectionStatus.IN_PROGRESS) {
      throw new NotFoundError('Relatório');
    }
    await assertCanSeeReport(user, report.building_id);

    const reports = await inspectionRepository.findDayReports(report.building_id, report.date);
    // A vistoria existe, então a lista do dia nunca vem vazia; o fallback cobre
    // a corrida com um descarte acontecendo no mesmo instante.
    return buildDayReport(reports.length > 0 ? reports : [report]);
  },

  /**
   * Descarta uma vistoria (só quem administra o prédio). Andares e ocorrências
   * saem em cascata e a planilha é removida do storage.
   */
  async remove(id: string, user: Viewer) {
    const report = await inspectionRepository.findById(id);
    if (!report) throw new NotFoundError('Relatório');

    if (!(await isBuildingManager(user, report.building_id))) {
      throw new ForbiddenError('Apenas o gestor do prédio pode descartar a vistoria');
    }

    await inspectionRepository.delete(id);

    // A planilha é do dia e pode ser de mais gente: se sobrou vistoria naquela
    // data, ela é refeita sem a descartada; se não sobrou nenhuma, o arquivo sai
    // do bucket. Apagar o arquivo antes de olhar deixaria as outras vistorias do
    // dia apontando para uma URL morta.
    try {
      const remaining = await inspectionRepository.findDayReports(report.building_id, report.date);
      if (remaining.length > 0) {
        await buildAndStoreDayExcel(report.building_id, report.date, user.id);
      } else if (report.excel_url) {
        await storageService.removeExcel(report.excel_url);
      }
    } catch (err) {
      console.error('[Excel] Falha ao atualizar a planilha do dia:', err);
      // Arquivo órfão no bucket não impede o descarte do relatório
    }

    await auditRepository.log({
      user_id: user.id,
      building_id: report.building_id,
      action: AuditAction.DELETE,
      entity: 'InspectionReport',
      entity_id: id,
      metadata: { date: report.date },
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
