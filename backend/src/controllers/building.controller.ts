import { Response } from 'express';
import { AuditAction, BuildingRole } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { inspectionRepository } from '../repositories/inspection.repository';
import { buildHeatmap } from '../services/inspection.service';
import { ok, created, noContent } from '../utils/response';
import { NotFoundError, ConflictError } from '../utils/errors';
import { normalizeShareKey, isValidShareKeyFormat } from '../utils/shareKey';
import { zonedParts, zonedRange } from '../utils/timezone';

/** Remove a chave de compartilhamento de respostas destinadas a quem nao e gestor. */
function publicBuilding(building: { id: string; name: string; description: string | null }) {
  return { id: building.id, name: building.name, description: building.description };
}

/** Resolve o predio a partir da chave informada pelo usuário. */
async function findBuildingByKeyOrFail(rawKey: unknown) {
  const key = normalizeShareKey(String(rawKey ?? ''));
  if (!isValidShareKeyFormat(key)) throw new NotFoundError('Prédio');

  const building = await buildingRepository.findByShareKey(key);
  if (!building) throw new NotFoundError('Prédio');

  return building;
}

/**
 * Recusa a mudança que deixaria o prédio sem gestor nenhum.
 *
 * Vale para rebaixar, remover e sair: prédio sem gestor não tem quem aprove
 * solicitação, promova inspetor ou cadastre andar. Para transferir a gestão,
 * promova o outro primeiro — dois gestores é um estado válido.
 *
 * Recebe o vínculo já carregado: quem chama acabou de lê-lo para saber se ele
 * existe.
 */
async function assertNotLastManager(
  member: { building_id: string; role: BuildingRole },
  action: string
) {
  if (member.role !== BuildingRole.GESTOR) return;

  const managers = await buildingRepository.countManagers(member.building_id);
  if (managers <= 1) {
    throw new ConflictError(
      `Este é o único gestor do prédio. Promova outro colaborador a gestor antes de ${action}.`
    );
  }
}

