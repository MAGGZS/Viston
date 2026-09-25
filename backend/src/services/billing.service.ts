import { AuditAction, BillingInterval, PlanCode, SubscriptionStatus } from '@prisma/client';
import { config } from '../config';
import { auditRepository } from '../repositories/building.repository';
import { managerRepository } from '../repositories/manager.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { stripeRequest, BillingUnavailableError } from '../lib/stripe';
import { logger } from '../lib/logger';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { PLANS } from '../utils/plans';
import { planService } from './plan.service';
import { planRepository } from '../repositories/plan.repository';
import { usageService } from './usage.service';

/**
 * A ponte com o Stripe: o que o gestor contrata, e o que o Stripe responde
 * depois.
 *
 * Duas direções, e as duas passam por aqui. Para lá vão a sessão de pagamento e
 * a do portal; de lá vem o webhook, que é a única fonte de verdade sobre o
 * estado da assinatura. O app nunca escreve "ele pagou" por conta própria: o
 * checkout só abre a porta, e quem confirma é o evento.
 *
 * Nada disto sobe sem as chaves (ver `config.stripe`). Sem elas as rotas
 * respondem 503, e o resto do produto continua inteiro.
 */

/** Só os planos que se compram: o LIVRE é onde a conta já está. */
type PlanoPago = Extract<PlanCode, 'ESSENCIAL' | 'PRO'>;

/** O status do Stripe, com os mesmos nomes — em maiúsculas e com underscore. */
function toStatus(stripeStatus: string): SubscriptionStatus | null {
  const mapa: Record<string, SubscriptionStatus> = {
    trialing: SubscriptionStatus.TRIALING,
    active: SubscriptionStatus.ACTIVE,
    past_due: SubscriptionStatus.PAST_DUE,
    canceled: SubscriptionStatus.CANCELED,
    incomplete: SubscriptionStatus.INCOMPLETE,
    incomplete_expired: SubscriptionStatus.INCOMPLETE,
    unpaid: SubscriptionStatus.UNPAID,
    paused: SubscriptionStatus.UNPAID,
  };
  return mapa[stripeStatus] ?? null;
}

function priceId(plan: PlanoPago, interval: BillingInterval): string {
  const price = config.stripe.prices[plan][interval];
  if (!price) throw new BillingUnavailableError();
  return price;
}

function extraPriceId(interval: BillingInterval): string {
  const price = config.stripe.prices.EXTRA_BUILDING[interval];
  if (!price) throw new BillingUnavailableError();
  return price;
}

type StripeSession = { id: string; url: string };
type StripeCustomer = { id: string };

/**
 * O cliente no Stripe desta conta de gestor.
 *
 * Reaproveitado quando já existe: um cliente novo a cada compra espalharia o
 * histórico de pagamento da mesma pessoa por várias fichas, e o portal mostraria
 * só um pedaço dele.
 */
async function ensureCustomer(managerId: string): Promise<string> {
  const existente = await subscriptionRepository.findByManager(managerId);
  if (existente?.stripe_customer_id) return existente.stripe_customer_id;

  const manager = await managerRepository.findById(managerId);
  if (!manager) throw new NotFoundError('Gestor');

  const customer = await stripeRequest<StripeCustomer>(
    '/customers',
    {
      email: manager.email,
      name: manager.name,
      'metadata[manager_id]': managerId,
    },
    `customer_${managerId}`
  );

  return customer.id;
}

