import request from 'supertest';

// O repositório é trocado por mock: o alvo aqui é a regra (de quem é o
// feedback, para onde ele vai, o que some ao ser descartado) e a cadeia de
// middlewares das rotas — não o acesso ao banco.
jest.mock('../repositories/feedback.repository');

import app from '../app';
import { feedbackService } from '../services/feedback.service';
import { feedbackRepository } from '../repositories/feedback.repository';
import { auditRepository } from '../repositories/building.repository';
import { createFeedbackSchema, updateFeedbackSchema } from '../validators/feedback.validator';
import { NotFoundError } from '../utils/errors';
import { signAccessToken } from '../utils/jwt';
import { Actor } from '../middlewares/authenticate';

const mockRepo = feedbackRepository as jest.Mocked<typeof feedbackRepository>;

const FEEDBACK_ID = '77777777-7777-4777-8777-777777777777';

const comoUsuario: Actor = { id: 'user-1', kind: 'USER', role: 'NONE' };
const comoGestor: Actor = { id: 'gestor-1', kind: 'MANAGER', role: 'NONE' };

const tokenUsuario = signAccessToken('user-1', 'NONE');
const tokenGestor = signAccessToken('gestor-1', 'NONE', 'MANAGER');
const tokenAdmin = signAccessToken('user-admin', 'ADMIN');

function makeFeedback(overrides = {}) {
  return {
    id: FEEDBACK_ID,
    user_id: 'user-1',
    manager_id: null,
    message: 'A lista de andares podia lembrar a ordem que eu uso',
    status: 'PENDENTE',
    created_at: new Date(),
    reviewed_at: null,
    user: { id: 'user-1', name: 'Carlos', email: 'carlos@test.com', avatar_url: null },
    manager: null,
    ...overrides,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  (auditRepository.log as jest.Mock) = jest.fn().mockResolvedValue(undefined);
});

// ── Testes: feedbackService.create ───────────────────────────────────────────
describe('feedbackService.create', () => {
  it('grava o feedback do usuário na coluna de usuário', async () => {
    mockRepo.create.mockResolvedValue(makeFeedback());

    await feedbackService.create(comoUsuario, 'Podia ter um atalho para o histórico');

    expect(mockRepo.create).toHaveBeenCalledWith({
      user_id: 'user-1',
      message: 'Podia ter um atalho para o histórico',
    });
  });

  it('grava o feedback do gestor na coluna de gestor', async () => {
    mockRepo.create.mockResolvedValue(
      makeFeedback({
        user_id: null,
        manager_id: 'gestor-1',
        user: null,
        manager: { id: 'gestor-1', name: 'Ana', email: 'ana@test.com', avatar_url: null },
      })
    );

    await feedbackService.create(comoGestor, 'Queria exportar a lista de colaboradores');

    // Nunca as duas colunas: gestor e usuário são contas de tabelas diferentes
    expect(mockRepo.create).toHaveBeenCalledWith({
      manager_id: 'gestor-1',
      message: 'Queria exportar a lista de colaboradores',
    });
  });

  it('devolve a autoria já resolvida, com o tipo da conta', async () => {
    mockRepo.create.mockResolvedValue(makeFeedback());

    const feedback = await feedbackService.create(comoUsuario, 'Sugestão qualquer');

    expect(feedback.author).toMatchObject({ name: 'Carlos', kind: 'USER' });
    // A tela recebe `author`, e não `user`/`manager`: escolher entre os dois é
    // do servidor, que sabe qual coluna está preenchida.
    expect(feedback).not.toHaveProperty('user');
    expect(feedback).not.toHaveProperty('manager');
  });

  it('deixa o feedback sem autor quando a conta já saiu do sistema', async () => {
    mockRepo.create.mockResolvedValue(makeFeedback({ user_id: null, user: null }));

    const feedback = await feedbackService.create(comoUsuario, 'Sugestão qualquer');

    expect(feedback.author).toBeNull();
  });

  it('aceita mais de um feedback da mesma conta', async () => {
    mockRepo.create.mockResolvedValue(makeFeedback());

    await feedbackService.create(comoUsuario, 'Primeira ideia');
    await feedbackService.create(comoUsuario, 'Segunda ideia, outro dia');

    expect(mockRepo.create).toHaveBeenCalledTimes(2);
  });
});

