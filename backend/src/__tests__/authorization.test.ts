import request from 'supertest';

// Os repositórios são trocados por mocks: o alvo aqui é a cadeia de middlewares
// (autenticação, vínculo com o prédio, papel dentro dele), não o acesso ao banco.
jest.mock('../repositories/building.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/ticket.repository');
jest.mock('../repositories/analytics.repository');
// O cadastro emite o código de confirmação. Sem estes dois, ele cairia no Prisma
// e no provedor de e-mail de verdade a cada teste que posta em /users ou /managers.
jest.mock('../repositories/emailToken.repository');
jest.mock('../lib/mailer');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');

import app from '../app';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { inspectionRepository } from '../repositories/inspection.repository';
import { ticketRepository } from '../repositories/ticket.repository';
import { analyticsRepository } from '../repositories/analytics.repository';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { enviarEmail } from '../lib/mailer';
import { storageService } from '../services/storage.service';
import { signAccessToken } from '../utils/jwt';

const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockInspectionRepo = inspectionRepository as jest.Mocked<typeof inspectionRepository>;
const mockTicketRepo = ticketRepository as jest.Mocked<typeof ticketRepository>;
const mockAnalyticsRepo = analyticsRepository as jest.Mocked<typeof analyticsRepository>;
const mockUserRepo = userRepository as jest.Mocked<typeof userRepository>;
const mockManagerRepo = managerRepository as jest.Mocked<typeof managerRepository>;
const mockStorage = storageService as jest.Mocked<typeof storageService>;

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
const FLOOR_ID = '44444444-4444-4444-8444-444444444444';
const REPORT_ID = '99999999-9999-4999-8999-999999999999';
const TICKET_ID = '22222222-2222-4222-8222-222222222222';
const RESPONSIBLE_ID = '33333333-3333-4333-8333-333333333333';

// Gestor é outro tipo de conta: o token dele diz MANAGER, e o que ele
// administra sai de `findManagerLink`. Usuário comum é sempre NONE, e o que ele
// pode fazer sai de `findMember`.
const tokenGestor = signAccessToken('a1111111-1111-4111-8111-111111111111', 'NONE', 'MANAGER');
const tokenInspector = signAccessToken('user-inspector', 'NONE');
const tokenViewer = signAccessToken('c2222222-2222-4222-8222-222222222222', 'NONE');
const tokenSemVinculo = signAccessToken('user-sem-vinculo', 'NONE');
const ADMIN_ID = 'c0000000-0000-4000-8000-000000000000';
const ADMIN_ATIVO = { id: ADMIN_ID, role: 'ADMIN', status: 'ACTIVE', name: 'Admin', password_hash: 'x' };
const tokenAdmin = signAccessToken(ADMIN_ID, 'ADMIN');
// Emitido antes desta mudança, quando o papel de prédio viajava dentro do JWT
const tokenLegadoGestor = signAccessToken('user-legado', 'GESTOR');

const building = {
  id: BUILDING_ID,
  name: 'Edifício Principal',
  description: 'Sede',
  share_key: 'ABCD23456789',
  created_by: 'a1111111-1111-4111-8111-111111111111',
};

/** Vínculo do usuário logado com o prédio da rota. */
function comoMembro(role: 'INSPECTOR' | 'VIEWER') {
  mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role } as any);
}

/**
 * A conta de gestor logada administra o prédio da rota.
 *
 * O mock responde por conta, e não um valor fixo: quem pergunta pelo vínculo de
 * *outro* gestor (ao adicioná-lo, por exemplo) precisa receber `null`.
 */
function comoGestorDoPredio() {
  mockBuildingRepo.findManagerLink.mockImplementation(
    ((_buildingId: string, managerId: string) =>
      Promise.resolve(managerId === 'a1111111-1111-4111-8111-111111111111' ? { id: 'bm1' } : null)) as any
  );
}

function semVinculo() {
  mockBuildingRepo.findMember.mockResolvedValue(null);
  mockBuildingRepo.findManagerLink.mockResolvedValue(null);
}

/** Envio de vistoria que passa pelo schema — para testar autorização, não validação. */
function vistoriaValida() {
  return { building_id: BUILDING_ID, floors: [{ floor_id: FLOOR_ID, records: [] }] };
}

