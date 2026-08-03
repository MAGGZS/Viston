import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  user: { id: string; role: string };
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token não fornecido');
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (payload.type !== 'access') {
    throw new UnauthorizedError('Token inválido');
  }

  (req as AuthenticatedRequest).user = { id: payload.sub, role: payload.role };
  next();
}
