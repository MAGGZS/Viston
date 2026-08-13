import { Request, Response, NextFunction } from 'express';
import { BuildingRole } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  user: { id: string; role: string };
  /**
   * Papel no prédio da rota, preenchido por `requireBuildingManager` /
   * `requireBuildingMember`. Só existe em rota com `:id` de prédio.
   */
  buildingRole?: BuildingRole | null;
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

  // O token carrega só o que a conta é no sistema: ADMIN ou nada. Papel de
  // prédio não cabe aqui — a mesma pessoa pode ser gestora de um prédio e
  // visualizadora de outro —, e é consultado por request em `buildingAccess`.
  //
  // A normalização também desarma o token antigo: emitido antes desta mudança,
  // ele ainda diz `role: "GESTOR"`, e sem isto chegaria ao resto do sistema
  // carregando um poder que não existe mais.
  const role = payload.role === 'ADMIN' ? 'ADMIN' : 'NONE';

  (req as AuthenticatedRequest).user = { id: payload.sub, role };
  next();
}
