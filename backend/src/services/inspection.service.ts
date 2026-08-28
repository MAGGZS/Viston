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
import { withExcelFlag } from '../utils/reportShape';
import { logger } from '../lib/logger';
import { zonedDateOnly, zonedDayKey, zonedParts, zonedRange } from '../utils/timezone';

export type CalendarDay = {
  count: number;
  inspectors: string[];
  reports: Array<{ id: string; inspector: string; has_excel: boolean; finished_at: Date }>;
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
    excel_path: string | null;
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
      has_excel: Boolean(item.excel_path),
      finished_at: item.finished_at,
    });
  }

  return heatmap;
}

export type Viewer = Actor;

/**
 * Nome com que a planilha chega ao computador de quem baixa.
 *
 * O objeto no bucket se chama `report_day_<uuid>_<data>_<timestamp>.xlsx`, que
 * não diz nada a ninguém depois de salvo na pasta de downloads.
 */
function downloadName(report: { building: { name: string }; date: Date }): string {
  const slug = report.building.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const day = new Date(report.date).toISOString().slice(0, 10);

  return `vistoria-${slug || 'predio'}-${day}.xlsx`;
}

function signExcel(path: string, report: { building: { name: string }; date: Date }) {
  return storageService.createExcelSignedUrl(path, downloadName(report));
}

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
  const excelPath = await storageService.uploadDayExcel(buildingId, date, buffer);
  const replaced = reports.find((r) => r.excel_path)?.excel_path ?? null;
  await inspectionRepository.setDayExcelPath(buildingId, date, excelPath);

  // A versão anterior do arquivo do dia não serve mais a ninguém: nenhum
  // relatório aponta para ela depois da linha acima. Sem esta limpeza o bucket
  // ganharia um arquivo morto a cada vistoria enviada no mesmo dia.
  if (replaced && replaced !== excelPath) {
    try {
      await storageService.removeExcel(replaced);
    } catch (err) {
      logger.error({ err, building_id: buildingId }, '[Excel] Falha ao remover a planilha anterior do dia');
    }
  }

  await auditRepository.log({
    user_id: userId,
    building_id: buildingId,
    action: AuditAction.GENERATE_EXCEL,
    entity: 'InspectionReport',
    entity_id: reports[0].id,
    metadata: { excel_path: excelPath, reports: reports.length },
  });

  return excelPath;
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
    has_excel: reports.some((r) => r.excel_path),
    floor_form_entries: [...byFloor.values()],
  };
}