export const billingService = {
  /**
   * Abre a sessão de pagamento e devolve para onde mandar a pessoa.
   *
   * O teto de extras é o do plano escolhido, conferido aqui: comprar vinte
   * extras no ESSENCIAL passaria pelo Stripe e cobraria de verdade por um
   * limite que o catálogo não concede.
   *
   * `metadata` carrega a conta e o plano porque é o que o webhook lê depois —
   * o evento chega sem nenhuma ligação com o Viston fora dela.
   */
  async createCheckout(
    managerId: string,
    data: { plan: PlanoPago; interval: BillingInterval; extra_buildings?: number }
  ) {
    const extras = data.extra_buildings ?? 0;
    const teto = PLANS[data.plan].limits.extraBuildings;
    if (extras > teto) {
      throw new ValidationError(`O plano ${PLANS[data.plan].name} comporta até ${teto} prédios extras.`);
    }

    const customer = await ensureCustomer(managerId);

    const linhas: Record<string, string | number> = {
      'line_items[0][price]': priceId(data.plan, data.interval),
      'line_items[0][quantity]': 1,
    };
    if (extras > 0) {
      linhas['line_items[1][price]'] = extraPriceId(data.interval);
      linhas['line_items[1][quantity]'] = extras;
    }

    const session = await stripeRequest<StripeSession>('/checkout/sessions', {
      mode: 'subscription',
      customer,
      // O front volta para a tela de cobrança nos dois casos; o que muda é o
      // aviso que ela mostra.
      success_url: `${config.cors.origins[0]}/perfil?secao=cobranca&checkout=ok`,
      cancel_url: `${config.cors.origins[0]}/perfil?secao=cobranca&checkout=cancelado`,
      ...linhas,
      'subscription_data[metadata][manager_id]': managerId,
      'subscription_data[metadata][plan]': data.plan,
      'subscription_data[metadata][extra_buildings]': extras,
      'metadata[manager_id]': managerId,
    });

    return { url: session.url };
  },

  /**
   * A porta do portal do Stripe, onde o cliente troca o cartão, baixa a nota e
   * cancela.
   *
   * Nada disso é reimplementado aqui: o portal é o do provedor, e a tela que
   * cuida de cartão é a que nunca deve passar por este servidor.
   */
  async createPortal(managerId: string) {
    const assinatura = await subscriptionRepository.findByManager(managerId);
    if (!assinatura?.stripe_customer_id) {
      throw new ConflictError('Esta conta ainda não tem assinatura.');
    }

    const session = await stripeRequest<StripeSession>('/billing_portal/sessions', {
      customer: assinatura.stripe_customer_id,
      return_url: `${config.cors.origins[0]}/perfil?secao=cobranca`,
    });

    return { url: session.url };
  },

  /**
   * O plano que vale para esta conta, e quanto dele já se gastou.
   *
   * É o que a tela de cobrança precisa para avisar antes de a pessoa esbarrar:
   * "2 de 3 prédios" dito a tempo evita o 403 que ela só descobriria ao tentar
   * cadastrar o quarto. Os números são os mesmos que o gating usa — vêm da
   * mesma resolução de plano, e não de uma segunda conta paralela.
   */
  async myPlan(managerId: string) {
    const [plano, buildings, emails, storageBytes] = await Promise.all([
      planService.resolvePlan(managerId),
      planRepository.countOwnedBuildings(managerId),
      usageService.emailsSent(managerId),
      usageService.storageUsedBytes(managerId),
    ]);

    return {
      code: plano.code,
      name: PLANS[plano.code].name,
      source: plano.source,
      features: plano.features,
      buildings_allowed: plano.buildingsAllowed,
      extra_buildings: plano.extraBuildings,
      limits: {
        // Infinity não sobrevive ao JSON (vira null): a API diz `null` de
        // propósito, e a tela lê nulo como "sem teto".
        people: Object.fromEntries(
          Object.entries(plano.limits.people).map(([papel, teto]) => [
            papel,
            Number.isFinite(teto) ? teto : null,
          ])
        ),
        storage_bytes: plano.limits.storageBytes,
        emails_per_month: plano.limits.emailsPerMonth,
      },
      usage: {
        buildings,
        emails_this_month: emails,
        storage_bytes: storageBytes,
        period: usageService.currentPeriod(),
      },
    };
  },

  /** O que a tela de cobrança mostra: o que a conta contratou, sem o Stripe. */
  async mySubscription(managerId: string) {
    const assinatura = await subscriptionRepository.findByManager(managerId);
    if (!assinatura) return null;

    return {
      plan: assinatura.plan,
      status: assinatura.status,
      interval: assinatura.interval,
      extra_buildings: assinatura.extra_buildings,
      current_period_end: assinatura.current_period_end,
      cancel_at_period_end: assinatura.cancel_at_period_end,
    };
  },

  /**
   * O evento do Stripe, aplicado uma vez só.
   *
   * A idempotência é a chave primária de `stripe_events`: o Stripe reentrega o
   * mesmo evento quando não recebe 200, e sem isso o reenvio aplicaria a mesma
   * mudança duas vezes. Gravar primeiro e aplicar depois é a ordem certa — se a
   * aplicação falhar, `removeEvent` desfaz a marca para a reentrega tentar de
   * novo (SEC-08).
   *
   * Evento que não interessa também é gravado: é o que faz o reenvio dele parar
   * de custar trabalho.
   */
  async handleEvent(event: {
    id: string;
    type: string;
    created?: number;
    data: { object: Record<string, unknown> };
  }) {
    const novo = await subscriptionRepository.recordEvent(event.id, event.type, event);
    if (!novo) {
      logger.info({ event_id: event.id, type: event.type }, '[Stripe] Evento repetido, ignorado');
      return { duplicate: true };
    }

    try {
      if (!event.type.startsWith('customer.subscription.')) return { ignored: true };

      const sub = event.data.object as {
        id: string;
        customer: string;
        status: string;
        cancel_at_period_end?: boolean;
        current_period_end?: number;
        metadata?: Record<string, string>;
        items?: {
          data: {
            price?: { id?: string; recurring?: { interval?: string } };
            quantity?: number;
          }[];
        };
      };

      const managerId = sub.metadata?.manager_id;
      if (!managerId) {
        logger.error({ event_id: event.id, subscription: sub.id }, '[Stripe] Assinatura sem manager_id');
        return { ignored: true };
      }

      const status = toStatus(sub.status);
      if (!status) {
        logger.error({ event_id: event.id, status: sub.status }, '[Stripe] Status desconhecido');
        return { ignored: true };
      }

      // SEC-03: se o gestor já tem customer registrado no banco, recusar evento
      // cuja assinatura pertença a outro customer do Stripe.
      const existente = await subscriptionRepository.findByManager(managerId);
      if (existente?.stripe_customer_id && existente.stripe_customer_id !== sub.customer) {
        logger.error(
          {
            event_id: event.id,
            subscription: sub.id,
            expected_customer: existente.stripe_customer_id,
            actual_customer: sub.customer,
          },
          '[Stripe] Assinatura com customer divergente do registrado para o gestor'
        );
        return { ignored: true };
      }

      // SEC-08: ignorar evento entregue fora de ordem (mais antigo que o último já aplicado).
      const eventAt = typeof event.created === 'number' ? new Date(event.created * 1000) : null;
      if (existente?.last_event_at && eventAt && eventAt < existente.last_event_at) {
        logger.info(
          { event_id: event.id, event_at: eventAt, last_event_at: existente.last_event_at },
          '[Stripe] Evento fora de ordem ignorado'
        );
        return { ignored: true };
      }

      // SEC-03: derivar plano, periodicidade e prédios extras dos price.id reais
      // contratados nos itens da assinatura, e não de metadata editável.
      const prices = config.stripe.prices;
      let plan: PlanCode | null = null;
      let interval: BillingInterval | null = null;
      let extra_buildings = 0;

      const items = sub.items?.data ?? [];
      if (items.length === 0) {
        logger.error({ event_id: event.id, subscription: sub.id }, '[Stripe] Assinatura sem itens');
        return { ignored: true };
      }

      for (const item of items) {
        const priceId = item.price?.id;
        if (!priceId) {
          logger.error({ event_id: event.id, subscription: sub.id }, '[Stripe] Item sem price.id');
          return { ignored: true };
        }
        if (priceId === prices.ESSENCIAL.MONTHLY) {
          plan = PlanCode.ESSENCIAL;
          interval = BillingInterval.MONTHLY;
        } else if (priceId === prices.ESSENCIAL.YEARLY) {
          plan = PlanCode.ESSENCIAL;
          interval = BillingInterval.YEARLY;
        } else if (priceId === prices.PRO.MONTHLY) {
          plan = PlanCode.PRO;
          interval = BillingInterval.MONTHLY;
        } else if (priceId === prices.PRO.YEARLY) {
          plan = PlanCode.PRO;
          interval = BillingInterval.YEARLY;
        } else if (
          priceId === prices.EXTRA_BUILDING.MONTHLY ||
          priceId === prices.EXTRA_BUILDING.YEARLY
        ) {
          extra_buildings += Math.max(0, Number(item.quantity ?? 1));
        } else {
          logger.error(
            { event_id: event.id, subscription: sub.id, price_id: priceId },
            '[Stripe] Price ID desconhecido na assinatura'
          );
          return { ignored: true };
        }
      }

      if (!plan || !interval) {
        logger.error(
          { event_id: event.id, subscription: sub.id },
          '[Stripe] Assinatura sem preço de plano válido'
        );
        return { ignored: true };
      }

      await subscriptionRepository.upsertFromStripe({
        manager_id: managerId,
        plan,
        status,
        interval,
        extra_buildings,
        stripe_customer_id: sub.customer,
        stripe_subscription_id: sub.id,
        current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        ...(eventAt ? { last_event_at: eventAt } : {}),
      });

      await auditRepository.log({
        manager_id: managerId,
        action: AuditAction.SUBSCRIPTION_UPDATED,
        entity: 'Subscription',
        entity_id: sub.id,
        metadata: { event: event.type, status, plan },
      });

      return { applied: true };
    } catch (err) {
      await subscriptionRepository.removeEvent?.(event.id);
      throw err;
    }
  },
};
