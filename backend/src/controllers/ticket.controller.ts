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
} from '../validators/ticket.validator';

export const ticketController = {
  /** A fila do moderador: um dos três estados, do mais novo para o mais velho. */
  async findByBuilding(req: AuthenticatedRequest, res: Response) {
    const parsed = ticketFiltersSchema.parse(req.query);
    const result = await ticketService.listByBuilding(req.params.id, {
      group: parsed.group ?? 'NOVOS',
      page: parsed.page ?? 1,
      limit: parsed.limit ?? 30,
    });
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

  /** Fechar. Só o moderador chega aqui. */
  async close(req: AuthenticatedRequest, res: Response) {
    ok(res, await ticketService.close(req.params.id, req.user));
  },
};
