import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { inspectionRepository } from '../repositories/inspection.repository';
import { ok, created, noContent } from '../utils/response';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors';
import { AuditAction } from '@prisma/client';

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
    ok(res, { building, floors });
  },

  async createFloor(req: AuthenticatedRequest, res: Response) {
    const building = await buildingRepository.findById(req.params.id);
    if (!building) throw new NotFoundError('Prédio');
    const { label } = req.body;
    const floor = await buildingRepository.createFloor({ building_id: req.params.id, label });
    created(res, floor);
  },

  async deleteFloor(req: AuthenticatedRequest, res: Response) {
    await buildingRepository.deleteFloor(req.params.floorId);
    noContent(res);
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  async getDashboard(req: AuthenticatedRequest, res: Response) {
    const building = await buildingRepository.findById(req.params.id);
    if (!building) throw new NotFoundError('Prédio');

    const [inspectorCount, viewerCount, totalInspections] = await buildingRepository.getDashboard(req.params.id);

    // Calendário: últimos 12 meses
    const now = new Date();
    const dateFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const calData = await inspectionRepository.getCalendarData(dateFrom, dateTo, req.params.id);
    const heatmap: Record<string, { count: number; inspectors: string[] }> = {};
    for (const item of calData) {
      if (!item.finished_at) continue;
      const day = item.finished_at.toISOString().split('T')[0];
      if (!heatmap[day]) heatmap[day] = { count: 0, inspectors: [] };
      heatmap[day].count++;
      if (!heatmap[day].inspectors.includes(item.inspector.name)) {
        heatmap[day].inspectors.push(item.inspector.name);
      }
    }

    ok(res, { building, inspectorCount, viewerCount, totalInspections, heatmap });
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
    await buildingRepository.removeMember(req.params.id, req.params.userId);
    noContent(res);
  },

  async leaveBuilding(req: AuthenticatedRequest, res: Response) {
    const isMember = await buildingRepository.findMember(req.params.id, req.user.id);
    if (!isMember) throw new NotFoundError('Vínculo');
    await buildingRepository.removeMemberSelf(req.params.id, req.user.id);
    noContent(res);
  },

  // ── Solicitações de acesso ────────────────────────────────────────────────
  async requestAccess(req: AuthenticatedRequest, res: Response) {
    const building = await buildingRepository.findById(req.params.id);
    if (!building) throw new NotFoundError('Prédio');

    const existing = await buildingRepository.findAccessRequest(req.params.id, req.user.id);
    if (existing) throw new ConflictError('Solicitação já enviada para este prédio');

    const isMember = await buildingRepository.findMember(req.params.id, req.user.id);
    if (isMember) throw new ConflictError('Você já é membro deste prédio');

    const request = await buildingRepository.createAccessRequest(req.params.id, req.user.id);
    created(res, request);
  },

  async getAccessRequests(req: AuthenticatedRequest, res: Response) {
    const requests = await buildingRepository.getAccessRequests(req.params.id, req.query.status as string);
    ok(res, requests);
  },

  async reviewAccessRequest(req: AuthenticatedRequest, res: Response) {
    const { status } = req.body; // 'APPROVED' | 'REJECTED'
    const updated = await buildingRepository.updateAccessRequest(req.params.requestId, status);

    if (status === 'APPROVED') {
      await buildingRepository.addMember(req.params.id, updated.user_id, updated.user.role);
    }

    ok(res, updated);
  },
};
