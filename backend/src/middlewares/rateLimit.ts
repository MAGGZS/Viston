import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

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

/**
 * Login e refresh: alvo de força bruta. Tentativa que dá certo não conta.
 *
 * A cota é por IP *e* conta, não por IP sozinho. Por IP sozinho ela erra dos
 * dois lados: um escritório inteiro atrás de um NAT divide vinte tentativas
 * entre todo mundo, e quem ataca de mil máquinas tem mil cotas para varrer a
 * mesma senha. Chaveando pelos dois, o teto passa a valer sobre o que
 * realmente se quer limitar — insistir numa conta a partir de um lugar.
 *
 * O refresh não manda e-mail, e cai no ramo do IP puro: ali a chave é a origem,
 * que é o que existe para contar.
 */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email ? `${ipKeyGenerator(req.ip ?? '')}:${email}` : ipKeyGenerator(req.ip ?? '');
  },
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
