import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from './errors';

export interface TokenPayload {
  sub: string;
  role: string;
  type: 'access' | 'refresh';
}

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign(
    { sub: userId, role, type: 'access' } as TokenPayload,
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
  );
}

export function signRefreshToken(userId: string, role: string): string {
  return jwt.sign(
    { sub: userId, role, type: 'refresh' } as TokenPayload,
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
