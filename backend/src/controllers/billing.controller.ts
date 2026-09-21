import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { billingService } from '../services/billing.service';
import { verifyWebhookSignature } from '../lib/stripe';
import { ok } from '../utils/response';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { logger } from '../lib/logger';

/** Cobrança é assunto da conta de gestor: é dela a assinatura. */
function asManager(req: AuthenticatedRequest): string {
  if (req.user.kind !== 'MANAGER') {
    throw new ForbiddenError('A cobrança é da conta de gestor');
  }
  return req.user.id;
}

export const billingController = {
  async checkout(req: AuthenticatedRequest, res: Response) {
    ok(res, await billingService.createCheckout(asManager(req), req.body));
  },

  async portal(req: AuthenticatedRequest, res: Response) {
    ok(res, await billingService.createPortal(asManager(req)));
  },

  async myPlan(req: AuthenticatedRequest, res: Response) {
    ok(res, await billingService.myPlan(asManager(req)));
  },

  async mine(req: AuthenticatedRequest, res: Response) {
    ok(res, await billingService.mySubscription(asManager(req)));
  },

  /**
   * O webhook do Stripe.
   *
   * Sem autenticação de sessão, porque quem chama é o Stripe e não uma pessoa —
   * a credencial dele é a assinatura do corpo, conferida antes de qualquer
   * leitura do conteúdo. Corpo cru, e não JSON já parseado: reserializar muda
   * espaços e ordem, e a assinatura deixa de bater.
   *
   * Responde 200 mesmo para o que ignora: o Stripe reentrega o que não recebe
   * 200, e reentregar um evento que este servidor nunca vai querer é um ciclo
   * que só cresce.
   */
  async webhook(req: AuthenticatedRequest, res: Response) {
    const assinatura = req.headers['stripe-signature'];
    const corpo = req.body as Buffer;

    if (!Buffer.isBuffer(corpo) || !verifyWebhookSignature(corpo, typeof assinatura === 'string' ? assinatura : undefined)) {
      logger.error({ req_id: (req as { id?: string }).id }, '[Stripe] Webhook com assinatura inválida');
      throw new UnauthorizedError('Assinatura inválida');
    }

    const evento = JSON.parse(corpo.toString('utf8'));
    const resultado = await billingService.handleEvent(evento);

    ok(res, { received: true, ...resultado });
  },
};
