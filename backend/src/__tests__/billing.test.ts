import { createHmac } from 'node:crypto';
import request from 'supertest';

jest.mock('../repositories/building.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/ticket.repository');
jest.mock('../repositories/analytics.repository');
jest.mock('../repositories/emailToken.repository');
jest.mock('../repositories/subscription.repository');
jest.mock('../lib/mailer');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');

// As chaves entram antes de `config` carregar: ele lê o ambiente no import, e
// sem elas a cobrança responderia 503 em todos os casos desta suíte.
process.env.STRIPE_SECRET_KEY = 'sk_test_naovale';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_teste';
process.env.STRIPE_PRICE_ESSENCIAL_MONTHLY = 'price_essencial_m';
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_m';
process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_y';
process.env.STRIPE_PRICE_EXTRA_BUILDING_MONTHLY = 'price_extra_m';

import app from '../app';
import { PlanCode, SubscriptionStatus } from '@prisma/client';
import { auditRepository } from '../repositories/building.repository';
import { managerRepository } from '../repositories/manager.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { verifyWebhookSignature } from '../lib/stripe';
import { signAccessToken } from '../utils/jwt';

const mockManagers = managerRepository as jest.Mocked<typeof managerRepository>;
const mockSubs = subscriptionRepository as jest.Mocked<typeof subscriptionRepository>;
const mockAudit = auditRepository as jest.Mocked<typeof auditRepository>;

const GESTOR_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const USER_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

const tokenGestor = signAccessToken(GESTOR_ID, 'NONE', 'MANAGER');
const tokenUsuario = signAccessToken(USER_ID, 'NONE', 'USER');

/** O `fetch` global trocado por um dublê: nenhuma chamada sai da máquina. */
const fetchMock = jest.fn();

/** O corpo assinado como o Stripe assina: `t=<agora>,v1=<hmac>`. */
function assinar(payload: string, segundos = Math.floor(Date.now() / 1000)) {
  const assinatura = createHmac('sha256', 'whsec_teste')
    .update(`${segundos}.${payload}`)
    .digest('hex');
  return `t=${segundos},v1=${assinatura}`;
}

const evento = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt_1',
  type: 'customer.subscription.updated',
  data: {
    object: {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: 1790000000,
      metadata: { manager_id: GESTOR_ID, plan: 'PRO', extra_buildings: '2' },
      items: { data: [{ price: { recurring: { interval: 'month' } } }] },
    },
  },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;

  mockManagers.findById.mockResolvedValue({
    id: GESTOR_ID,
    name: 'Ana',
    email: 'ana@test.com',
    status: 'ACTIVE',
    token_version: 0,
    suspended_at: null,
  } as never);
  mockSubs.findByManager.mockResolvedValue(null);
  mockSubs.recordEvent.mockResolvedValue(true);
  mockSubs.upsertFromStripe.mockResolvedValue({} as never);
  mockAudit.log.mockResolvedValue(undefined as never);

  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }),
  });
});

describe('POST /billing/checkout', () => {
  it('devolve a URL da sessão e manda a conta no metadata', async () => {
    const res = await request(app)
      .post('/billing/checkout')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ plan: 'PRO', interval: 'MONTHLY', extra_buildings: 2 });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain('checkout.stripe.com');

    // Duas chamadas: o cliente e a sessão.
    const [, sessao] = fetchMock.mock.calls;
    const corpo = new URLSearchParams(sessao[1].body as string);
    expect(corpo.get('mode')).toBe('subscription');
    expect(corpo.get('line_items[0][price]')).toBe('price_pro_m');
    expect(corpo.get('line_items[1][price]')).toBe('price_extra_m');
    expect(corpo.get('line_items[1][quantity]')).toBe('2');
    expect(corpo.get('subscription_data[metadata][manager_id]')).toBe(GESTOR_ID);
  });

  it('reaproveita o cliente que a conta já tem no Stripe', async () => {
    mockSubs.findByManager.mockResolvedValue({ stripe_customer_id: 'cus_ja_existe' } as never);

    await request(app)
      .post('/billing/checkout')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ plan: 'PRO', interval: 'MONTHLY' });

    // Uma chamada só: a sessão. Cliente novo a cada compra espalharia o
    // histórico de pagamento da mesma pessoa por várias fichas.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const corpo = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(corpo.get('customer')).toBe('cus_ja_existe');
  });

  it('não vende ao ESSENCIAL um extra que só o PRO comporta', async () => {
    const res = await request(app)
      .post('/billing/checkout')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ plan: 'ESSENCIAL', interval: 'MONTHLY', extra_buildings: 5 });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('plano fora do catálogo não chega ao Stripe', async () => {
    const res = await request(app)
      .post('/billing/checkout')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ plan: 'LIVRE', interval: 'MONTHLY' });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('conta de usuário não assina: a assinatura é da conta de gestor', async () => {
    const res = await request(app)
      .post('/billing/checkout')
      .set('Authorization', `Bearer ${tokenUsuario}`)
      .send({ plan: 'PRO', interval: 'MONTHLY' });

    expect(res.status).toBe(403);
  });

  it('recusa do Stripe vira 502, e o detalhe fica no log', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'No such price' });

    const res = await request(app)
      .post('/billing/checkout')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ plan: 'PRO', interval: 'MONTHLY' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PAGAMENTO_FALHOU');
    expect(JSON.stringify(res.body)).not.toContain('No such price');
  });
});

