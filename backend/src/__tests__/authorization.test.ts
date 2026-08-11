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
const tokenGestor = signAccessToken('user-gestor', 'GESTOR');
const tokenOutroGestor = signAccessToken('outro-gestor', 'GESTOR');
// Conta recém-criada: ainda sem vínculo, e por isso sem nível de acesso
const tokenSemVinculo = signAccessToken('user-sem-vinculo', 'NONE');

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

  it('cria a conta sem nível de acesso quando o payload é válido', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.create.mockResolvedValue({
      id: 'novo',
      name: 'Novo',
      email: 'novo@test.com',
      role: 'NONE',
      password_hash: 'x',
    } as any);

    const res = await request(app)
      .post('/users')
      .send({ name: 'Novo', email: 'novo@test.com', password: 'Senha@123' });

    expect(res.status).toBe(201);
    expect(mockUserRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'NONE' }));
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

describe('gestão do prédio', () => {
  // O prédio do fixture é do gestor; quem não é dono dele não administra nada.
  const doGestor = { ...building, created_by: 'user-gestor' };

  beforeEach(() => {
    mockBuildingRepo.findById.mockResolvedValue(doGestor as any);
  });

  it('VIEWER não cria prédio', async () => {
    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenViewer}`)
      .send({ name: 'Prédio novo' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.create).not.toHaveBeenCalled();
  });

  it('GESTOR cria prédio em nome próprio', async () => {
    mockBuildingRepo.create.mockResolvedValue(doGestor as any);

    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ name: 'Prédio novo' });

    expect(res.status).toBe(201);
    expect(mockBuildingRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: 'user-gestor' })
    );
  });

  it('GESTOR não administra prédio de outro gestor', async () => {
    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}`)
      .set('Authorization', `Bearer ${tokenOutroGestor}`)
      .send({ name: 'Renomeado por fora' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.update).not.toHaveBeenCalled();
  });

  it('GESTOR vê a chave de compartilhamento do próprio prédio', async () => {
    mockBuildingRepo.getDashboard.mockResolvedValue([0, 0, 0] as any);
    mockInspectionRepo.getCalendarData.mockResolvedValue([] as any);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/dashboard`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(200);
    expect(res.body.building.share_key).toBe(building.share_key);
  });

  it('esconde a chave do gestor de outro prédio que seja membro', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1' } as any);
    mockBuildingRepo.getDashboard.mockResolvedValue([0, 0, 0] as any);
    mockInspectionRepo.getCalendarData.mockResolvedValue([] as any);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/dashboard`)
      .set('Authorization', `Bearer ${tokenOutroGestor}`);

    expect(res.status).toBe(200);
    expect(res.body.building).not.toHaveProperty('share_key');
  });

  it('aprova a solicitação vinculando como visualizador', async () => {
    mockBuildingRepo.findAccessRequestById.mockResolvedValue({
      id: 'req-1',
      building_id: BUILDING_ID,
      status: 'PENDING',
    } as any);
    mockBuildingRepo.updateAccessRequest.mockResolvedValue({
      id: 'req-1',
      user_id: 'user-novo',
      user: { id: 'user-novo', name: 'Novo', email: 'novo@test.com', role: 'INSPECTOR' },
    } as any);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/access-requests/req-1`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    // Sem terceiro argumento: o vínculo nasce VIEWER, mesmo que a conta já
    // fosse INSPECTOR em outro prédio.
    expect(mockBuildingRepo.addMember).toHaveBeenCalledWith(BUILDING_ID, 'user-novo');
  });

  it('ex-membro solicita acesso de novo ao mesmo prédio', async () => {
    mockBuildingRepo.findByShareKey.mockResolvedValue(building as any);
    mockBuildingRepo.findMember.mockResolvedValue(null);
    // Sobrou do vínculo anterior: aprovada, mas o usuário já saiu do prédio.
    mockBuildingRepo.findAccessRequest.mockResolvedValue({ id: 'req-1', status: 'APPROVED' } as any);
    mockBuildingRepo.createAccessRequest.mockResolvedValue({ id: 'req-1', status: 'PENDING' } as any);

    const res = await request(app)
      .post('/buildings/access-requests')
      .set('Authorization', `Bearer ${tokenViewer}`)
      .send({ key: building.share_key });

    expect(res.status).toBe(201);
    expect(mockBuildingRepo.createAccessRequest).toHaveBeenCalledWith(BUILDING_ID, 'user-viewer');
  });

  it('solicitação recusada não trava um novo pedido', async () => {
    mockBuildingRepo.findByShareKey.mockResolvedValue(building as any);
    mockBuildingRepo.findMember.mockResolvedValue(null);
    mockBuildingRepo.findAccessRequest.mockResolvedValue({ id: 'req-1', status: 'REJECTED' } as any);
    mockBuildingRepo.createAccessRequest.mockResolvedValue({ id: 'req-1', status: 'PENDING' } as any);

    const res = await request(app)
      .post('/buildings/access-requests')
      .set('Authorization', `Bearer ${tokenViewer}`)
      .send({ key: building.share_key });

    expect(res.status).toBe(201);
    expect(mockBuildingRepo.createAccessRequest).toHaveBeenCalled();
  });

  it('recusa segundo pedido enquanto o gestor não revisa o primeiro', async () => {
    mockBuildingRepo.findByShareKey.mockResolvedValue(building as any);
    mockBuildingRepo.findMember.mockResolvedValue(null);
    mockBuildingRepo.findAccessRequest.mockResolvedValue({ id: 'req-1', status: 'PENDING' } as any);

    const res = await request(app)
      .post('/buildings/access-requests')
      .set('Authorization', `Bearer ${tokenViewer}`)
      .send({ key: building.share_key });

    expect(res.status).toBe(409);
    expect(mockBuildingRepo.createAccessRequest).not.toHaveBeenCalled();
  });

  it('GESTOR troca o nível de acesso do membro', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1' } as any);
    mockBuildingRepo.updateMemberRole.mockResolvedValue({ id: 'm1', role: 'INSPECTOR' } as any);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/user-novo`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'INSPECTOR' });

    expect(res.status).toBe(200);
    expect(mockBuildingRepo.updateMemberRole).toHaveBeenCalledWith(
      BUILDING_ID,
      'user-novo',
      'INSPECTOR'
    );
  });

  it('recusa promover membro a ADMIN', async () => {
    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/user-novo`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(mockBuildingRepo.updateMemberRole).not.toHaveBeenCalled();
  });

  it('INSPECTOR não troca o nível de acesso de ninguém', async () => {
    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/user-novo`)
      .set('Authorization', `Bearer ${tokenInspector}`)
      .send({ role: 'INSPECTOR' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.updateMemberRole).not.toHaveBeenCalled();
  });
});