export const buildingController = {
  // ── CRUD ──────────────────────────────────────────────────────────────────
  async findAll(req: AuthenticatedRequest, res: Response) {
    const buildings = await buildingRepository.findAll();
    ok(res, buildings);
  },

  /** Os prédios do usuário, cada um com o papel dele ali dentro. */
  async myBuildings(req: AuthenticatedRequest, res: Response) {
    ok(res, await buildingRepository.getUserMemberships(req.user.id));
  },

  /** Prédios que o usuário administra — a tela inicial do gestor. */
  async managedBuildings(req: AuthenticatedRequest, res: Response) {
    const buildings = await buildingRepository.findAll(
      req.user.role === 'ADMIN' ? undefined : req.user.id
    );
    ok(res, buildings);
  },

  /** Números do sistema inteiro — painel do ADMIN. */
  async getStats(req: AuthenticatedRequest, res: Response) {
    ok(res, await buildingRepository.getSystemStats());
  },

  /** Quem cria o prédio vira o gestor dele (ver buildingRepository.create). */
  async create(req: AuthenticatedRequest, res: Response) {
    const { name, description } = req.body;
    const building = await buildingRepository.create({ name, description, created_by: req.user.id });
    await auditRepository.log({
      user_id: req.user.id,
      building_id: building.id,
      action: AuditAction.CREATE,
      entity: 'Building',
      entity_id: building.id,
    });
    created(res, building);
  },

  async update(req: AuthenticatedRequest, res: Response) {
    const updated = await buildingRepository.update(req.params.id, req.body);
    await auditRepository.log({
      user_id: req.user.id,
      building_id: req.params.id,
      action: AuditAction.UPDATE,
      entity: 'Building',
      entity_id: req.params.id,
    });
    ok(res, updated);
  },

  async remove(req: AuthenticatedRequest, res: Response) {
    await buildingRepository.delete(req.params.id);
    // Sem building_id: o prédio deixou de existir, e a FK levaria o registro
    // junto. O id fica em entity_id, que é texto solto.
    await auditRepository.log({
      user_id: req.user.id,
      action: AuditAction.DELETE,
      entity: 'Building',
      entity_id: req.params.id,
    });
    noContent(res);
  },

  // ── Andares ───────────────────────────────────────────────────────────────
  async getFloors(req: AuthenticatedRequest, res: Response) {
    const building = await buildingRepository.findById(req.params.id);
    if (!building) throw new NotFoundError('Prédio');
    const floors = await buildingRepository.getFloors(req.params.id);
    ok(res, { building: publicBuilding(building), floors });
  },

  async createFloor(req: AuthenticatedRequest, res: Response) {
    const { label } = req.body;
    const floor = await buildingRepository.createFloor({ building_id: req.params.id, label });
    created(res, floor);
  },

  async deleteFloor(req: AuthenticatedRequest, res: Response) {
    // O andar precisa ser do prédio da rota — sem isso o id na URL vira só enfeite
    const [floor] = await buildingRepository.findFloorsByIds([req.params.floorId]);
    if (!floor || floor.building_id !== req.params.id) throw new NotFoundError('Andar');

    await buildingRepository.deleteFloor(req.params.floorId);
    noContent(res);
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  async getDashboard(req: AuthenticatedRequest, res: Response) {
    const building = await buildingRepository.findById(req.params.id);
    if (!building) throw new NotFoundError('Prédio');

    const [inspectorCount, viewerCount, totalInspections] = await buildingRepository.getDashboard(req.params.id);

    // Calendário: últimos 12 meses, fechando pelo calendário local (ver utils/timezone)
    const today = zonedParts();
    const { start, end } = zonedRange(today.year, today.monthIndex - 11, 12);

    const calData = await inspectionRepository.getCalendarData(start, end, req.params.id);
    const heatmap = buildHeatmap(calData);

    // Só o gestor vê a chave de compartilhamento. `buildingRole` veio do
    // middleware de vínculo, então não custa consulta nenhuma aqui.
    const payloadBuilding =
      req.buildingRole === BuildingRole.GESTOR ? building : publicBuilding(building);

    ok(res, {
      building: payloadBuilding,
      role: req.buildingRole ?? null,
      inspectorCount,
      viewerCount,
      totalInspections,
      heatmap,
    });
  },

  // ── Histórico do prédio ───────────────────────────────────────────────────
  async getHistory(req: AuthenticatedRequest, res: Response) {
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    const [inspections, total] = await inspectionRepository.findAll({
      page, limit, building_id: req.params.id,
    });

    ok(res, { inspections, total, page, limit, pages: Math.ceil(total / limit) });
  },

  // ── Membros ───────────────────────────────────────────────────────────────
  async getMembers(req: AuthenticatedRequest, res: Response) {
    const members = await buildingRepository.getMembers(req.params.id);
    ok(res, members);
  },

  async removeMember(req: AuthenticatedRequest, res: Response) {
    const member = await buildingRepository.findMember(req.params.id, req.params.userId);
    if (!member) throw new NotFoundError('Vínculo');

    await assertNotLastManager(member, 'remover este');
    await buildingRepository.removeMember(req.params.id, req.params.userId);

    await auditRepository.log({
      user_id: req.user.id,
      building_id: req.params.id,
      action: AuditAction.DELETE,
      entity: 'BuildingMember',
      entity_id: member.id,
      metadata: { user_id: req.params.userId },
    });

    noContent(res);
  },

  /** O gestor define o papel de quem está vinculado ao prédio. */
  async updateMemberRole(req: AuthenticatedRequest, res: Response) {
    const member = await buildingRepository.findMember(req.params.id, req.params.userId);
    if (!member) throw new NotFoundError('Vínculo');

    const { role } = req.body as { role: BuildingRole };

    // Rebaixar o único gestor deixaria o prédio sem dono — inclusive quando o
    // gestor rebaixa a si mesmo por engano.
    if (role !== BuildingRole.GESTOR) {
      await assertNotLastManager(member, 'rebaixar este');
    }

    const updated = await buildingRepository.updateMemberRole(
      req.params.id,
      req.params.userId,
      role
    );

    await auditRepository.log({
      user_id: req.user.id,
      building_id: req.params.id,
      action: AuditAction.UPDATE,
      entity: 'BuildingMember',
      entity_id: member.id,
      metadata: { user_id: req.params.userId, role },
    });

    ok(res, updated);
  },

  async leaveBuilding(req: AuthenticatedRequest, res: Response) {
    const member = await buildingRepository.findMember(req.params.id, req.user.id);
    if (!member) throw new NotFoundError('Vínculo');

    await assertNotLastManager(member, 'sair do prédio');
    await buildingRepository.removeMember(req.params.id, req.user.id);
    noContent(res);
  },

  // ── Vínculo por chave de compartilhamento ─────────────────────────────────
  /** Consulta prévia: mostra o nome do prédio dono da chave, sem expor o id. */
  async lookupByKey(req: AuthenticatedRequest, res: Response) {
    const building = await findBuildingByKeyOrFail(req.query.key);
    ok(res, { name: building.name, description: building.description });
  },

  // ── Solicitações de acesso ────────────────────────────────────────────────
  async requestAccess(req: AuthenticatedRequest, res: Response) {
    const building = await findBuildingByKeyOrFail(req.body?.key);

    const isMember = await buildingRepository.findMember(building.id, req.user.id);
    if (isMember) throw new ConflictError('Você já é membro deste prédio');

    // Só um pedido em aberto barra outro: solicitação já resolvida (recusada, ou
    // aprovada de um vínculo desfeito depois) não pode travar o prédio para sempre.
    const existing = await buildingRepository.findAccessRequest(building.id, req.user.id);
    if (existing?.status === 'PENDING') {
      throw new ConflictError('Solicitação já enviada para este prédio');
    }

    const request = await buildingRepository.createAccessRequest(building.id, req.user.id);
    created(res, request);
  },

  async getAccessRequests(req: AuthenticatedRequest, res: Response) {
    const requests = await buildingRepository.getAccessRequests(req.params.id, req.query.status as string);
    ok(res, requests);
  },

  async reviewAccessRequest(req: AuthenticatedRequest, res: Response) {
    const { status } = req.body as { status: 'APPROVED' | 'REJECTED' };

    // A solicitação precisa ser do prédio da rota — caso contrário aprovaria-se
    // acesso a um prédio só informando o id de outra solicitação.
    const request = await buildingRepository.findAccessRequestById(req.params.requestId);
    if (!request || request.building_id !== req.params.id) throw new NotFoundError('Solicitação');
    if (request.status !== 'PENDING') throw new ConflictError('Solicitação já foi revisada');

    const updated = await buildingRepository.updateAccessRequest(req.params.requestId, status);

    // Entra sempre como visualizador — o gestor promove depois, se quiser.
    if (status === 'APPROVED') {
      await buildingRepository.addMember(req.params.id, updated.user_id);
      await auditRepository.log({
        user_id: req.user.id,
        building_id: req.params.id,
        action: AuditAction.CREATE,
        entity: 'BuildingMember',
        metadata: { user_id: updated.user_id, role: BuildingRole.VIEWER },
      });
    }

    ok(res, updated);
  },
};
