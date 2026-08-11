import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { isBuildingManager } from '../middlewares/buildingAccess';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { inspectionRepository } from '../repositories/inspection.repository';
import { buildHeatmap } from '../services/inspection.service';
import { ok, created, noContent } from '../utils/response';
import { NotFoundError, ConflictError } from '../utils/errors';
import { AuditAction } from '@prisma/client';
import { normalizeShareKey, isValidShareKeyFormat } from '../utils/shareKey';
import { zonedParts, zonedRange } from '../utils/timezone';

/** Remove a chave de compartilhamento de respostas destinadas a nao-admins. */
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

export const buildingController = {
  // ── CRUD ──────────────────────────────────────────────────────────────────
  async findAll(req: AuthenticatedRequest, res: Response) {
    const buildings = await buildingRepository.findAll();
    ok(res, buildings);
  },

  async myBuildings(req: AuthenticatedRequest, res: Response) {
    const memberships = await buildingRepository.getMemberBuildings(req.user.id);
    const buildings = memberships.map((m: any) => m.building);
    ok(res, buildings);
  },

  /** Prédios que o gestor criou — a tela inicial dele. */
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

  async create(req: AuthenticatedRequest, res: Response) {
    const { name, description } = req.body;
    const building = await buildingRepository.create({ name, description, created_by: req.user.id });
    await auditRepository.log({ user_id: req.user.id, action: AuditAction.CREATE, entity: 'Building', entity_id: building.id });
    created(res, building);
  },

  async update(req: AuthenticatedRequest, res: Response) {
    const building = await buildingRepository.findById(req.params.id);
    if (!building) throw new NotFoundError('Prédio');
    const updated = await buildingRepository.update(req.params.id, req.body);
    await auditRepository.log({ user_id: req.user.id, action: AuditAction.UPDATE, entity: 'Building', entity_id: req.params.id });
    ok(res, updated);
  },

  async remove(req: AuthenticatedRequest, res: Response) {
    const building = await buildingRepository.findById(req.params.id);
    if (!building) throw new NotFoundError('Prédio');
    await buildingRepository.delete(req.params.id);
    await auditRepository.log({ user_id: req.user.id, action: AuditAction.DELETE, entity: 'Building', entity_id: req.params.id });
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
    const building = await buildingRepository.findById(req.params.id);
    if (!building) throw new NotFoundError('Prédio');
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

    // Só quem administra o prédio vê a chave de compartilhamento
    const payloadBuilding = isBuildingManager(req.user, building)
      ? building
      : publicBuilding(building);

    ok(res, { building: payloadBuilding, inspectorCount, viewerCount, totalInspections, heatmap });
  },

  // ── Histórico do prédio ───────────────────────────────────────────────────
  async getHistory(req: AuthenticatedRequest, res: Response) {
    const building = await buildingRepository.findById(req.params.id);
    if (!building) throw new NotFoundError('Prédio');

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
    await buildingRepository.removeMemberSelf(req.params.id, req.params.userId);
    noContent(res);
  },

  /** O gestor define o nível de acesso de quem está vinculado ao prédio. */
  async updateMemberRole(req: AuthenticatedRequest, res: Response) {
    const member = await buildingRepository.findMember(req.params.id, req.params.userId);
    if (!member) throw new NotFoundError('Vínculo');

    const { role } = req.body as { role: 'INSPECTOR' | 'VIEWER' };
    const updated = await buildingRepository.updateMemberRole(
      req.params.id,
      req.params.userId,
      role
    );

    await auditRepository.log({
      user_id: req.user.id,
      action: AuditAction.UPDATE,
      entity: 'BuildingMember',
      entity_id: member.id,
      metadata: { building_id: req.params.id, user_id: req.params.userId, role },
    });

    ok(res, updated);
  },

  async leaveBuilding(req: AuthenticatedRequest, res: Response) {
    const isMember = await buildingRepository.findMember(req.params.id, req.user.id);
    if (!isMember) throw new NotFoundError('Vínculo');
    await buildingRepository.removeMemberSelf(req.params.id, req.user.id);
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

    // A solicitação precisa ser do prédio da rota — caso contrário um admin
    // aprovaria acesso a um prédio só informando o id de outra solicitação.
    const request = await buildingRepository.findAccessRequestById(req.params.requestId);
    if (!request || request.building_id !== req.params.id) throw new NotFoundError('Solicitação');
    if (request.status !== 'PENDING') throw new ConflictError('Solicitação já foi revisada');

    const updated = await buildingRepository.updateAccessRequest(req.params.requestId, status);

    // Entra sempre como visualizador — o gestor promove depois, se quiser.
    if (status === 'APPROVED') {
      await buildingRepository.addMember(req.params.id, updated.user_id);
    }

    ok(res, updated);
  },
};