/** Um chamado do prédio da rota — o bastante para o serviço achar o prédio dele. */
function chamadoDoPredio(overrides: Record<string, unknown> = {}) {
  return {
    id: TICKET_ID,
    status: 'ABERTO',
    responsible_id: null,
    responsible_user: null,
    closed_by: null,
    maintenance_cost: null,
    floor_form_entry: {
      floor: { id: 'floor-1', label: '1º Andar' },
      report: {
        id: REPORT_ID,
        date: new Date('2026-08-18'),
        building_id: BUILDING_ID,
        building: { id: BUILDING_ID, name: building.name },
        inspector: null,
      },
    },
    ...overrides,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  // O cadastro publico emite o codigo de confirmacao: o mailer precisa
  // responder alguma coisa, senao o envio real seria tentado.
  (enviarEmail as jest.MockedFunction<typeof enviarEmail>).mockResolvedValue(undefined);
  (auditRepository.log as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  mockBuildingRepo.findById.mockResolvedValue(building as any);
  // A guarda de ADMIN confere a conta no banco: o admin do token existe e está ativo.
  mockUserRepo.findById.mockImplementation(((id: string) =>
    Promise.resolve(id === ADMIN_ID ? { ...ADMIN_ATIVO } : null)) as any);
  mockTicketRepo.findByBuilding.mockResolvedValue([[], 0] as any);
  mockTicketRepo.findById.mockResolvedValue(chamadoDoPredio());
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

  it('cria a conta sem vínculo e sem acesso quando o payload é válido', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockManagerRepo.findByEmail.mockResolvedValue(null);
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

    // 200 e não 201: o "Created" contaria pelo status o que a mensagem se
    // recusa a contar — que este endereço ainda não tinha conta.
    expect(res.status).toBe(200);
    expect(mockUserRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'NONE' }));
    // A conta não volta no corpo: só a mensagem, igual para todo mundo.
    expect(res.body).not.toHaveProperty('password_hash');
    expect(res.body).not.toHaveProperty('id');
    expect(res.body).toHaveProperty('ok', true);
  });

  it('o cadastro de gestor cria a conta na tabela de gestores', async () => {
    // Gestor é outro tipo de conta: não entra em `users`, e por isso não tem
    // papel nenhum para receber.
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockManagerRepo.findByEmail.mockResolvedValue(null);
    mockManagerRepo.create.mockResolvedValue({
      id: 'a3333333-3333-4333-8333-333333333333',
      name: 'Gestor',
      email: 'gestor@test.com',
      password_hash: 'x',
    } as any);

    const res = await request(app)
      .post('/managers')
      .send({ name: 'Gestor', email: 'gestor@test.com', password: 'Senha@123' });

    expect(res.status).toBe(200);
    expect(mockManagerRepo.create).toHaveBeenCalled();
    expect(mockUserRepo.create).not.toHaveBeenCalled();
    expect(res.body).not.toHaveProperty('password_hash');
  });

  /**
   * Era um 409 esperado, e virou silêncio.
   *
   * O e-mail continua sendo único entre as duas tabelas — o login procura nas
   * duas, e o mesmo endereço nos dois lugares deixaria a entrada ambígua. O que
   * mudou é a resposta: dizer "já cadastrado" a quem digita num formulário
   * público entrega quais endereços têm conta. Agora recusa calado, e por fora
   * o caminho é indistinguível de um cadastro que deu certo.
   */
  it('e-mail que já é de um usuário não vira conta de gestor, e nem diz que não virou', async () => {
    mockUserRepo.findByEmail.mockResolvedValue({ id: 'user-1', email_verified_at: new Date() } as any);
    mockManagerRepo.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/managers')
      .send({ name: 'Gestor', email: 'view@test.com', password: 'Senha@123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(mockManagerRepo.create).not.toHaveBeenCalled();
  });

  /**
   * A armadilha do formulário: um campo escondido no CSS que humano nenhum vê.
   *
   * Responder erro seria ensinar o robô a apagar o campo na próxima tentativa —
   * por isso o sucesso de sempre, e nenhuma escrita por trás dele.
   */
  it('honeypot preenchido: sucesso na resposta, nenhuma conta criada', async () => {
    const res = await request(app)
      .post('/users')
      .send({
        name: 'Robo',
        email: 'robo@test.com',
        password: 'Senha@123',
        website: 'http://spam.example',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(mockUserRepo.create).not.toHaveBeenCalled();
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

/**
 * O painel analítico.
 *
 * O escopo sai do `:id` da rota, e o único parâmetro que aponta para gente é
 * conferido contra o vínculo do prédio antes de virar filtro — é o que impede
 * que trocar um id na barra de endereços leia a operação de outro prédio.
 */
describe('painel analítico', () => {
  const ANALYTICS = `/buildings/${BUILDING_ID}/analytics/overview`;

  const RESPONSAVEIS = `/buildings/${BUILDING_ID}/analytics/responsibles`;

  const FILA = `/buildings/${BUILDING_ID}/analytics/queue`;

  const PREDIO = `/buildings/${BUILDING_ID}/analytics/building`;

  beforeEach(() => {
    mockAnalyticsRepo.overview.mockResolvedValue({ total: 0, parados1: 0 } as any);
    mockAnalyticsRepo.porPrioridade.mockResolvedValue([]);
    mockAnalyticsRepo.emRisco.mockResolvedValue([]);
    mockAnalyticsRepo.saudeDoProcesso.mockResolvedValue({
      nasceram: 0, fecharam: 0, nasceram_anterior: 0, fecharam_anterior: 0,
    } as any);
    mockAnalyticsRepo.porResponsavel.mockResolvedValue([]);
    mockAnalyticsRepo.atrasadosAbertos.mockResolvedValue([]);
    mockAnalyticsRepo.evolucaoMensal.mockResolvedValue([]);
    mockAnalyticsRepo.backlogNoInicioDoAno.mockResolvedValue(0);
    mockAnalyticsRepo.filaAcionavel.mockResolvedValue([]);
    mockAnalyticsRepo.distribuicaoDeCiclo.mockResolvedValue([]);
    mockAnalyticsRepo.porInspetor.mockResolvedValue([]);
    mockAnalyticsRepo.totalDeAndares.mockResolvedValue(12);
    mockAnalyticsRepo.custo.mockResolvedValue({
      total: 0, total_anterior: 0, fechados: 0, n_com_custo: 0,
      n_com_custo_anterior: 0, ticket_medio: null, ticket_p50: null,
    });
    mockAnalyticsRepo.contagemDaFila.mockResolvedValue({
      atrasados: 0, em_risco: 0, parados: 0, em_aberto: 0,
    });
    mockAnalyticsRepo.custoPorDimensao.mockResolvedValue([]);
    mockAnalyticsRepo.perfilMensal.mockResolvedValue([]);
    mockAnalyticsRepo.recorrencia.mockResolvedValue([]);
  });

  it('bloqueia quem não tem vínculo com o prédio', async () => {
    const res = await request(app).get(ANALYTICS).set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(403);
    expect(mockAnalyticsRepo.overview).not.toHaveBeenCalled();
  });

  it('bloqueia o membro que não modera — ver a fila não é ver a operação', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app).get(ANALYTICS).set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
    expect(mockAnalyticsRepo.overview).not.toHaveBeenCalled();
  });

  it('libera o moderador do prédio', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'MODERADOR' } as any);

    const res = await request(app).get(ANALYTICS).set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(200);
  });

  it('libera o gestor do prédio', async () => {
    comoGestorDoPredio();

    const res = await request(app).get(ANALYTICS).set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(200);
  });

  /**
   * O filtro por responsável é o único que aponta para uma pessoa, e por isso é
   * o único que poderia atravessar prédios. Sem vínculo é 404 — devolver lista
   * vazia confirmaria que aquele id existe em algum lugar.
   */
  it('recusa responsável que não é do prédio, sem chegar a consultar', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'MODERADOR' } as any);
    mockBuildingRepo.findResponsible.mockResolvedValue(null);

    const res = await request(app)
      .get(`${ANALYTICS}?responsible_id=${RESPONSIBLE_ID}`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(404);
    expect(mockAnalyticsRepo.overview).not.toHaveBeenCalled();
  });

  /**
   * A contagem da fila alimenta o cartão do painel inicial.
   *
   * É a rota mais chamada do analytics — toda visita ao painel de entrada a
   * dispara —, e é a que mais tenta parecer inofensiva: devolve quatro números.
   * Os quatro dizem quantos chamados o prédio tem vencidos, que é operação.
   */
  it('quem não modera não lê a contagem da fila', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app).get(FILA).set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
    expect(mockAnalyticsRepo.contagemDaFila).not.toHaveBeenCalled();
  });

  it('o moderador do prédio lê a contagem da fila', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'MODERADOR' } as any);

    const res = await request(app).get(FILA).set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(200);
  });

  it('o gestor do prédio lê a contagem da fila', async () => {
    comoGestorDoPredio();

    const res = await request(app).get(FILA).set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(200);
  });

  /**
   * A fila não tem período, e o que a URL disser sobre isso é ignorado.
   *
   * Um `?year=2020` aceito aqui esconderia o chamado de março que está vencido
   * hoje — a tela ajudando a perder o prazo. O controller nem lê `req.query`, e
   * o teste prende esse comportamento: o repositório é chamado do mesmo jeito.
   */
  it('ignora recorte de período na contagem da fila', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'MODERADOR' } as any);

    const res = await request(app)
      .get(`${FILA}?year=2020&month=3`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(200);
    // O escopo chega com o prédio e sem recorte nenhum — nem o do `?year`, nem
    // os de andar, categoria ou responsável que o schema saberia ler.
    expect(mockAnalyticsRepo.contagemDaFila).toHaveBeenCalledWith(
      {
        building_id: BUILDING_ID,
        floor_id: undefined,
        category: undefined,
        responsible_id: undefined,
      },
      expect.any(Number)
    );
  });

  /**
   * A aba do prédio tem custo de manutenção dentro.
   *
   * Mesma guarda do `overview`, e pelo mesmo motivo: quanto o prédio gastou não
   * é leitura de quem só acompanha as vistorias. A guarda mora na rota — a aba
   * escondida no navegador com a rota aberta é permissão que existe só no
   * desenho.
   */
  it('o membro que não modera não lê o custo do prédio', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app)
      .get(PREDIO)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
    expect(mockAnalyticsRepo.custo).not.toHaveBeenCalled();
  });

  it('quem não tem vínculo nenhum também não lê', async () => {
    const res = await request(app).get(PREDIO).set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(403);
    expect(mockAnalyticsRepo.custo).not.toHaveBeenCalled();
  });

  it('o moderador do prédio lê o custo — é ele quem lança o valor', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'MODERADOR' } as any);

    const res = await request(app).get(PREDIO).set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(200);
  });

  it('o gestor do prédio lê o custo', async () => {
    comoGestorDoPredio();

    const res = await request(app).get(PREDIO).set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(200);
  });

  it('recusa responsável de outro prédio também na aba do prédio', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'MODERADOR' } as any);
    mockBuildingRepo.findResponsible.mockResolvedValue(null);

    const res = await request(app)
      .get(`${PREDIO}?responsible_id=${RESPONSIBLE_ID}`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(404);
    expect(mockAnalyticsRepo.custo).not.toHaveBeenCalled();
  });

  /**
   * Inspetores são leitura de gestor.
   *
   * O moderador trabalha com o resultado da ronda — a ocorrência que chegou na
   * fila dele —, não com quem a fez. Avaliar quem vistoria é de quem responde
   * pelo prédio. E a guarda está na rota, não em esconder a aba: aba escondida
   * com rota aberta é permissão que existe só no desenho.
   */
  it('o moderador do prédio não lê o desempenho dos inspetores', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'MODERADOR' } as any);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/analytics/inspectors`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
    expect(mockAnalyticsRepo.porInspetor).not.toHaveBeenCalled();
  });

  it('o gestor do prédio lê o desempenho dos inspetores', async () => {
    comoGestorDoPredio();

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/analytics/inspectors?year=2026`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(200);
    expect(res.body.total_andares).toBe(12);
    expect(mockAnalyticsRepo.porInspetor).toHaveBeenCalledWith(
      { building_id: BUILDING_ID },
      expect.objectContaining({ from_day: '2026-01-01', to_day: '2026-12-31' })
    );
  });

  it('a tabela de responsáveis é do moderador, não de quem só vistoria', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app).get(RESPONSAVEIS).set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
    expect(mockAnalyticsRepo.porResponsavel).not.toHaveBeenCalled();
  });

  /**
   * A comparação é sempre entre todos, mesmo no modo individual: filtrar a
   * consulta da tabela pelo responsável escolhido faria a "média da equipe"
   * virar a média de uma pessoa só — e o número perderia o sentido inteiro.
   */
  it('no modo individual a média da equipe continua sendo de todos', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'MODERADOR' } as any);
    mockBuildingRepo.findResponsible.mockResolvedValue({ id: RESPONSIBLE_ID } as any);

    const res = await request(app)
      .get(`${RESPONSAVEIS}?responsible_id=${RESPONSIBLE_ID}&year=2026`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(200);
    expect(res.body.modo).toBe('INDIVIDUAL');
    expect(mockAnalyticsRepo.porResponsavel).toHaveBeenCalledWith(
      expect.objectContaining({ building_id: BUILDING_ID, responsible_id: undefined }),
      expect.anything()
    );
    // Já a lista de atrasados é da pessoa, e essa sim leva o filtro.
    expect(mockAnalyticsRepo.atrasadosAbertos).toHaveBeenCalledWith(
      expect.objectContaining({ responsible_id: RESPONSIBLE_ID })
    );
  });

  it('recusa responsável de outro prédio também na visão de equipe', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'MODERADOR' } as any);
    mockBuildingRepo.findResponsible.mockResolvedValue(null);

    const res = await request(app)
      .get(`${RESPONSAVEIS}?responsible_id=${RESPONSIBLE_ID}`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(404);
    expect(mockAnalyticsRepo.atrasadosAbertos).not.toHaveBeenCalled();
  });

  it('aceita o responsável vinculado e o repassa como filtro', async () => {
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'MODERADOR' } as any);
    mockBuildingRepo.findResponsible.mockResolvedValue({ id: RESPONSIBLE_ID } as any);

    const res = await request(app)
      .get(`${ANALYTICS}?responsible_id=${RESPONSIBLE_ID}&year=2026&month=8`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(200);
    expect(mockAnalyticsRepo.overview).toHaveBeenCalledWith(
      expect.objectContaining({ building_id: BUILDING_ID, responsible_id: RESPONSIBLE_ID }),
      expect.objectContaining({ from_day: '2026-08-01', to_day: '2026-08-31' }),
      expect.objectContaining({ from_day: '2026-07-01', to_day: '2026-07-31' })
    );
  });
});

