import request from 'supertest';

// Os repositórios são trocados por mocks: o alvo aqui é a cadeia de middlewares
// (autenticação, vínculo com o prédio, papel dentro dele), não o acesso ao banco.
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
const FLOOR_ID = '44444444-4444-4444-8444-444444444444';
const REPORT_ID = '99999999-9999-4999-8999-999999999999';

// Toda conta comum nasce e permanece NONE: o que ela pode fazer não está no
// token, está no vínculo com o prédio — que cada teste monta com `findMember`.
const tokenGestor = signAccessToken('user-gestor', 'NONE');
const tokenInspector = signAccessToken('user-inspector', 'NONE');
const tokenViewer = signAccessToken('user-viewer', 'NONE');
const tokenSemVinculo = signAccessToken('user-sem-vinculo', 'NONE');
const tokenAdmin = signAccessToken('user-admin', 'ADMIN');
// Emitido antes desta mudança, quando o papel de prédio viajava dentro do JWT
const tokenLegadoGestor = signAccessToken('user-legado', 'GESTOR');

const building = {
  id: BUILDING_ID,
  name: 'Edifício Principal',
  description: 'Sede',
  share_key: 'ABCD23456789',
  created_by: 'user-gestor',
};

/** Vínculo do usuário logado com o prédio da rota — a fonte de toda autorização. */
function comoMembro(role: 'GESTOR' | 'INSPECTOR' | 'VIEWER') {
  mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role } as any);
}

function semVinculo() {
  mockBuildingRepo.findMember.mockResolvedValue(null);
}

/** Envio de vistoria que passa pelo schema — para testar autorização, não validação. */
function vistoriaValida() {
  return { building_id: BUILDING_ID, floors: [{ floor_id: FLOOR_ID, records: [] }] };
}

