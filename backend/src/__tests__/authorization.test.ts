import request from 'supertest';

// Os repositórios são trocados por mocks: o alvo aqui é a cadeia de middlewares
// (autenticação, papel, vínculo com o prédio), não o acesso ao banco.
jest.mock('../repositories/building.repository');
jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/user.repository');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');

import app from '../app';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { inspectionRepository } from '../repositories/inspection.repository';
import { userRepository } from '../repositories/user.repository';
import { signAccessToken } from '../utils/jwt';

const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockInspectionRepo = inspectionRepository as jest.Mocked<typeof inspectionRepository>;
const mockUserRepo = userRepository as jest.Mocked<typeof userRepository>;

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
const REPORT_ID = '99999999-9999-4999-8999-999999999999';

const tokenViewer = signAccessToken('user-viewer', 'VIEWER');
const tokenInspector = signAccessToken('user-inspector', 'INSPECTOR');
const tokenAdmin = signAccessToken('user-admin', 'ADMIN');

const building = {
  id: BUILDING_ID,
  name: 'Edifício Principal',
  description: 'Sede',
  share_key: 'ABCD23456789',
  created_by: 'user-admin',
};

beforeEach(() => {
  jest.clearAllMocks();
  (auditRepository.log as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  mockBuildingRepo.findById.mockResolvedValue(building as any);
  mockBuildingRepo.getFloors.mockResolvedValue([{ id: 'f1', label: '1º Andar' }] as any);
});

describe('autenticação', () => {
  it('recusa requisição sem token', async () => {
    const res = await request(app).get('/inspections');
    expect(res.status).toBe(401);
  });

  it('recusa token malformado', async () => {
    const res = await request(app).get('/inspections').set('Authorization', 'Bearer nao-e-um-jwt');
    expect(res.status).toBe(401);
  });
});

describe('cadastro público', () => {
  it('recusa payload que tenta escolher o papel', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'Invasor', email: 'invasor@test.com', password: 'Senha@123', role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(mockUserRepo.create).not.toHaveBeenCalled();
  });

  it('cria a conta como VIEWER quando o payload é válido', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.create.mockResolvedValue({
      id: 'novo',
      name: 'Novo',
      email: 'novo@test.com',
      role: 'VIEWER',
      password_hash: 'x',
    } as any);

    const res = await request(app)
      .post('/users')
      .send({ name: 'Novo', email: 'novo@test.com', password: 'Senha@123' });

    expect(res.status).toBe(201);
    expect(mockUserRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'VIEWER' }));
    expect(res.body).not.toHaveProperty('password_hash');
  });
});

describe('acesso a dados do prédio', () => {
  it('bloqueia dashboard de prédio em que o usuário não é membro', async () => {
    mockBuildingRepo.findMember.mockResolvedValue(null);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/dashboard`)
      .set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(403);
  });

  it('bloqueia histórico de prédio em que o usuário não é membro', async () => {
    mockBuildingRepo.findMember.mockResolvedValue(null);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/history`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
  });

  it('libera os andares para membro e não devolve a chave de compartilhamento', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1' } as any);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/floors`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(200);
    expect(res.body.building).not.toHaveProperty('share_key');
    expect(JSON.stringify(res.body)).not.toContain(building.share_key);
  });

  it('ADMIN acessa sem precisar de vínculo', async () => {
    mockBuildingRepo.findMember.mockResolvedValue(null);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/floors`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(mockBuildingRepo.findMember).not.toHaveBeenCalled();
  });

  it('só ADMIN lista todos os prédios', async () => {
    const res = await request(app).get('/buildings').set('Authorization', `Bearer ${tokenViewer}`);
    expect(res.status).toBe(403);
  });
});

describe('acesso a relatórios', () => {
  const report = {
    id: REPORT_ID,
    building_id: BUILDING_ID,
    status: 'COMPLETED',
    excel_url: 'https://storage.example.com/report.xlsx',
  };

  it('esconde relatório de prédio em que o usuário não é membro', async () => {
    mockInspectionRepo.findById.mockResolvedValue(report as any);
    mockBuildingRepo.findMember.mockResolvedValue(null);

    const res = await request(app)
      .get(`/inspections/${REPORT_ID}`)
      .set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(404);
  });

  it('esconde a URL do Excel de quem não é membro', async () => {
    mockInspectionRepo.findById.mockResolvedValue(report as any);
    mockBuildingRepo.findMember.mockResolvedValue(null);

    const res = await request(app)
      .get(`/inspections/${REPORT_ID}/excel`)
      .set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(404);
    expect(res.text).not.toContain('report.xlsx');
  });

  it('restringe a listagem aos prédios do usuário', async () => {
    mockBuildingRepo.getMemberBuildingIds.mockResolvedValue([BUILDING_ID]);
    mockInspectionRepo.findAll.mockResolvedValue([[], 0]);

    const res = await request(app).get('/inspections').set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(200);
    expect(mockInspectionRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ building_ids: [BUILDING_ID] })
    );
  });

  it('não restringe a listagem para ADMIN', async () => {
    mockInspectionRepo.findAll.mockResolvedValue([[], 0]);

    await request(app).get('/inspections').set('Authorization', `Bearer ${tokenAdmin}`);

    expect(mockInspectionRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ building_ids: null })
    );
  });

  it('só ADMIN descarta uma vistoria', async () => {
    const res = await request(app)
      .delete(`/inspections/${REPORT_ID}`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
  });
});

describe('cabeçalhos de segurança', () => {
  it('não expõe o servidor e envia os cabeçalhos do helmet', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers).not.toHaveProperty('x-powered-by');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });
});
