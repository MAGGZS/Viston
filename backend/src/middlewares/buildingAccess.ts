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
 * O vínculo já consultado nesta requisição.
 *
 * `req.user` é um objeto novo por requisição (ver `authenticate`), então a
 * `WeakMap` é uma cache com o tempo de vida certo: some junto com a requisição,
 * sem precisar de invalidação e sem correr o risco de responder com o papel de
 * ontem. O vínculo é perguntado duas ou três vezes na mesma chamada — pelo
 * middleware da rota e de novo pelo serviço —, e cada pergunta era uma ida ao
 * banco.
 */
const standingCache = new WeakMap<Actor, Map<string, BuildingStanding | null>>();

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

  let byBuilding = standingCache.get(user);
  if (byBuilding?.has(buildingId)) return byBuilding.get(buildingId) ?? null;

  const standing = await resolveBuildingStanding(user, buildingId);

  if (!byBuilding) {
    byBuilding = new Map();
    standingCache.set(user, byBuilding);
  }
  byBuilding.set(buildingId, standing);

  return standing;
}

async function resolveBuildingStanding(
  user: Actor,
  buildingId: string
): Promise<BuildingStanding | null> {
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

  // Pela mesma porta que o resto: o vínculo já foi consultado nesta requisição
  // pelo middleware da rota, e aqui a resposta vem da cache.
  return (await getBuildingStanding(user, buildingId)) === BuildingRole.INSPECTOR;
}

/**
 * Trata o chamado: recebe, encaminha ao responsável e fecha.
 *
 * É o moderador do prédio — e também quem o administra. Gestor e ADMIN passam
 * porque a alternativa é pior: prédio cujo moderador saiu ficaria com a fila de
 * chamados parada, sem ninguém que pudesse fechá-los ou nomear outro moderador.
 * O caminho contrário não existe: moderador não administra prédio.
 */
export async function canModerateBuilding(user: Actor, buildingId: string): Promise<boolean> {
  const standing = await getBuildingStanding(user, buildingId);
  return standing === 'GESTOR' || standing === BuildingRole.MODERADOR;
}

/** Atende chamado no prédio. Só conta de usuário com o papel de responsável. */
export async function isBuildingResponsible(user: Actor, buildingId: string): Promise<boolean> {
  return (await getBuildingStanding(user, buildingId)) === BuildingRole.RESPONSAVEL;
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
 * Garante que o ator trata os chamados do prédio da rota.
 *
 * É a guarda das telas de chamado: sem ela, qualquer vínculo com o prédio veria
 * a fila do moderador — inclusive quem só acompanha.
 */
export function requireBuildingModerator(param = 'id') {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const buildingId = req.params[param];

    const building = await buildingRepository.findById(buildingId);
    if (!building) throw new NotFoundError('Prédio');

    const standing = await getBuildingStanding(req.user, buildingId);
    if (standing !== 'GESTOR' && standing !== BuildingRole.MODERADOR) {
      throw new ForbiddenError('Apenas o moderador do prédio pode ver os chamados');
    }

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
