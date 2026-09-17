import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from './errors';

/**
 * Em que tabela mora o dono do token.
 *
 * Sem isto o `sub` seria ambíguo: `users` e `managers` são tabelas separadas, e
 * nada impede que um id de uma exista na outra — as contas migradas na
 * `manager_accounts`, aliás, mantiveram o id de propósito.
 */
export type AccountKind = 'USER' | 'MANAGER';

/**
 * O token carrega o dono, em que tabela ele está, e — só para usuário — se ele
 * é o ADMIN do sistema.
 *
 * Papel de prédio não cabe aqui: um usuário pode ser inspetor de um prédio e
 * visualizador de outro, e um gestor administra um conjunto que muda sem o
 * token expirar. Quem responde isso é `buildingAccess`, por requisição.
 *
 * `tv` é a geração das sessões da conta (ver `User.token_version`) e só o
 * refresh token a consulta: o access token dura quinze minutos e é conferido a
 * cada requisição — cobrá-la ali custaria uma ida ao banco por chamada para
 * antecipar em minutos o que o refresh já recusa.
 */
export interface TokenPayload {
  sub: string;
  kind: AccountKind;
  role: string;
  type: 'access' | 'refresh';
  /** Ausente nos tokens emitidos antes da revogação existir: valem como 0. */
  tv?: number;
}

/**
 * O algoritmo, fixo na assinatura e na conferência.
 *
 * Sem a lista na conferência, é o cabeçalho do próprio token — escrito por quem
 * o envia — que diz como ele deve ser verificado. É a porta clássica da troca
 * de algoritmo; fixar HS256 fecha a porta em vez de confiar na versão da lib.
 */
const ALGORITHM = 'HS256' as const;
const VERIFY_OPTIONS: jwt.VerifyOptions = { algorithms: [ALGORITHM] };

export function signAccessToken(userId: string, role: string, kind: AccountKind = 'USER'): string {
  return jwt.sign(
    { sub: userId, kind, role, type: 'access' } as TokenPayload,
    config.jwt.secret,
    { algorithm: ALGORITHM, expiresIn: config.jwt.expiresIn } as jwt.SignOptions
  );
}

export function signRefreshToken(
  userId: string,
  role: string,
  kind: AccountKind = 'USER',
  tokenVersion = 0
): string {
  return jwt.sign(
    { sub: userId, kind, role, type: 'refresh', tv: tokenVersion } as TokenPayload,
    config.jwt.refreshSecret,
    { algorithm: ALGORITHM, expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions
  );
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, config.jwt.secret, VERIFY_OPTIONS) as TokenPayload;
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}

export function verifyRefreshToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, config.jwt.refreshSecret, VERIFY_OPTIONS) as TokenPayload;
  } catch {
    throw new UnauthorizedError('Refresh token inválido ou expirado');
  }
}