beforeEach(() => {
  jest.clearAllMocks();
  (auditRepository.log as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  mockBuildingRepo.findById.mockResolvedValue(building as any);
  mockBuildingRepo.getFloors.mockResolvedValue([{ id: FLOOR_ID, label: '1º Andar' }] as any);
  mockBuildingRepo.countManagers.mockResolvedValue(2);
  semVinculo();
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

  it('token antigo que se diz GESTOR não administra prédio nenhum', async () => {
    // O papel deixou de morar no token. Sem vínculo no banco, o que o JWT
    // afirma não vale nada — nem enquanto os tokens antigos não expiram.
    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}`)
      .set('Authorization', `Bearer ${tokenLegadoGestor}`)
      .send({ name: 'Renomeado por token velho' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.update).not.toHaveBeenCalled();
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

  it('cria a conta sem vínculo quando o payload é válido', async () => {
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

  it('a tela de gestor cria a mesma conta comum', async () => {
    // Gestor deixou de ser marca na conta: quem cria o prédio vira gestor dele.
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.create.mockResolvedValue({
      id: 'gestor-novo',
      name: 'Gestor',
      email: 'gestor@test.com',
      role: 'NONE',
      password_hash: 'x',
    } as any);

    const res = await request(app)
      .post('/users/managers')
      .send({ name: 'Gestor', email: 'gestor@test.com', password: 'Senha@123' });

    expect(res.status).toBe(201);
    expect(mockUserRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'NONE' }));
  });
});

describe('acesso a dados do prédio', () => {
  it('bloqueia dashboard de prédio em que o usuário não é membro', async () => {
    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/dashboard`)
      .set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(403);
  });

  it('bloqueia histórico de prédio em que o usuário não é membro', async () => {
    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/history`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
  });

  it('libera os andares para membro e não devolve a chave de compartilhamento', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/floors`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(200);
    expect(res.body.building).not.toHaveProperty('share_key');
    expect(JSON.stringify(res.body)).not.toContain(building.share_key);
  });

  it('ADMIN acessa sem precisar de vínculo', async () => {
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

describe('criação de prédio', () => {
  it('qualquer conta cria prédio, e quem cria vira o gestor dele', async () => {
    // Não existe mais promoção prévia: a conta sem vínculo nenhum cria o
    // primeiro prédio e sai dele como gestora (ver buildingRepository.create).
    mockBuildingRepo.create.mockResolvedValue(building as any);

    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenSemVinculo}`)
      .send({ name: 'Prédio novo' });

    expect(res.status).toBe(201);
    expect(mockBuildingRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: 'user-sem-vinculo' })
    );
  });
});

describe('gestão do prédio', () => {
  it('o gestor do prédio edita o prédio', async () => {
    comoMembro('GESTOR');
    mockBuildingRepo.update.mockResolvedValue(building as any);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ name: 'Renomeado' });

    expect(res.status).toBe(200);
    expect(mockBuildingRepo.update).toHaveBeenCalled();
  });

  it('inspetor não edita o prédio que vistoria', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}`)
      .set('Authorization', `Bearer ${tokenInspector}`)
      .send({ name: 'Renomeado por inspetor' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.update).not.toHaveBeenCalled();
  });

  it('gestor de outro prédio não administra este', async () => {
    // Ele é gestor em algum lugar, mas não aqui: sem vínculo com este prédio,
    // não há nada a herdar.
    semVinculo();

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ name: 'Renomeado por fora' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.update).not.toHaveBeenCalled();
  });

  it('o gestor vê a chave de compartilhamento do prédio', async () => {
    comoMembro('GESTOR');
    mockBuildingRepo.getDashboard.mockResolvedValue([0, 0, 0] as any);
    mockInspectionRepo.getCalendarData.mockResolvedValue([] as any);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/dashboard`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(200);
    expect(res.body.building.share_key).toBe(building.share_key);
    expect(res.body.role).toBe('GESTOR');
  });

  it('esconde a chave de quem só é membro do prédio', async () => {
    comoMembro('VIEWER');
    mockBuildingRepo.getDashboard.mockResolvedValue([0, 0, 0] as any);
    mockInspectionRepo.getCalendarData.mockResolvedValue([] as any);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/dashboard`)
      .set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(200);
    expect(res.body.building).not.toHaveProperty('share_key');
  });

  it('aprova a solicitação vinculando como visualizador', async () => {
    comoMembro('GESTOR');
    mockBuildingRepo.findAccessRequestById.mockResolvedValue({
      id: 'req-1',
      building_id: BUILDING_ID,
      status: 'PENDING',
    } as any);
    mockBuildingRepo.updateAccessRequest.mockResolvedValue({
      id: 'req-1',
      user_id: 'user-novo',
      user: { id: 'user-novo', name: 'Novo', email: 'novo@test.com' },
    } as any);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/access-requests/req-1`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    // Sem terceiro argumento: o vínculo nasce VIEWER, mesmo que a conta já
    // seja inspetora em outro prédio.
    expect(mockBuildingRepo.addMember).toHaveBeenCalledWith(BUILDING_ID, 'user-novo');
  });

  it('ex-membro solicita acesso de novo ao mesmo prédio', async () => {
    mockBuildingRepo.findByShareKey.mockResolvedValue(building as any);
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

  it('recusa segundo pedido enquanto o gestor não revisa o primeiro', async () => {
    mockBuildingRepo.findByShareKey.mockResolvedValue(building as any);
    mockBuildingRepo.findAccessRequest.mockResolvedValue({ id: 'req-1', status: 'PENDING' } as any);

    const res = await request(app)
      .post('/buildings/access-requests')
      .set('Authorization', `Bearer ${tokenViewer}`)
      .send({ key: building.share_key });

    expect(res.status).toBe(409);
    expect(mockBuildingRepo.createAccessRequest).not.toHaveBeenCalled();
  });
});

describe('papel dentro do prédio', () => {
  it('o gestor promove um membro a inspetor', async () => {
    comoMembro('GESTOR');
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

  it('o gestor promove outro membro a gestor', async () => {
    // É assim que a gestão se divide ou se transfere — sem mexer em quem
    // cadastrou o prédio, que é dado de auditoria.
    comoMembro('GESTOR');
    mockBuildingRepo.updateMemberRole.mockResolvedValue({ id: 'm1', role: 'GESTOR' } as any);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/user-novo`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'GESTOR' });

    expect(res.status).toBe(200);
    expect(mockBuildingRepo.updateMemberRole).toHaveBeenCalledWith(
      BUILDING_ID,
      'user-novo',
      'GESTOR'
    );
  });

  it('recusa rebaixar o único gestor do prédio', async () => {
    comoMembro('GESTOR');
    mockBuildingRepo.countManagers.mockResolvedValue(1);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/user-gestor`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'VIEWER' });

    expect(res.status).toBe(409);
    expect(mockBuildingRepo.updateMemberRole).not.toHaveBeenCalled();
  });

  it('recusa remover o único gestor do prédio', async () => {
    comoMembro('GESTOR');
    mockBuildingRepo.countManagers.mockResolvedValue(1);

    const res = await request(app)
      .delete(`/buildings/${BUILDING_ID}/members/user-gestor`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(409);
    expect(mockBuildingRepo.removeMember).not.toHaveBeenCalled();
  });

  it('recusa o único gestor sair do próprio prédio', async () => {
    comoMembro('GESTOR');
    mockBuildingRepo.countManagers.mockResolvedValue(1);

    const res = await request(app)
      .delete(`/buildings/${BUILDING_ID}/members/me`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(409);
    expect(mockBuildingRepo.removeMember).not.toHaveBeenCalled();
  });

  it('com dois gestores, um deles pode sair', async () => {
    comoMembro('GESTOR');
    mockBuildingRepo.countManagers.mockResolvedValue(2);
    mockBuildingRepo.removeMember.mockResolvedValue({ id: 'm1' } as any);

    const res = await request(app)
      .delete(`/buildings/${BUILDING_ID}/members/me`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(204);
    expect(mockBuildingRepo.removeMember).toHaveBeenCalledWith(BUILDING_ID, 'user-gestor');
  });

  it('recusa promover membro a ADMIN', async () => {
    comoMembro('GESTOR');

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/user-novo`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(mockBuildingRepo.updateMemberRole).not.toHaveBeenCalled();
  });

  it('inspetor não troca o papel de ninguém', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/user-novo`)
      .set('Authorization', `Bearer ${tokenInspector}`)
      .send({ role: 'INSPECTOR' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.updateMemberRole).not.toHaveBeenCalled();
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
      role: 'NONE',
      status: 'ACTIVE',
      password_hash: 'x',
    } as any);
    mockUserRepo.update.mockResolvedValue({
      id: 'user-viewer',
      name: 'Novo nome',
      email: 'v@test.com',
      role: 'NONE',
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

    const res = await request(app)
      .get(`/inspections/${REPORT_ID}`)
      .set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(404);
  });

  it('esconde a URL do Excel de quem não é membro', async () => {
    mockInspectionRepo.findById.mockResolvedValue(report as any);

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

  it('inspetor não descarta uma vistoria', async () => {
    mockInspectionRepo.findById.mockResolvedValue(report as any);
    comoMembro('INSPECTOR');

    const res = await request(app)
      .delete(`/inspections/${REPORT_ID}`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
    expect(mockInspectionRepo.delete).not.toHaveBeenCalled();
  });

  it('gestor de outro prédio não descarta vistoria deste', async () => {
    mockInspectionRepo.findById.mockResolvedValue(report as any);
    semVinculo();

    const res = await request(app)
      .delete(`/inspections/${REPORT_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(403);
    expect(mockInspectionRepo.delete).not.toHaveBeenCalled();
  });
});

describe('conta sem vínculo', () => {
  it('lista os próprios prédios (vazio) e o histórico', async () => {
    mockBuildingRepo.getUserMemberships.mockResolvedValue([] as any);
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
      .send(vistoriaValida());

    expect(res.status).toBe(403);
    expect(mockInspectionRepo.createCompleted).not.toHaveBeenCalled();
  });

  it('quem só visualiza também não envia vistoria', async () => {
    comoMembro('VIEWER');

    const res = await request(app)
      .post('/inspections')
      .set('Authorization', `Bearer ${tokenViewer}`)
      .send(vistoriaValida());

    expect(res.status).toBe(403);
    expect(mockInspectionRepo.createCompleted).not.toHaveBeenCalled();
  });

  it('não vê os dados de um prédio', async () => {
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
