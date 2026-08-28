import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { ticketService } from '../services/ticket.service';
import { buildingRepository } from '../repositories/building.repository';
import { ok } from '../utils/response';
import {
  ticketFiltersSchema,
  forwardTicketSchema,
  reportDoneSchema,
  updateTicketSchema,
  closeTicketSchema,
  ticketReportSchema,
} from '../validators/ticket.validator';
import { buildTicketReport, reportFileName } from '../services/ticketReport';

export const ticketController = {
  /** A fila do moderador: um dos três estados, do mais novo para o mais velho. */
  async findByBuilding(req: AuthenticatedRequest, res: Response) {
    // Espalhado, e não campo a campo: os filtros da tela ampliada entram pelo
    // schema e chegam inteiros ao serviço. Listar campo a campo aqui era o tipo
    // de lista que se esquece de atualizar — o filtro passava a existir na URL
    // e a lista voltava sem ele, sem erro nenhum.
    const filters = ticketFiltersSchema.parse(req.query);
    const result = await ticketService.listByBuilding(req.params.id, filters);
    ok(res, result);
  },

  /** Contadores do painel do moderador. */
  async stats(req: AuthenticatedRequest, res: Response) {
    ok(res, await ticketService.stats(req.params.id));
  },

  /**
   * Os responsáveis daquele prédio.
   *
   * Serve ao formulário de vistoria e ao encaminhamento — os dois precisam da
   * mesma lista, e ela é curta.
   */
  async responsibles(req: AuthenticatedRequest, res: Response) {
    ok(res, await buildingRepository.getResponsibles(req.params.id));
  },

  /** O que foi encaminhado a quem está pedindo. */
  async mine(req: AuthenticatedRequest, res: Response) {
    const includeClosed = String(req.query.closed ?? '') === 'true';
    ok(res, await ticketService.listMine(req.user, includeClosed));
  },

  async forward(req: AuthenticatedRequest, res: Response) {
    const { responsible_id } = forwardTicketSchema.parse(req.body);
    ok(res, await ticketService.forward(req.params.id, req.user, responsible_id));
  },

  async update(req: AuthenticatedRequest, res: Response) {
    const data = updateTicketSchema.parse(req.body);
    ok(res, await ticketService.update(req.params.id, req.user, data));
  },

  /** O responsável confirma que recebeu — é aqui que o chamado passa a correr. */
  async receive(req: AuthenticatedRequest, res: Response) {
    ok(res, await ticketService.receive(req.params.id, req.user));
  },

  /** O responsável informa que terminou — não fecha o chamado. */
  async reportDone(req: AuthenticatedRequest, res: Response) {
    const { done_report } = reportDoneSchema.parse(req.body ?? {});
    ok(res, await ticketService.reportDone(req.params.id, req.user, done_report));
  },

  /** Desfaz o encaminhamento — o chamado volta a ser novo, sem dono. */
  async unforward(req: AuthenticatedRequest, res: Response) {
    ok(res, await ticketService.unforward(req.params.id, req.user));
  },

  /**
   * Fechar. Só o moderador chega aqui.
   *
   * O corpo é opcional: fechar sem relatório continua valendo, e o app antigo
   * manda a requisição vazia.
   */
  async close(req: AuthenticatedRequest, res: Response) {
    const data = closeTicketSchema.parse(req.body ?? {});
    ok(res, await ticketService.close(req.params.id, req.user, data));
  },

  /**
   * O relatório do período, em .docx.
   *
   * Sai como arquivo, não como JSON: é a única rota de chamado que não devolve
   * dado para a tela desenhar, e sim um documento para a pessoa guardar. Por
   * isso escreve a resposta à mão, sem passar pelo `ok()`.
   */
  async report(req: AuthenticatedRequest, res: Response) {
    const { from, to } = ticketReportSchema.parse(req.query);
    const data = await ticketService.reportPeriod(req.params.id, req.user, from, to);
    const buffer = await buildTicketReport(data);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${reportFileName(data)}"`);
    // O navegador precisa enxergar o nome do arquivo: numa resposta de outra
    // origem, só os cabeçalhos expostos chegam ao JavaScript da página.
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(buffer);
  },
};
