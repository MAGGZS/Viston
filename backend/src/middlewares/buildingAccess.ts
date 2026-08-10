import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate';
import { buildingRepository } from '../repositories/building.repository';
import { ForbiddenError, NotFoundError } from '../utils/errors';

type Actor = { id: string; role: string };

/**
 * Quem administra o prédio: o GESTOR que o criou.
 *
 * O ADMIN continua passando pela API — é a conta de suporte do sistema — mas
 * não tem mais tela de prédios; o produto dele é a gestão de contas.
 */
export function isBuildingManager(
  user: Actor,
  building: { created_by: string | null }
): boolean {
  if (user.role === 'ADMIN') return true;
  return user.role === 'GESTOR' && building.created_by === user.id;
}

/**
 * Garante que o usuário administra o prédio da rota.
 * Usado em tudo que altera o prédio: edição, andares, membros e solicitações.
 */
export function requireBuildingManager(param = 'id') {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const building = await buildingRepository.findById(req.params[param]);
    if (!building) throw new NotFoundError('Prédio');

    if (!isBuildingManager(req.user, building)) {
      throw new ForbiddenError('Apenas o gestor do prédio pode fazer isso');
    }

    next();
  };
}

/**
 * Garante que o usuário está vinculado ao prédio da rota.
 *
 * Quem administra o prédio passa direto. Os demais precisam de um
 * BuildingMember; sem ele a rota responde 403 e nenhum dado do prédio vaza para
 * quem só conhece o id.
 */
export function requireBuildingMember(param = 'id') {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const buildingId = req.params[param];

    const building = await buildingRepository.findById(buildingId);
    if (!building) throw new NotFoundError('Prédio');

    if (isBuildingManager(req.user, building)) return next();

    const member = await buildingRepository.findMember(buildingId, req.user.id);
    if (!member) throw new ForbiddenError('Você não tem acesso a este prédio');

    next();
  };
}

/**
 * Ids dos prédios que o usuário pode enxergar em listagens.
 * `null` significa "sem filtro" (ADMIN vê tudo).
 *
 * O GESTOR vê os prédios que criou somados aos que ele por acaso integre como
 * membro — nada impede que ele também vistorie o prédio de outra pessoa.
 */
export async function visibleBuildingIds(user: Actor): Promise<string[] | null> {
  if (user.role === 'ADMIN') return null;

  const memberIds = await buildingRepository.getMemberBuildingIds(user.id);
  if (user.role !== 'GESTOR') return memberIds;

  const managedIds = await buildingRepository.getManagedBuildingIds(user.id);
  return [...new Set([...managedIds, ...memberIds])];
}