describe('POST /billing/portal', () => {
  it('sem assinatura não há portal a abrir', async () => {
    const res = await request(app)
      .post('/billing/portal')
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com assinatura, devolve a URL do portal', async () => {
    mockSubs.findByManager.mockResolvedValue({ stripe_customer_id: 'cus_1' } as never);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'bps_1', url: 'https://billing.stripe.com/p/session/bps_1' }),
    });

    const res = await request(app)
      .post('/billing/portal')
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(200);
    expect(res.body.url).toContain('billing.stripe.com');
  });
});

describe('assinatura do webhook', () => {
  const corpo = Buffer.from('{"id":"evt_1"}');

  it('aceita o que o Stripe assinou agora', () => {
    expect(verifyWebhookSignature(corpo, assinar(corpo.toString()))).toBe(true);
  });

  it('recusa corpo trocado depois de assinado', () => {
    const cabecalho = assinar(corpo.toString());
    expect(verifyWebhookSignature(Buffer.from('{"id":"evt_2"}'), cabecalho)).toBe(false);
  });

  it('recusa assinatura velha, mesmo correta', () => {
    const antes = Math.floor(Date.now() / 1000) - 3600;
    expect(verifyWebhookSignature(corpo, assinar(corpo.toString(), antes))).toBe(false);
  });

  it('recusa quem não manda cabeçalho nenhum', () => {
    expect(verifyWebhookSignature(corpo, undefined)).toBe(false);
  });
});

describe('POST /billing/webhook', () => {
  it('aplica a assinatura que o Stripe descreve', async () => {
    const payload = JSON.stringify(evento());

    const res = await request(app)
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', assinar(payload))
      .send(payload);

    expect(res.status).toBe(200);
    expect(mockSubs.upsertFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({
        manager_id: GESTOR_ID,
        plan: PlanCode.PRO,
        status: SubscriptionStatus.ACTIVE,
        extra_buildings: 2,
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_1',
      })
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SUBSCRIPTION_UPDATED', manager_id: GESTOR_ID })
    );
  });

  it('sem assinatura válida, nada é aplicado', async () => {
    const payload = JSON.stringify(evento());

    const res = await request(app)
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=naoconfere')
      .send(payload);

    expect(res.status).toBe(401);
    expect(mockSubs.recordEvent).not.toHaveBeenCalled();
    expect(mockSubs.upsertFromStripe).not.toHaveBeenCalled();
  });

  it('evento repetido não aplica de novo', async () => {
    mockSubs.recordEvent.mockResolvedValue(false);
    const payload = JSON.stringify(evento());

    const res = await request(app)
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', assinar(payload))
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(mockSubs.upsertFromStripe).not.toHaveBeenCalled();
  });

  it('evento de outro assunto é guardado e ignorado, com 200', async () => {
    const payload = JSON.stringify(evento({ type: 'invoice.paid' }));

    const res = await request(app)
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', assinar(payload))
      .send(payload);

    expect(res.status).toBe(200);
    expect(mockSubs.recordEvent).toHaveBeenCalled();
    expect(mockSubs.upsertFromStripe).not.toHaveBeenCalled();
  });

  it('assinatura sem manager_id não vira assinatura de ninguém', async () => {
    const semDono = evento();
    (semDono.data.object as { metadata?: unknown }).metadata = {};
    const payload = JSON.stringify(semDono);

    const res = await request(app)
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', assinar(payload))
      .send(payload);

    expect(res.status).toBe(200);
    expect(mockSubs.upsertFromStripe).not.toHaveBeenCalled();
  });

  it('cancelamento chega como CANCELED e a conta volta ao LIVRE na resolução', async () => {
    const cancelado = evento({ type: 'customer.subscription.deleted' });
    (cancelado.data.object as { status: string }).status = 'canceled';
    const payload = JSON.stringify(cancelado);

    await request(app)
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', assinar(payload))
      .send(payload);

    expect(mockSubs.upsertFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({ status: SubscriptionStatus.CANCELED })
    );
  });

  it('o intervalo sai do preço, e não de um palpite', async () => {
    const anual = evento();
    (anual.data.object as { items: unknown }).items = {
      data: [{ price: { recurring: { interval: 'year' } } }],
    };
    const payload = JSON.stringify(anual);

    await request(app)
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', assinar(payload))
      .send(payload);

    expect(mockSubs.upsertFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({ interval: 'YEARLY' })
    );
  });
});