export const inspectionService = {
  /**
   * Recebe a vistoria completa (todos os andares de uma vez) e grava tudo.
   * O app segura os dados em memória até o envio final, então aqui não existe rascunho:
   * o relatório já nasce COMPLETED, com Excel, calendário e histórico.
   */
  async submit(inspector: Actor, payload: SubmitInspectionPayload, submissionKey?: string) {
    const inspectorId = inspector.id;

    // Mesma tentativa de envio, de novo: o toque duplo e o retry de rede
    // chegam aqui, e o que eles querem é o relatório que já existe.
    if (submissionKey) {
      const already = await inspectionRepository.findBySubmissionKey(submissionKey);
      if (already) {
        // A chave é de quem enviou. Ela nasce no aparelho e não é segredo — se
        // vazasse, serviria para ler o relatório de outra pessoa.
        if (already.inspector_id !== inspectorId) {
          throw new ConflictError('Chave de envio já utilizada');
        }
        return withExcelFlag(already);
      }
    }

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
    let report: FullReport;

    try {
      report = await inspectionRepository.createCompleted({
        inspector_id: inspectorId,
        building_id: payload.building_id,
        // `date` é coluna DATE: precisa ser o dia do calendário de quem vistoriou,
        // não o dia UTC do servidor (senão o envio da noite cai no dia seguinte).
        date: zonedDateOnly(now),
        started_at: now,
        finished_at: now,
        floors: submissions,
        submission_key: submissionKey ?? null,
      });
    } catch (err) {
      // Dois envios da mesma chave ao mesmo tempo: o segundo bate no unique. A
      // checagem lá em cima resolve o caso comum; esta resolve a corrida, que é
      // exatamente o que o toque duplo produz.
      const existing =
        submissionKey && (err as { code?: string })?.code === 'P2002'
          ? await inspectionRepository.findBySubmissionKey(submissionKey)
          : null;
      if (!existing) throw err;
      return withExcelFlag(existing);
    }

    await auditRepository.log({
      user_id: inspectorId,
      building_id: payload.building_id,
      action: AuditAction.FINISH_INSPECTION,
      entity: 'InspectionReport',
      entity_id: report.id,
      metadata: { floors: submissions.length },
    });

    /**
     * A planilha vai atrás. A resposta sai agora.
     *
     * Gerar a planilha do dia e subi-la levava vários segundos numa vistoria de
     * vinte andares — e o inspetor ficava com a tela parada, em 4G instável, no
     * corredor de um prédio. É exatamente ali que se toca o botão de novo.
     * (Com a chave de envio, o segundo toque já não cria nada; mas a tela parada
     * continua sendo tela parada.)
     *
     * O relatório não depende dela: nasce COMPLETED, aparece no histórico e no
     * calendário, e a planilha se junta a ele quando ficar pronta. Se o processo
     * morrer no meio — no plano gratuito do Render a instância dorme —, o
     * relatório fica sem planilha e o botão "Gerar planilha", que já existe na
     * tela do relatório, resolve.
     */
    setImmediate(() => {
      buildAndStoreDayExcel(payload.building_id, report.date, inspectorId).catch((err) =>
        logger.error({ err, building_id: payload.building_id }, '[Excel] Falha na geração')
      );
    });

    // `has_excel` sai falso mesmo quando a planilha do dia já existe de uma
    // vistoria anterior: a que interessa é a que está sendo refeita agora, e ela
    // ainda não está pronta. A tela de conclusão só oferece o download quando
    // houver o que baixar, e o histórico já mostra o estado atualizado.
    return withExcelFlag(report);
  },

  /** Gera (ou refaz) a planilha do dia a que aquele relatório pertence. */
  async generateExcel(id: string, user: Viewer) {
    const report = await inspectionRepository.findById(id);
    if (!report) throw new NotFoundError('Relatório');
    await assertCanSeeReport(user, report.building_id);
    if (report.status === InspectionStatus.IN_PROGRESS) {
      throw new ConflictError('Relatório ainda não foi concluído');
    }

    const excelPath = await buildAndStoreDayExcel(report.building_id, report.date, user.id);
    if (!excelPath) throw new NotFoundError('Relatório');

    return { excel_url: await signExcel(excelPath, report) };
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
      } else if (report.excel_path) {
        await storageService.removeExcel(report.excel_path);
      }
    } catch (err) {
      logger.error({ err, building_id: report.building_id }, '[Excel] Falha ao atualizar a planilha do dia');
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
      date_from?: Date;
      date_to?: Date;
      /** Procura pelo nome de quem vistoriou. */
      q?: string;
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
    return withExcelFlag(report);
  },

  /**
   * A URL de download da planilha, assinada na hora.
   *
   * É aqui que o isolamento por prédio finalmente vale para o arquivo: o
   * vínculo é conferido a cada pedido, e o que sai é um link de poucos minutos.
   * Antes, a coluna guardava uma URL pública e permanente — quem saísse do
   * prédio continuava baixando o relatório com o link que já tinha.
   */
  async getExcelUrl(id: string, user: Viewer) {
    const report = await inspectionRepository.findById(id);
    if (!report) throw new NotFoundError('Relatório');
    await assertCanSeeReport(user, report.building_id);
    if (!report.excel_path) throw new NotFoundError('Excel ainda não gerado para este relatório');

    return { excel_url: await signExcel(report.excel_path, report) };
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
