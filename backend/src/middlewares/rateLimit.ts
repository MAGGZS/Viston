import rateLimit from 'express-rate-limit';

const base = { standardHeaders: true as const, legacyHeaders: false };

function tooMany(message: string) {
  return { error: { code: 'TOO_MANY_REQUESTS', message } };
}

/** Teto geral por IP — segura varredura de endpoints sem atrapalhar uso normal. */
export const generalLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 300,
  message: tooMany('Muitas requisições. Aguarde um instante.'),
});

/** Login e refresh: alvo de força bruta. Tentativa que dá certo não conta. */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: tooMany('Muitas tentativas. Tente de novo em alguns minutos.'),
});

/**
 * Cadastro público, busca por chave de compartilhamento e pedido de acesso:
 * evita criação de contas em massa e varredura de chaves de prédio.
 */
export const sensitiveLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: 60,
  message: tooMany('Limite de requisições atingido. Tente mais tarde.'),
});
