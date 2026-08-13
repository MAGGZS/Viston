import { Response, NextFunction } from 'express';
import { BuildingRole } from '@prisma/client';
import { AuthenticatedRequest } from './authenticate';
import { buildingRepository } from '../repositories/building.repository';
import { ForbiddenError, NotFoundError } from '../utils/errors';

export type Actor = { id: string; role: string };

/**
 * O ADMIN é a conta de suporte do sistema: passa por qualquer prédio sem
 * precisar de vínculo. Ele não tem tela de prédios — o produto dele é a gestão
 * de contas —, mas a API precisa continuar aberta para ele.
 */
function isAdmin(user: Actor): boolean {
  return user.role === 'ADMIN';
}

/**
 * O papel da pessoa dentro daquele prédio, lido do vínculo.
 *
 * `building_members` é a única fonte de atribuição do produto. `created_by` não
 * entra na conta: ele é histórico de quem cadastrou, e some quando a conta some.
 *
 * `null` significa "não tem vínculo com este prédio".
 */
export async function getBuildingRole(
  user: Actor,
  buildingId: string
): Promise<BuildingRole | null> {
  if (isAdmin(user)) return BuildingRole.GESTOR;

  const member = await buildingRepository.findMember(buildingId, user.id);
  return member?.role ?? null;
}

/** Administra o prédio: andares, colaboradores, solicitações, descarte de vistoria. */
export async function isBuildingManager(user: Actor, buildingId: string): Promise<boolean> {
  return (await getBuildingRole(user, buildingId)) === BuildingRole.GESTOR;
}

/** Vistoria o prédio. O gestor também vistoria o que administra. */
export async function canInspectBuilding(user: Actor, buildingId: string): Promise<boolean> {
  const role = await getBuildingRole(user, buildingId);
  return role === BuildingRole.GESTOR || role === BuildingRole.INSPECTOR;
}

/**
 * Garante que o usuário administra o prédio da rota.
 *
 * É este middleware — e não mais um `authorize(...)` na frente dele — que
 * autoriza as rotas de prédio: com o papel vindo do vínculo, não existe mais
 * nada em `users.role` para conferir antes.
 */
export function requireBuildingManager(param = 'id') {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const buildingId = req.params[param];

    const building = await buildingRepository.findById(buildingId);
    if (!building) throw new NotFoundError('Prédio');

    const role = await getBuildingRole(req.user, buildingId);
    if (role !== BuildingRole.GESTOR) {
      throw new ForbiddenError('Apenas o gestor do prédio pode fazer isso');
    }

    // Guardado para o controller não repetir a consulta (ver getDashboard)
    req.buildingRole = role;
    next();
  };
}

/**
 * Garante que o usuário está vinculado ao prédio da rota.
 *
 * Sem vínculo a rota responde 403, e nenhum dado do prédio vaza para quem só
 * conhece o id.
 */
export function requireBuildingMember(param = 'id') {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const buildingId = req.params[param];

    const building = await buildingRepository.findById(buildingId);
    if (!building) throw new NotFoundError('Prédio');

    const role = await getBuildingRole(req.user, buildingId);
    if (!role) throw new ForbiddenError('Você não tem acesso a este prédio');

    req.buildingRole = role;
    next();
  };
}

/**
 * Ids dos prédios que o usuário pode enxergar em listagens.
 * `null` significa "sem filtro" (ADMIN vê tudo).
 *
 * Uma consulta só: o gestor agora é membro do próprio prédio, então a lista de
 * vínculos já cobre o que ele administra.
 */
export async function visibleBuildingIds(user: Actor): Promise<string[] | null> {
  if (isAdmin(user)) return null;
  return buildingRepository.getMemberBuildingIds(user.id);
}