// ── Testes: feedbackService.findAll ──────────────────────────────────────────
describe('feedbackService.findAll', () => {
  it('devolve a lista da aba junto da contagem de pendentes', async () => {
    mockRepo.findByStatus.mockResolvedValue([makeFeedback({ status: 'TAREFA' })]);
    mockRepo.countPending.mockResolvedValue(3);

    const result = await feedbackService.findAll('TAREFA' as any);

    expect(mockRepo.findByStatus).toHaveBeenCalledWith('TAREFA');
    expect(result.feedbacks).toHaveLength(1);
    // O aviso do menu lateral vive fora da aba aberta
    expect(result.pending).toBe(3);
  });
});

// ── Testes: feedbackService.review ───────────────────────────────────────────
describe('feedbackService.review', () => {
  it('move o pendente para tarefas', async () => {
    mockRepo.findById.mockResolvedValue(makeFeedback());
    mockRepo.updateStatus.mockResolvedValue(makeFeedback({ status: 'TAREFA' }));

    const feedback = await feedbackService.review(FEEDBACK_ID, 'TAREFA' as any, comoUsuario);

    expect(mockRepo.updateStatus).toHaveBeenCalledWith(FEEDBACK_ID, 'TAREFA');
    expect(feedback.status).toBe('TAREFA');
  });

  it('move o elogio para mensagens', async () => {
    mockRepo.findById.mockResolvedValue(makeFeedback());
    mockRepo.updateStatus.mockResolvedValue(makeFeedback({ status: 'MENSAGEM' }));

    await feedbackService.review(FEEDBACK_ID, 'MENSAGEM' as any, comoUsuario);

    expect(mockRepo.updateStatus).toHaveBeenCalledWith(FEEDBACK_ID, 'MENSAGEM');
  });

  it('lança NotFoundError quando o feedback não existe', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      feedbackService.review(FEEDBACK_ID, 'TAREFA' as any, comoUsuario)
    ).rejects.toThrow(NotFoundError);
    expect(mockRepo.updateStatus).not.toHaveBeenCalled();
  });
});