describe('criação de prédio', () => {
  it('a conta de gestor cria o prédio e já fica como gestora dele', async () => {
    mockBuildingRepo.create.mockResolvedValue(building as any);

    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ name: 'Prédio novo' });

    expect(res.status).toBe(201);
    expect(mockBuildingRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: 'a1111111-1111-4111-8111-111111111111' })
    );
  });

  it('conta de usuário não cadastra prédio', async () => {
    // `building_managers.manager_id` aponta para `managers`, e o usuário comum
    // não está lá: deixar passar criaria um prédio sem gestor.
    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenSemVinculo}`)
      .send({ name: 'Prédio novo' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.create).not.toHaveBeenCalled();
  });

  it('nem o ADMIN cadastra prédio', async () => {
    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ name: 'Prédio novo' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.create).not.toHaveBeenCalled();
  });
});

describe('gestão do prédio', () => {
  it('o gestor do prédio edita o prédio', async () => {
    comoGestorDoPredio();
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
    comoGestorDoPredio();
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
    comoGestorDoPredio();
    mockBuildingRepo.findAccessRequestById.mockResolvedValue({
      id: 'b1111111-1111-4111-8111-111111111111',
      building_id: BUILDING_ID,
      status: 'PENDING',
    } as any);
    mockBuildingRepo.updateAccessRequest.mockResolvedValue({
      id: 'b1111111-1111-4111-8111-111111111111',
      user_id: 'c1111111-1111-4111-8111-111111111111',
      user: { id: 'c1111111-1111-4111-8111-111111111111', name: 'Novo', email: 'novo@test.com' },
    } as any);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/access-requests/b1111111-1111-4111-8111-111111111111`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    // Sem terceiro argumento: o vínculo nasce VIEWER, mesmo que a conta já
    // seja inspetora em outro prédio.
    expect(mockBuildingRepo.addMember).toHaveBeenCalledWith(BUILDING_ID, 'c1111111-1111-4111-8111-111111111111');
  });

  it('ex-membro solicita acesso de novo ao mesmo prédio', async () => {
    mockBuildingRepo.findByShareKey.mockResolvedValue(building as any);
    // Sobrou do vínculo anterior: aprovada, mas o usuário já saiu do prédio.
    mockBuildingRepo.findAccessRequest.mockResolvedValue({ id: 'b1111111-1111-4111-8111-111111111111', status: 'APPROVED' } as any);
    mockBuildingRepo.createAccessRequest.mockResolvedValue({ id: 'b1111111-1111-4111-8111-111111111111', status: 'PENDING' } as any);

    const res = await request(app)
      .post('/buildings/access-requests')
      .set('Authorization', `Bearer ${tokenViewer}`)
      .send({ key: building.share_key });

    expect(res.status).toBe(201);
    expect(mockBuildingRepo.createAccessRequest).toHaveBeenCalledWith(BUILDING_ID, 'c2222222-2222-4222-8222-222222222222');
  });

  it('recusa segundo pedido enquanto o gestor não revisa o primeiro', async () => {
    mockBuildingRepo.findByShareKey.mockResolvedValue(building as any);
    mockBuildingRepo.findAccessRequest.mockResolvedValue({ id: 'b1111111-1111-4111-8111-111111111111', status: 'PENDING' } as any);

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
    comoGestorDoPredio();
    // O alvo da promoção precisa existir como membro do prédio
    mockBuildingRepo.findMember.mockResolvedValue({ id: 'm1', role: 'VIEWER' } as any);
    mockBuildingRepo.updateMemberRole.mockResolvedValue({ id: 'm1', role: 'INSPECTOR' } as any);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/c1111111-1111-4111-8111-111111111111`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'INSPECTOR' });

    expect(res.status).toBe(200);
    expect(mockBuildingRepo.updateMemberRole).toHaveBeenCalledWith(
      BUILDING_ID,
      'c1111111-1111-4111-8111-111111111111',
      'INSPECTOR'
    );
  });

  it('recusa promover um membro a gestor por esta rota', async () => {
    // Gestor é outro tipo de conta: não dá para virar gestor mudando o papel de
    // um vínculo de usuário.
    comoGestorDoPredio();

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/c1111111-1111-4111-8111-111111111111`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'GESTOR' });

    expect(res.status).toBe(400);
    expect(mockBuildingRepo.updateMemberRole).not.toHaveBeenCalled();
  });

  it('recusa promover membro a ADMIN', async () => {
    comoGestorDoPredio();

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/c1111111-1111-4111-8111-111111111111`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(mockBuildingRepo.updateMemberRole).not.toHaveBeenCalled();
  });

  it('inspetor não troca o papel de ninguém', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/c1111111-1111-4111-8111-111111111111`)
      .set('Authorization', `Bearer ${tokenInspector}`)
      .send({ role: 'INSPECTOR' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.updateMemberRole).not.toHaveBeenCalled();
  });
});

