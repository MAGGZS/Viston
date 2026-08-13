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
 */
export interface TokenPayload {
  sub: string;
  kind: AccountKind;
  role: string;
  type: 'access' | 'refresh';
}

export function signAccessToken(userId: string, role: string, kind: AccountKind = 'USER'): string {
  return jwt.sign(
    { sub: userId, kind, role, type: 'access' } as TokenPayload,
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
  );
}

export function signRefreshToken(userId: string, role: string, kind: AccountKind = 'USER'): string {
  return jwt.sign(
    { sub: userId, kind, role, type: 'refresh' } as TokenPayload,
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions
  );
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, config.jwt.secret) as TokenPayload;
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}

export function verifyRefreshToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
  } catch {
    throw new UnauthorizedError('Refresh token inválido ou expirado');
  }
}
