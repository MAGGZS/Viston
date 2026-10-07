import { Response, NextFunction } from 'express';
import { BuildingRole } from '@prisma/client';
import { Actor, AuthenticatedRequest } from './authenticate';
import { buildingRepository } from '../repositories/building.repository';
import { userRepository } from '../repositories/user.repository';
import { ForbiddenError, NotFoundError } from '../utils/errors';

/** O que o ator é dentro de um prédio. 'GESTOR' não vem do enum: gestor não é membro. */
export type BuildingStanding = 'GESTOR' | BuildingRole;

/**
 * O ADMIN é a conta de suporte do sistema: passa por qualquer prédio sem
 * precisar de vínculo.
 *
 * `req.user.role` vem do JWT de 15 minutos; sem conferir o banco (SEC-15), um
 * ADMIN rebaixado ou desativado continuaria passando por qualquer prédio de
 * qualquer tenant até o token expirar. A `WeakMap` garante no máximo uma
 * consulta por requisição.
 */
const adminStateCache = new WeakMap<Actor, Promise<boolean>>();

async function isAdmin(user: Actor): Promise<boolean> {
  if (user.kind !== 'USER' || user.role !== 'ADMIN') return false;

  let cached = adminStateCache.get(user);
  if (!cached) {
    cached = (async () => {
      // Sem conta, sem passe: a dúvida nega, nunca concede.
      const account = await userRepository.findById(user.id);
      return Boolean(account && account.role === 'ADMIN' && account.status !== 'DELETED');
    })();
    adminStateCache.set(user, cached);
  }
  return cached;
}

type BuildingRow = Awaited<ReturnType<typeof buildingRepository.findById>>;

/**
 * O prédio já carregado nesta requisição.
 *
 * Mesma ideia da cache de vínculo logo abaixo: a guarda da rota, o
 * `requireBuildingActive`, o `planGate` e o controller perguntavam cada um pelo
 * mesmo prédio, e cada pergunta era uma ida ao banco — com a API longe do banco,
 * a ida é o que mais custa. A chave é o `req.user`, que nasce e morre com a
 * requisição; sem `scope` não há cache, e a consulta vai direto.
 *
 * Só serve a leituras de antes da escrita: quem altera o prédio na mesma
 * requisição e precisa do valor novo lê direto do repositório.
 */
const buildingCache = new WeakMap<object, Map<string, Promise<BuildingRow>>>();

export function loadBuilding(scope: object | undefined, buildingId: string): Promise<BuildingRow> {
  if (!scope) return buildingRepository.findById(buildingId);

  let byId = buildingCache.get(scope);
  if (!byId) {
    byId = new Map();
    buildingCache.set(scope, byId);
  }

  let pending = byId.get(buildingId);
  if (!pending) {
    pending = buildingRepository.findById(buildingId);
    byId.set(buildingId, pending);
  }
  return pending;
}

/**
 * O prédio da rota e o que o ator é nele, no tempo de uma ida só ao banco.
 *
 * As duas consultas não dependem uma da outra, então saem juntas: antes eram
 * duas idas em série em toda rota de prédio. O 404 continua vindo antes do 403 —
 * quem pergunta por um prédio que não existe não fica sabendo de vínculo nenhum.
 */
async function loadBuildingAndStanding(user: Actor, buildingId: string) {
  const [building, standing] = await Promise.all([
    loadBuilding(user, buildingId),
    getBuildingStanding(user, buildingId),
  ]);
  if (!building) throw new NotFoundError('Prédio');
  return standing;
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
  if (await isAdmin(user)) return 'GESTOR';

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
  if (await isAdmin(user)) return true;

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
    const standing = await loadBuildingAndStanding(req.user, req.params[param]);
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
    const standing = await loadBuildingAndStanding(req.user, req.params[param]);
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
    const standing = await loadBuildingAndStanding(req.user, req.params[param]);
    if (standing !== 'GESTOR' && standing !== BuildingRole.MODERADOR) {
      throw new ForbiddenError('Apenas o moderador do prédio pode ver os chamados');
    }

    req.buildingRole = standing;
    next();
  };
}

/**
 * Garante que o ator supervisiona o prédio da rota: o gestor, ou o VIEWER.
 *
 * É a guarda da agenda de vistorias e do painel do supervisor. O VIEWER entra
 * por decisão do proprietário: é quem acompanha o prédio, e distribuir as
 * rondas é acompanhar. O INSPECTOR fica de fora — quem vistoria não se agenda.
 */
export function requireBuildingSupervisor(param = 'id') {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const standing = await loadBuildingAndStanding(req.user, req.params[param]);
    if (standing !== 'GESTOR' && standing !== BuildingRole.VIEWER) {
      throw new ForbiddenError('Apenas o gestor ou o supervisor do prédio pode fazer isso');
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
  if (await isAdmin(user)) return null;

  return user.kind === 'MANAGER'
    ? buildingRepository.getManagedBuildingIds(user.id)
    : buildingRepository.getMemberBuildingIds(user.id);
}
