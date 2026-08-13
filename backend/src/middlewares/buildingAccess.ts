import { Response, NextFunction } from 'express';
import { BuildingRole } from '@prisma/client';
import { Actor, AuthenticatedRequest } from './authenticate';
import { buildingRepository } from '../repositories/building.repository';
import { ForbiddenError, NotFoundError } from '../utils/errors';

/** O que o ator é dentro de um prédio. 'GESTOR' não vem do enum: gestor não é membro. */
export type BuildingStanding = 'GESTOR' | BuildingRole;

/**
 * O ADMIN é a conta de suporte do sistema: passa por qualquer prédio sem
 * precisar de vínculo. Ele não tem tela de prédios — o produto dele é a gestão
 * de contas —, mas a API continua aberta para ele.
 */
function isAdmin(user: Actor): boolean {
  return user.kind === 'USER' && user.role === 'ADMIN';
}

/**
 * O que o ator é naquele prédio.
 *
 * Duas tabelas respondem, e a pergunta muda conforme o tipo da conta: gestor se
 * procura em `building_managers`, usuário em `building_members`. Uma conta nunca
 * está nas duas — são identidades separadas.
 *
 * `null` significa "não tem nada a ver com este prédio".
 */
export async function getBuildingStanding(
  user: Actor,
  buildingId: string
): Promise<BuildingStanding | null> {
  if (isAdmin(user)) return 'GESTOR';

  if (user.kind === 'MANAGER') {
    const link = await buildingRepository.findManagerLink(buildingId, user.id);
    return link ? 'GESTOR' : null;
  }

  const member = await buildingRepository.findMember(buildingId, user.id);
  return member?.role ?? null;
}

/** Administra o prédio: andares, colaboradores, solicitações, descarte de vistoria. */
export async function isBuildingManager(user: Actor, buildingId: string): Promise<boolean> {
  return (await getBuildingStanding(user, buildingId)) === 'GESTOR';
}

/**
 * Vistoria o prédio.
 *
 * Só conta de usuário: `inspection_reports.inspector_id` aponta para `users`, e
 * o gestor não está lá. Quem administra prédio não vistoria.
 */
export async function canInspectBuilding(user: Actor, buildingId: string): Promise<boolean> {
  if (user.kind !== 'USER') return false;
  if (isAdmin(user)) return true;

  const member = await buildingRepository.findMember(buildingId, user.id);
  return member?.role === BuildingRole.INSPECTOR;
}

/**
 * Garante que o ator administra o prédio da rota.
 *
 * É este middleware que autoriza as rotas de prédio: não existe papel na conta
 * para conferir antes dele.
 */
export function requireBuildingManager(param = 'id') {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const buildingId = req.params[param];

    const building = await buildingRepository.findById(buildingId);
    if (!building) throw new NotFoundError('Prédio');

    const standing = await getBuildingStanding(req.user, buildingId);
    if (standing !== 'GESTOR') {
      throw new ForbiddenError('Apenas o gestor do prédio pode fazer isso');
    }

    // Guardado para o controller não repetir a consulta (ver getDashboard)
    req.buildingRole = standing;
    next();
  };
}

/**
 * Garante que o ator tem alguma ligação com o prédio da rota.
 *
 * Sem ligação a rota responde 403, e nenhum dado do prédio vaza para quem só
 * conhece o id.
 */
export function requireBuildingMember(param = 'id') {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const buildingId = req.params[param];

    const building = await buildingRepository.findById(buildingId);
    if (!building) throw new NotFoundError('Prédio');

    const standing = await getBuildingStanding(req.user, buildingId);
    if (!standing) throw new ForbiddenError('Você não tem acesso a este prédio');

    req.buildingRole = standing;
    next();
  };
}

/**
 * Ids dos prédios que o ator pode enxergar em listagens.
 * `null` significa "sem filtro" (ADMIN vê tudo).
 */
export async function visibleBuildingIds(user: Actor): Promise<string[] | null> {
  if (isAdmin(user)) return null;

  return user.kind === 'MANAGER'
    ? buildingRepository.getManagedBuildingIds(user.id)
    : buildingRepository.getMemberBuildingIds(user.id);
}
