import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { logger } from './logger';
import { AppError } from '../utils/errors';

/**
 * O Stripe, falado por HTTP direto — sem SDK.
 *
 * Mesma escolha do mailer, e pela mesma razão: são três chamadas e uma
 * verificação de assinatura, e o `fetch` do Node 22 dá conta. O SDK traria uma
 * superfície grande para o que aqui é pequeno, e uma versão a acompanhar; a API
 * REST do Stripe é estável e versionada por cabeçalho, que é o que se fixa
 * abaixo.
 *
 * A versão vai fixada de propósito: sem ela, a conta usa a versão do painel, e
 * o dia em que o Stripe a adiantar muda a forma do que chega aqui sem ninguém
 * ter mexido em nada.
 */
const API = 'https://api.stripe.com/v1';
const API_VERSION = '2025-08-27.basil';
const TIMEOUT_MS = 15_000;

/** A janela em que uma assinatura de webhook ainda vale. */
export const TOLERANCIA_ASSINATURA_SEG = 300;

/** As rotas de cobrança existem, mas a loja ainda não abriu. */
export class BillingUnavailableError extends AppError {
  constructor() {
    super('COBRANCA_INDISPONIVEL', 'A cobrança ainda não está disponível.', 503);
  }
}

/** O provedor recusou a chamada. */
export class StripeRequestError extends AppError {
  constructor(message = 'Não foi possível falar com o provedor de pagamento.') {
    super('PAGAMENTO_FALHOU', message, 502);
  }
}

/** Tem chave e tem preço: dá para cobrar. */
export function billingEnabled(): boolean {
  return Boolean(config.stripe.secretKey);
}

function assertEnabled(): void {
  if (!billingEnabled()) throw new BillingUnavailableError();
}

/**
 * O corpo no formato que o Stripe lê: `application/x-www-form-urlencoded` com
 * colchetes para o que é aninhado (`line_items[0][price]`).
 *
 * Escrito à mão porque é o único lugar que precisa disso, e porque um objeto
 * plano com as chaves já prontas esconderia de quem lê a forma que o Stripe
 * exige.
 */
export function toFormBody(data: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(data)) {
    if (valor === undefined) continue;
    params.append(chave, String(valor));
  }
  return params.toString();
}

/**
 * Uma chamada à API do Stripe.
 *
 * `Idempotency-Key` vai em todo POST quando quem chama tem uma: reenviar depois
 * de um timeout não pode criar uma segunda assinatura para a mesma pessoa.
 */
export async function stripeRequest<T>(
  path: string,
  body?: Record<string, string | number | undefined>,
  idempotencyKey?: string
): Promise<T> {
  assertEnabled();

  try {
    const resposta = await fetch(`${API}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: `Bearer ${config.stripe.secretKey}`,
        'stripe-version': API_VERSION,
        ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: body ? toFormBody(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      logger.error(
        { status: resposta.status, path, detalhe: detalhe.slice(0, 500) },
        '[Stripe] Chamada recusada'
      );
      throw new StripeRequestError();
    }

    return (await resposta.json()) as T;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, path }, '[Stripe] Chamada falhou');
    throw new StripeRequestError();
  }
}

/**
 * Confere a assinatura do webhook — e é ela, e não o corpo, que diz se o evento
 * é do Stripe.
 *
 * O cabeçalho `Stripe-Signature` traz o instante (`t=`) e uma ou mais
 * assinaturas (`v1=`). A conta é HMAC-SHA256 de `t.corpo` com o segredo do
 * endpoint. Sem isto, qualquer um que descubra a URL promove a própria conta
 * para PRO com um `curl`.
 *
 * O corpo tem de ser o texto cru: um `JSON.parse` seguido de `stringify` muda
 * espaços e ordem, e a assinatura deixa de bater — é por isso que a rota do
 * webhook recebe `Buffer` em vez de passar pelo `express.json`.
 *
 * A janela de cinco minutos é o que impede reenviar um evento antigo capturado
 * em trânsito.
 */
export function verifyWebhookSignature(
  payload: Buffer,
  header: string | undefined,
  agora = Date.now()
): boolean {
  const secret = config.stripe.webhookSecret;
  if (!secret || !header) return false;

  const partes = new Map(
    header.split(',').map((p) => {
      const [chave, ...resto] = p.trim().split('=');
      return [chave, resto.join('=')] as const;
    })
  );

  const timestamp = partes.get('t');
  const assinatura = partes.get('v1');
  if (!timestamp || !assinatura) return false;

  const idade = Math.abs(agora / 1000 - Number(timestamp));
  if (!Number.isFinite(idade) || idade > TOLERANCIA_ASSINATURA_SEG) return false;

  const esperada = createHmac('sha256', secret)
    .update(`${timestamp}.${payload.toString('utf8')}`)
    .digest('hex');

  if (esperada.length !== assinatura.length) return false;
  return timingSafeEqual(Buffer.from(esperada), Buffer.from(assinatura));
}