describe('gestores do prédio', () => {
  it('o gestor adiciona outro gestor pelo e-mail', async () => {
    // É assim que a gestão se divide e se transfere: quem quer sair adiciona o
    // substituto antes.
    comoGestorDoPredio();
    mockManagerRepo.findByEmail.mockResolvedValue({ id: 'a2222222-2222-4222-8222-222222222222', status: 'ACTIVE' } as any);
    mockBuildingRepo.addManager.mockResolvedValue({ id: 'bm2' } as any);

    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/managers`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ email: 'gestor2@test.com' });

    expect(res.status).toBe(201);
    expect(mockBuildingRepo.addManager).toHaveBeenCalledWith(BUILDING_ID, 'a2222222-2222-4222-8222-222222222222');
  });

  it('recusa adicionar como gestor um e-mail que não é conta de gestor', async () => {
    comoGestorDoPredio();
    mockManagerRepo.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/managers`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ email: 'inspetor@test.com' });

    expect(res.status).toBe(404);
    expect(mockBuildingRepo.addManager).not.toHaveBeenCalled();
  });

  it('recusa tirar o único gestor do prédio', async () => {
    comoGestorDoPredio();
    mockBuildingRepo.countManagers.mockResolvedValue(1);

    const res = await request(app)
      .delete(`/buildings/${BUILDING_ID}/managers/a1111111-1111-4111-8111-111111111111`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(409);
    expect(mockBuildingRepo.removeManager).not.toHaveBeenCalled();
  });

  it('com dois gestores, um deles pode sair da gestão', async () => {
    comoGestorDoPredio();
    mockBuildingRepo.countManagers.mockResolvedValue(2);
    mockBuildingRepo.removeManager.mockResolvedValue({ id: 'bm1' } as any);

    const res = await request(app)
      .delete(`/buildings/${BUILDING_ID}/managers/a1111111-1111-4111-8111-111111111111`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(204);
    expect(mockBuildingRepo.removeManager).toHaveBeenCalledWith(BUILDING_ID, 'a1111111-1111-4111-8111-111111111111');
  });

  it('inspetor não mexe na gestão do prédio', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/managers`)
      .set('Authorization', `Bearer ${tokenInspector}`)
      .send({ email: 'gestor2@test.com' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.addManager).not.toHaveBeenCalled();
  });
});

describe('gestor não vistoria', () => {
  it('recusa o envio de vistoria vindo de conta de gestor', async () => {
    // `inspection_reports.inspector_id` aponta para `users`, e o gestor não está
    // lá. Deixar passar quebraria a chave estrangeira.
    comoGestorDoPredio();

    const res = await request(app)
      .post('/inspections')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send(vistoriaValida());

    expect(res.status).toBe(403);
    expect(mockInspectionRepo.createCompleted).not.toHaveBeenCalled();
  });

  it('mas o gestor continua vendo os relatórios do prédio dele', async () => {
    comoGestorDoPredio();
    mockInspectionRepo.findById.mockResolvedValue({
      id: REPORT_ID,
      building_id: BUILDING_ID,
      status: 'COMPLETED',
      excel_path: 'report_day_predio_2026-08-21.xlsx',
      date: new Date('2026-08-21'),
      building: { id: BUILDING_ID, name: 'Edifício Principal' },
    } as any);
    mockStorage.createExcelSignedUrl.mockResolvedValue('https://storage/assinada?token=abc');

    const res = await request(app)
      .get(`/inspections/${REPORT_ID}/excel`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(200);
  });
});

describe('edição de usuários pelo admin', () => {
  it('recusa alteração de papel', async () => {
    const res = await request(app)
      .patch('/users/c2222222-2222-4222-8222-222222222222')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('aceita alteração de nome e status', async () => {
    const alvo = {
      id: 'c2222222-2222-4222-8222-222222222222',
      name: 'Antigo',
      email: 'v@test.com',
      role: 'NONE',
      status: 'ACTIVE',
      password_hash: 'x',
    };
    mockUserRepo.findById.mockImplementation(((id: string) =>
      Promise.resolve(id === ADMIN_ID ? { ...ADMIN_ATIVO } : alvo)) as any);
    mockUserRepo.update.mockResolvedValue({
      id: 'c2222222-2222-4222-8222-222222222222',
      name: 'Novo nome',
      email: 'v@test.com',
      role: 'NONE',
      status: 'ACTIVE',
      password_hash: 'x',
    } as any);

    const res = await request(app)
      .patch('/users/c2222222-2222-4222-8222-222222222222')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ name: 'Novo nome' });

    expect(res.status).toBe(200);
    expect(mockUserRepo.update).toHaveBeenCalledWith('c2222222-2222-4222-8222-222222222222', { name: 'Novo nome' });
  });

  it('admin rebaixado perde o painel na hora, mesmo com o token ainda válido', async () => {
    mockUserRepo.findById.mockResolvedValue({ ...ADMIN_ATIVO, role: 'NONE' } as any);

    const res = await request(app).get('/users').set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(403);
  });

  it('admin desativado perde o painel na hora', async () => {
    mockUserRepo.findById.mockResolvedValue({ ...ADMIN_ATIVO, status: 'DELETED' } as any);

    const res = await request(app).get('/users').set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(403);
  });
});

describe('entrada malformada', () => {
  it('id que não é UUID vira 404 sem tocar o banco', async () => {
    const res = await request(app)
      .get('/tickets/abc')
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(404);
    expect(mockTicketRepo.findById).not.toHaveBeenCalled();
  });

  it('JSON quebrado é 400, não 500', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
  });

  it('corpo acima do teto é 413, não 500', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(3_000_000) }));

    expect(res.status).toBe(413);
  });

  it('token assinado com algoritmo diferente de HS256 é recusado', async () => {
    const jwt = await import('jsonwebtoken');
    const forjado = jwt.sign(
      { sub: ADMIN_ID, kind: 'USER', role: 'ADMIN', type: 'access' },
      process.env.JWT_SECRET as string,
      { algorithm: 'HS512' }
    );

    const res = await request(app).get('/users').set('Authorization', `Bearer ${forjado}`);

    expect(res.status).toBe(401);
  });

  it('conta de gestor não abre solicitação de acesso', async () => {
    const res = await request(app)
      .post('/buildings/access-requests')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ key: 'ABCD23456789' });

    expect(res.status).toBe(403);
    expect(mockBuildingRepo.createAccessRequest).not.toHaveBeenCalled();
  });
});

/**
 * O preflight do navegador.
 *
 * Esta é a falha que não aparece em teste de rota nenhum: a requisição é
 * recusada *antes* de sair, pelo navegador, porque o cabeçalho não está na
 * lista do CORS. No servidor não chega nada — nem log, nem erro. Só o app
 * quebrado, e sem pista.
 */
describe('CORS', () => {
  const origem = 'http://localhost:3001';

  it('deixa passar os cabeçalhos que o app manda', async () => {
    const res = await request(app)
      .options('/inspections')
      .set('Origin', origem)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization,idempotency-key');

    const permitidos = String(res.headers['access-control-allow-headers']).toLowerCase();
    expect(permitidos).toContain('authorization');
    expect(permitidos).toContain('content-type');
    // Sem este, o envio da vistoria nem sai do navegador.
    expect(permitidos).toContain('idempotency-key');
  });
});

describe('acesso a relatórios', () => {
  const report = {
    id: REPORT_ID,
    building_id: BUILDING_ID,
    status: 'COMPLETED',
    excel_path: 'report_day_predio_2026-08-21.xlsx',
  };

  it('esconde relatório de prédio em que o usuário não é membro', async () => {
    mockInspectionRepo.findById.mockResolvedValue(report as any);

    const res = await request(app)
      .get(`/inspections/${REPORT_ID}/day`)
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
    // Nem assinar chegou a acontecer: quem não tem vínculo para antes.
    expect(mockStorage.createExcelSignedUrl).not.toHaveBeenCalled();
  });

  it('assina a URL na hora para quem é membro do prédio', async () => {
    comoMembro('VIEWER');
    mockInspectionRepo.findById.mockResolvedValue({
      ...report,
      date: new Date('2026-08-21'),
      building: { id: BUILDING_ID, name: 'Edifício Principal' },
    } as any);
    mockStorage.createExcelSignedUrl.mockResolvedValue('https://storage/assinada?token=abc');

    const res = await request(app)
      .get(`/inspections/${REPORT_ID}/excel`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(200);
    expect(res.body.excel_url).toBe('https://storage/assinada?token=abc');
    expect(mockStorage.createExcelSignedUrl).toHaveBeenCalledWith(
      'report_day_predio_2026-08-21.xlsx',
      'vistoria-edificio-principal-2026-08-21.xlsx'
    );
  });

  it('a listagem nunca devolve o caminho do arquivo no bucket', async () => {
    // O caminho é metade do que falta para chegar ao objeto. A tela só precisa
    // saber que existe planilha — o link vem assinado, e só a quem pedir.
    mockBuildingRepo.getMemberBuildingIds.mockResolvedValue([BUILDING_ID]);
    mockInspectionRepo.findAll.mockResolvedValue([
      [{ id: REPORT_ID, building_id: BUILDING_ID, has_excel: true }],
      1,
    ] as any);

    const res = await request(app).get('/inspections').set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('excel_path');
    expect(res.body.inspections[0].has_excel).toBe(true);
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

describe('ocorrências do prédio', () => {
  it('membro comum lista as ocorrências — o histórico é leitura livre de quem é do prédio', async () => {
    comoMembro('VIEWER');

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/tickets?group=TODOS`)
      .set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(200);
    expect(mockTicketRepo.findByBuilding).toHaveBeenCalledWith(
      expect.objectContaining({ building_id: BUILDING_ID })
    );
  });

  it('quem não é do prédio não lista ocorrência nenhuma', async () => {
    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/tickets?group=TODOS`)
      .set('Authorization', `Bearer ${tokenSemVinculo}`);

    expect(res.status).toBe(403);
    expect(mockTicketRepo.findByBuilding).not.toHaveBeenCalled();
  });

  it('os contadores continuam do moderador', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/tickets/stats`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
    expect(mockTicketRepo.countByStatus).not.toHaveBeenCalled();
  });

  it('ler não é mexer: membro comum não encaminha', async () => {
    comoMembro('INSPECTOR');

    const res = await request(app)
      .post(`/tickets/${TICKET_ID}/forward`)
      .set('Authorization', `Bearer ${tokenInspector}`)
      .send({ responsible_id: RESPONSIBLE_ID });

    expect(res.status).toBe(403);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });

  it('ler não é mexer: membro comum não fecha', async () => {
    comoMembro('VIEWER');
    mockTicketRepo.findById.mockResolvedValue(
      chamadoDoPredio({ status: 'AGUARDANDO_FECHAMENTO' })
    );

    const res = await request(app)
      .post(`/tickets/${TICKET_ID}/close`)
      .set('Authorization', `Bearer ${tokenViewer}`);

    expect(res.status).toBe(403);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });

  it('ler não é mexer: membro comum não recebe chamado que não é dele', async () => {
    comoMembro('INSPECTOR');
    mockTicketRepo.findById.mockResolvedValue(
      chamadoDoPredio({ status: 'ENCAMINHADO', responsible_id: RESPONSIBLE_ID })
    );

    const res = await request(app)
      .post(`/tickets/${TICKET_ID}/receive`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(403);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
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
    mockBuildingRepo.createAccessRequest.mockResolvedValue({ id: 'b1111111-1111-4111-8111-111111111111', status: 'PENDING' } as any);

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
