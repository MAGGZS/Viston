import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate';
import { buildingRepository } from '../repositories/building.repository';
import { ForbiddenError, NotFoundError } from '../utils/errors';

/**
 * Garante que o usuário está vinculado ao prédio da rota.
 *
 * ADMIN passa direto — é o papel que administra todos os prédios.
 * Os demais precisam de um BuildingMember; sem ele a rota responde 403 e
 * nenhum dado do prédio vaza para quem só conhece o id.
 */
export function requireBuildingMember(param = 'id') {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const buildingId = req.params[param];

    const building = await buildingRepository.findById(buildingId);
    if (!building) throw new NotFoundError('Prédio');

    if (req.user.role === 'ADMIN') return next();

    const member = await buildingRepository.findMember(buildingId, req.user.id);
    if (!member) throw new ForbiddenError('Você não tem acesso a este prédio');

    next();
  };
}

/**
 * Ids dos prédios que o usuário pode enxergar em listagens.
 * `null` significa "sem filtro" (ADMIN vê tudo).
 */
export async function visibleBuildingIds(user: { id: string; role: string }): Promise<string[] | null> {
  if (user.role === 'ADMIN') return null;
  return buildingRepository.getMemberBuildingIds(user.id);
}