describe('cadastro de gestor', () => {
  it('cria a conta como GESTOR pela rota própria', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.create.mockResolvedValue({
      id: 'gestor-novo',
      name: 'Gestor',
      email: 'gestor@test.com',
      role: 'GESTOR',
      password_hash: 'x',
    } as any);

    const res = await request(app)
      .post('/users/managers')
      .send({ name: 'Gestor', email: 'gestor@test.com', password: 'Senha@123' });

    expect(res.status).toBe(201);
    expect(mockUserRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'GESTOR' }));
  });
});

describe('edição de usuários pelo admin', () => {
  it('recusa alteração de papel', async () => {
    const res = await request(app)
      .patch('/users/user-viewer')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('aceita alteração de nome e status', async () => {
    mockUserRepo.findById.mockResolvedValue({
      id: 'user-viewer',
      name: 'Antigo',
      email: 'v@test.com',
      role: 'VIEWER',
      status: 'ACTIVE',
      password_hash: 'x',
    } as any);
    mockUserRepo.update.mockResolvedValue({
      id: 'user-viewer',
      name: 'Novo nome',
      email: 'v@test.com',
      role: 'VIEWER',
      status: 'ACTIVE',
      password_hash: 'x',
    } as any);

    const res = await request(app)
      .patch('/users/user-viewer')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ name: 'Novo nome' });

    expect(res.status).toBe(200);
    expect(mockUserRepo.update).toHaveBeenCalledWith('user-viewer', { name: 'Novo nome' });
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

  it('INSPECTOR não descarta uma vistoria', async () => {
    const res = await request(app)
      .delete(`/inspections/${REPORT_ID}`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
  });

  it('GESTOR não descarta vistoria de prédio de outro gestor', async () => {
    mockInspectionRepo.findById.mockResolvedValue(report as any);
    mockBuildingRepo.findById.mockResolvedValue({ ...building, created_by: 'user-gestor' } as any);

    const res = await request(app)
      .delete(`/inspections/${REPORT_ID}`)
      .set('Authorization', `Bearer ${tokenOutroGestor}`);

    expect(res.status).toBe(403);
    expect(mockInspectionRepo.delete).not.toHaveBeenCalled();
  });
});

describe('conta sem nível de acesso', () => {
  it('lista os próprios prédios (vazio) e o histórico', async () => {
    mockBuildingRepo.getMemberBuildings.mockResolvedValue([] as any);
    mockBuildingRepo.getMemberBuildingIds.mockResolvedValue([]);
    mockInspectionRepo.findAll.mockResolvedValue([[], 0]);

    const buildings = await request(app)
      .get('/buildings/me')
      .set('Authorization', `Bearer ${tokenSemVinculo}`);
    const inspections = await request(app)
      .get('/inspections')
      .set('Authorization', `Bearer ${tokenSemVinculo}`);

    expect(buildings.status).toBe(200);
    expect(inspections.status).toBe(200);
    expect(mockInspectionRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ building_ids: [] })
    );
  });

  it('pede vínculo pela chave do prédio', async () => {
    mockBuildingRepo.findByShareKey.mockResolvedValue(building as any);
    mockBuildingRepo.findMember.mockResolvedValue(null);
    mockBuildingRepo.findAccessRequest.mockResolvedValue(null);
    mockBuildingRepo.createAccessRequest.mockResolvedValue({ id: 'req-1', status: 'PENDING' } as any);

    const res = await request(app)
      .post('/buildings/access-requests')
      .set('Authorization', `Bearer ${tokenSemVinculo}`)
      .send({ key: building.share_key });

    expect(res.status).toBe(201);
    expect(mockBuildingRepo.createAccessRequest).toHaveBeenCalledWith(BUILDING_ID, 'user-sem-vinculo');
  });

  it('não envia vistoria', async () => {
    const res = await request(app)
      .post('/inspections')
      .set('Authorization', `Bearer ${tokenSemVinculo}`)
      .send({ building_id: BUILDING_ID, entries: [] });

    expect(res.status).toBe(403);
    expect(mockInspectionRepo.createCompleted).not.toHaveBeenCalled();
  });

  it('não vê os dados de um prédio', async () => {
    mockBuildingRepo.findMember.mockResolvedValue(null);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/dashboard`)
      .set('Authorization', `Bearer ${tokenSemVinculo}`);

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
