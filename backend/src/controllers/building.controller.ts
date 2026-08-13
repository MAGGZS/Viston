import { Response } from 'express';
import { AuditAction, BuildingRole } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { actorAudit, buildingRepository, auditRepository } from '../repositories/building.repository';
import { managerRepository } from '../repositories/manager.repository';
import { inspectionRepository } from '../repositories/inspection.repository';
import { buildHeatmap } from '../services/inspection.service';
import { ok, created, noContent } from '../utils/response';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
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
 * Recusa a saída que deixaria o prédio sem gestor nenhum.
 *
 * Prédio sem gestor não tem quem aprove solicitação, promova inspetor ou
 * cadastre andar — sobra o ADMIN, que é suporte e não dono. Para transferir a
 * gestão, adicione o outro gestor primeiro: dois é um estado válido.
 */
async function assertNotLastManager(buildingId: string, action: string) {
  const managers = await buildingRepository.countManagers(buildingId);
  if (managers <= 1) {
    throw new ConflictError(
      `Este é o único gestor do prédio. Adicione outro gestor antes de ${action}.`
    );
  }
}

export const buildingController = {
  // ── CRUD ──────────────────────────────────────────────────────────────────
  async findAll(req: AuthenticatedRequest, res: Response) {
    const buildings = await buildingRepository.findAll();
    ok(res, buildings);
  },

  /**
   * Os prédios da conta, no mesmo formato para os dois tipos: o gestor recebe os
   * que administra com papel GESTOR, o usuário recebe os vínculos dele.
   */
  async myBuildings(req: AuthenticatedRequest, res: Response) {
    if (req.user.kind === 'MANAGER') {
      const buildings = await buildingRepository.findAll(req.user.id);
      ok(res, buildings.map((b) => ({
        building_id: b.id,
        name: b.name,
        description: b.description,
        role: 'GESTOR',
      })));
      return;
    }

    ok(res, await buildingRepository.getUserMemberships(req.user.id));
  },

  /** Prédios que a conta administra — a tela inicial do gestor. */
  async managedBuildings(req: AuthenticatedRequest, res: Response) {
    // Usuário comum não administra nada: a lista dele é vazia, e não um erro —
    // a tela existe para os dois e só mostra o que houver.
    if (req.user.kind === 'USER' && req.user.role !== 'ADMIN') {
      ok(res, []);
      return;
    }

    const buildings = await buildingRepository.findAll(
      req.user.role === 'ADMIN' ? undefined : req.user.id
    );
    ok(res, buildings);
  },

  /** Números do sistema inteiro — painel do ADMIN. */
  async getStats(req: AuthenticatedRequest, res: Response) {
    ok(res, await buildingRepository.getSystemStats());
  },

  /**
   * Quem cria o prédio vira o gestor dele (ver buildingRepository.create).
   *
   * Só conta de gestor: `building_managers.manager_id` aponta para `managers`, e
   * nem o usuário comum nem o ADMIN estão lá. É o que garante que todo prédio
   * nasce com um gestor de verdade.
   */
  async create(req: AuthenticatedRequest, res: Response) {
    if (req.user.kind !== 'MANAGER') {
      throw new ForbiddenError('Só uma conta de gestor pode cadastrar prédio');
    }

    const { name, description } = req.body;
    const building = await buildingRepository.create({ name, description, created_by: req.user.id });
    await auditRepository.log({
      ...actorAudit(req.user),
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
      ...actorAudit(req.user),
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
      ...actorAudit(req.user),
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
      req.buildingRole === 'GESTOR' ? building : publicBuilding(building);

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
  /**
   * Quem está no prédio, nas duas naturezas: gestores (contas próprias) e
   * membros (usuários com papel). Vêm juntos porque a tela é uma só.
   */
  async getMembers(req: AuthenticatedRequest, res: Response) {
    const [managers, members] = await Promise.all([
      buildingRepository.getManagers(req.params.id),
      buildingRepository.getMembers(req.params.id),
    ]);
    ok(res, { managers, members });
  },

  /**
   * Adiciona outro gestor ao prédio, pelo e-mail da conta de gestor dele.
   *
   * É por aqui que a gestão se divide e se transfere: quem quer sair adiciona o
   * substituto e depois se remove. Sem isto o único gestor ficaria preso, porque
   * a saída do último é recusada.
   */
  async addManager(req: AuthenticatedRequest, res: Response) {
    const email = String(req.body?.email ?? '').trim();
    const manager = await managerRepository.findByEmail(email);
    if (!manager || manager.status === 'DELETED') {
      throw new NotFoundError('Conta de gestor com este e-mail');
    }

    const existing = await buildingRepository.findManagerLink(req.params.id, manager.id);
    if (existing) throw new ConflictError('Esta pessoa já é gestora deste prédio');

    const link = await buildingRepository.addManager(req.params.id, manager.id);

    await auditRepository.log({
      ...actorAudit(req.user),
      building_id: req.params.id,
      action: AuditAction.CREATE,
      entity: 'BuildingManager',
      entity_id: link.id,
      metadata: { manager_id: manager.id },
    });

    created(res, link);
  },

  /** Tira um gestor do prédio — inclusive ele mesmo, se houver outro. */
  async removeManager(req: AuthenticatedRequest, res: Response) {
    const link = await buildingRepository.findManagerLink(req.params.id, req.params.managerId);
    if (!link) throw new NotFoundError('Gestor deste prédio');

    await assertNotLastManager(req.params.id, 'sair da gestão');
    await buildingRepository.removeManager(req.params.id, req.params.managerId);

    await auditRepository.log({
      ...actorAudit(req.user),
      building_id: req.params.id,
      action: AuditAction.DELETE,
      entity: 'BuildingManager',
      entity_id: link.id,
      metadata: { manager_id: req.params.managerId },
    });

    noContent(res);
  },

  async removeMember(req: AuthenticatedRequest, res: Response) {
    const member = await buildingRepository.findMember(req.params.id, req.params.userId);
    if (!member) throw new NotFoundError('Vínculo');

    await buildingRepository.removeMember(req.params.id, req.params.userId);

    await auditRepository.log({
      ...actorAudit(req.user),
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

    // Só INSPECTOR ou VIEWER: promover a gestor não passa por aqui, porque
    // gestor é outro tipo de conta (ver POST /buildings/:id/managers).
    const { role } = req.body as { role: BuildingRole };

    const updated = await buildingRepository.updateMemberRole(
      req.params.id,
      req.params.userId,
      role
    );

    await auditRepository.log({
      ...actorAudit(req.user),
      building_id: req.params.id,
      action: AuditAction.UPDATE,
      entity: 'BuildingMember',
      entity_id: member.id,
      metadata: { user_id: req.params.userId, role },
    });

    ok(res, updated);
  },

  /** Sair do prédio. É caminho de usuário: gestor sai por DELETE /managers/:id. */
  async leaveBuilding(req: AuthenticatedRequest, res: Response) {
    const member = await buildingRepository.findMember(req.params.id, req.user.id);
    if (!member) throw new NotFoundError('Vínculo');

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
        ...actorAudit(req.user),
        building_id: req.params.id,
        action: AuditAction.CREATE,
        entity: 'BuildingMember',
        metadata: { user_id: updated.user_id, role: BuildingRole.VIEWER },
      });
    }

    ok(res, updated);
  },
};