// ── Testes: feedbackService.discard ──────────────────────────────────────────
describe('feedbackService.discard', () => {
  it('apaga a linha — descartar não guarda um quarto estado', async () => {
    mockRepo.findById.mockResolvedValue(makeFeedback());
    mockRepo.remove.mockResolvedValue(makeFeedback());

    await feedbackService.discard(FEEDBACK_ID, comoUsuario);

    expect(mockRepo.remove).toHaveBeenCalledWith(FEEDBACK_ID);
    expect(mockRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('lança NotFoundError quando o feedback não existe', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(feedbackService.discard(FEEDBACK_ID, comoUsuario)).rejects.toThrow(NotFoundError);
    expect(mockRepo.remove).not.toHaveBeenCalled();
  });
});

// ── Testes: validadores ──────────────────────────────────────────────────────
describe('createFeedbackSchema', () => {
  it('descarta campo fora do contrato (status no corpo do envio)', () => {
    expect(() =>
      createFeedbackSchema.parse({ message: 'Mensagem válida', status: 'TAREFA' })
    ).toThrow();
  });

  it('recusa mensagem curta demais', () => {
    expect(() => createFeedbackSchema.parse({ message: 'oi' })).toThrow();
  });

  it('tira o espaço das pontas', () => {
    expect(createFeedbackSchema.parse({ message: '  ideia boa  ' })).toEqual({ message: 'ideia boa' });
  });
});

describe('updateFeedbackSchema', () => {
  it('aceita os dois destinos que o admin pode dar', () => {
    expect(updateFeedbackSchema.parse({ status: 'TAREFA' })).toEqual({ status: 'TAREFA' });
    expect(updateFeedbackSchema.parse({ status: 'MENSAGEM' })).toEqual({ status: 'MENSAGEM' });
  });

  it('recusa devolver o feedback para pendente', () => {
    // PENDENTE é de onde ele sai, não para onde ele volta: a decisão já foi
    // tomada, e desfazê-la reabriria um aviso que o admin já resolveu.
    expect(() => updateFeedbackSchema.parse({ status: 'PENDENTE' })).toThrow();
  });
});

// ── Testes: quem pode o quê nas rotas ────────────────────────────────────────
describe('rotas de feedback', () => {
  it('recusa envio sem token', async () => {
    const res = await request(app).post('/feedbacks').send({ message: 'Sugestão sem dono' });
    expect(res.status).toBe(401);
  });

  it('usuário comum manda feedback', async () => {
    mockRepo.create.mockResolvedValue(makeFeedback());

    const res = await request(app)
      .post('/feedbacks')
      .set('Authorization', `Bearer ${tokenUsuario}`)
      .send({ message: 'A tela de histórico podia filtrar por andar' });

    expect(res.status).toBe(201);
    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-1' }));
  });

  it('gestor manda feedback pela mesma rota', async () => {
    mockRepo.create.mockResolvedValue(
      makeFeedback({ user_id: null, manager_id: 'gestor-1', user: null })
    );

    const res = await request(app)
      .post('/feedbacks')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ message: 'Queria adicionar dois gestores de uma vez' });

    expect(res.status).toBe(201);
    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ manager_id: 'gestor-1' }));
  });

  it('cada conta só enxerga os próprios envios', async () => {
    mockRepo.findByAuthor.mockResolvedValue([makeFeedback()]);

    const res = await request(app).get('/feedbacks/me').set('Authorization', `Bearer ${tokenUsuario}`);

    expect(res.status).toBe(200);
    expect(mockRepo.findByAuthor).toHaveBeenCalledWith({ user_id: 'user-1' });
  });

  it('a caixa de feedbacks é só do admin', async () => {
    const doUsuario = await request(app).get('/feedbacks').set('Authorization', `Bearer ${tokenUsuario}`);
    const doGestor = await request(app).get('/feedbacks').set('Authorization', `Bearer ${tokenGestor}`);

    expect(doUsuario.status).toBe(403);
    expect(doGestor.status).toBe(403);
    expect(mockRepo.findByStatus).not.toHaveBeenCalled();
  });

  it('sem status na query, o admin abre nos pendentes', async () => {
    mockRepo.findByStatus.mockResolvedValue([]);
    mockRepo.countPending.mockResolvedValue(0);

    const res = await request(app).get('/feedbacks').set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(mockRepo.findByStatus).toHaveBeenCalledWith('PENDENTE');
  });

  it('recusa status inventado na query', async () => {
    const res = await request(app)
      .get('/feedbacks?status=ARQUIVADO')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(400);
  });

  it('só o admin decide o destino do feedback', async () => {
    const res = await request(app)
      .patch(`/feedbacks/${FEEDBACK_ID}`)
      .set('Authorization', `Bearer ${tokenUsuario}`)
      .send({ status: 'TAREFA' });

    expect(res.status).toBe(403);
    expect(mockRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('admin recebe o feedback como tarefa', async () => {
    mockRepo.findById.mockResolvedValue(makeFeedback());
    mockRepo.updateStatus.mockResolvedValue(makeFeedback({ status: 'TAREFA' }));

    const res = await request(app)
      .patch(`/feedbacks/${FEEDBACK_ID}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ status: 'TAREFA' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('TAREFA');
  });

  it('só o admin descarta', async () => {
    const res = await request(app)
      .delete(`/feedbacks/${FEEDBACK_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(403);
    expect(mockRepo.remove).not.toHaveBeenCalled();
  });

  it('admin descarta e a linha some', async () => {
    mockRepo.findById.mockResolvedValue(makeFeedback());
    mockRepo.remove.mockResolvedValue(makeFeedback());

    const res = await request(app)
      .delete(`/feedbacks/${FEEDBACK_ID}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(204);
    expect(mockRepo.remove).toHaveBeenCalledWith(FEEDBACK_ID);
  });
});
