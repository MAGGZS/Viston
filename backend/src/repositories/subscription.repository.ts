import { BillingInterval, PlanCode, Prisma, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const subscriptionRepository = {
  findByManager(managerId: string) {
    return prisma.subscription.findUnique({ where: { manager_id: managerId } });
  },

  /**
   * Grava a assinatura como o Stripe a descreve.
   *
   * `upsert` por `manager_id`: é uma por conta, e o webhook chega tanto para a
   * primeira compra quanto para a décima troca de plano. Quem manda é sempre o
   * evento — o app não escreve "ele pagou" por conta própria.
   */
  upsertFromStripe(data: {
    manager_id: string;
    plan: PlanCode;
    status: SubscriptionStatus;
    interval: BillingInterval;
    extra_buildings: number;
    stripe_customer_id: string;
    stripe_subscription_id: string;
    current_period_end: Date | null;
    cancel_at_period_end: boolean;
  }) {
    const { manager_id, ...resto } = data;
    return prisma.subscription.upsert({
      where: { manager_id },
      create: { manager_id, ...resto },
      update: resto,
    });
  },

  /**
   * Registra o evento, e diz se ele é novo.
   *
   * `false` é evento repetido — o Stripe reentrega o mesmo quando não recebe
   * 200. A corrida entre duas entregas simultâneas cai no P2002 do unique, que
   * é justamente a resposta certa: quem perder a corrida não aplica nada.
   */
  async recordEvent(id: string, type: string, payload: unknown): Promise<boolean> {
    try {
      await prisma.stripeEvent.create({
        data: { id, type, payload: payload as Prisma.InputJsonValue },
      });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return false;
      }
      throw err;
    }
  },
};
