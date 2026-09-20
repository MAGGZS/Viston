import request from 'supertest';

jest.mock('../repositories/building.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/ticket.repository');
jest.mock('../repositories/analytics.repository');
jest.mock('../repositories/emailToken.repository');
jest.mock('../lib/mailer');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');
jest.mock('../repositories/usage.repository');

import app from '../app';
import { buildingRepository } from '../repositories/building.repository';
import { managerRepository } from '../repositories/manager.repository';
import { signAccessToken } from '../utils/jwt';

const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockManagerRepo = managerRepository as jest.Mocked<typeof managerRepository>;

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
const GESTOR_ID = 'm1111111-1111-4111-8111-111111111111';
const USER_ID = 'u1111111-1111-4111-8111-111111111111';

const tokenGestor = signAccessToken(GESTOR_ID, 'NONE', 'MANAGER');
const tokenUser = signAccessToken(USER_ID, 'NONE', 'USER');

const building = {
  id: BUILDING_ID,
  name: 'Edifício Teste',
  description: 'Prédio para testes',
  share_key: 'ABCD23456789',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildingRepo.findById.mockResolvedValue(building as any);
});

describe('Tokens Temporários de Compartilhamento (QR Code / Link)', () => {
  describe('GET /buildings/:id/share-token', () => {
    it('o gestor do prédio obtém o token temporário ativo com validade de 15 minutos', async () => {
      mockManagerRepo.findById.mockResolvedValue({ id: GESTOR_ID, status: 'ACTIVE', token_version: 0 } as any);
      mockBuildingRepo.findManagerLink.mockResolvedValue({ building_id: BUILDING_ID, manager_id: GESTOR_ID } as any);
      mockBuildingRepo.getOrGenerateShareToken.mockResolvedValue({
        token: 'TEST2345',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
        expires_in_seconds: 900,
      });

      const res = await request(app)
        .get(`/buildings/${BUILDING_ID}/share-token`)
        .set('Authorization', `Bearer ${tokenGestor}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        token: 'TEST2345',
        expires_at: expect.any(String),
        expires_in_seconds: 900,
      });
      expect(mockBuildingRepo.getOrGenerateShareToken).toHaveBeenCalledWith(BUILDING_ID);
    });

    it('usuário comum ou gestor de outro prédio não tem acesso ao token', async () => {
      mockBuildingRepo.findManagerLink.mockResolvedValue(null);

      const res = await request(app)
        .get(`/buildings/${BUILDING_ID}/share-token`)
        .set('Authorization', `Bearer ${tokenUser}`);

      expect(res.status).toBe(403);
      expect(mockBuildingRepo.getOrGenerateShareToken).not.toHaveBeenCalled();
    });
  });

  describe('POST /buildings/:id/share-token/rotate', () => {
    it('o gestor força a rotação imediata do token temporário', async () => {
      mockManagerRepo.findById.mockResolvedValue({ id: GESTOR_ID, status: 'ACTIVE', token_version: 0 } as any);
      mockBuildingRepo.findManagerLink.mockResolvedValue({ building_id: BUILDING_ID, manager_id: GESTOR_ID } as any);
      mockBuildingRepo.rotateShareToken.mockResolvedValue({
        token: 'NEWTOKEN',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
        expires_in_seconds: 900,
      });

      const res = await request(app)
        .post(`/buildings/${BUILDING_ID}/share-token/rotate`)
        .set('Authorization', `Bearer ${tokenGestor}`);

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('NEWTOKEN');
      expect(mockBuildingRepo.rotateShareToken).toHaveBeenCalledWith(BUILDING_ID);
    });
  });

  describe('POST /buildings/lookup com token temporário', () => {
    it('retorna os dados públicos do prédio quando o token temporário é válido', async () => {
      mockBuildingRepo.findByShareToken.mockResolvedValue(building as any);

      const res = await request(app)
        .post('/buildings/lookup')
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ key: 'TEST2345' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        name: 'Edifício Teste',
        description: 'Prédio para testes',
      });
      expect(mockBuildingRepo.findByShareToken).toHaveBeenCalledWith('TEST2345');
    });

    it('retorna 404 quando o token não existe ou expirou', async () => {
      mockBuildingRepo.findByShareToken.mockResolvedValue(null);
      mockBuildingRepo.findByShareKey.mockResolvedValue(null);

      const res = await request(app)
        .post('/buildings/lookup')
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ key: 'EXPI2345' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /buildings/access-requests com token temporário', () => {
    it('cria solicitação de acesso usando o token temporário', async () => {
      mockBuildingRepo.findByShareToken.mockResolvedValue(building as any);
      mockBuildingRepo.findMember.mockResolvedValue(null);
      mockBuildingRepo.findAccessRequest.mockResolvedValue(null);
      mockBuildingRepo.createAccessRequest.mockResolvedValue({
        id: 'req-1',
        building_id: BUILDING_ID,
        user_id: USER_ID,
        status: 'PENDING',
      } as any);

      const res = await request(app)
        .post('/buildings/access-requests')
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ key: 'TEST2345' });

      expect(res.status).toBe(201);
      expect(mockBuildingRepo.createAccessRequest).toHaveBeenCalledWith(BUILDING_ID, USER_ID);
    });
  });
});
