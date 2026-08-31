import bcrypt from 'bcrypt';
import { authService } from '../services/auth.service';
import {
  confirmationService,
  enviarConfirmacao,
  hashToken,
} from '../services/confirmation.service';
import { userService } from '../services/user.service';
import { managerService } from '../services/manager.service';
import { emailTokenRepository } from '../repositories/emailToken.repository';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { resend } from '../lib/resend';
import {
  EmailDeliveryError,
  EmailNotConfirmedError,
  InvalidTokenError,
  TooManyEmailsError,
} from '../utils/errors';
import { UserStatus } from '@prisma/client';

jest.mock('../repositories/emailToken.repository');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../repositories/building.repository');
jest.mock('../lib/resend');
jest.mock('bcrypt');

const tokens = emailTokenRepository as jest.Mocked<typeof emailTokenRepository>;
const users = userRepository as jest.Mocked<typeof userRepository>;
const managers = managerRepository as jest.Mocked<typeof managerRepository>;
const buildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const audit = auditRepository as jest.Mocked<typeof auditRepository>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockResend = resend as jest.MockedFunction<typeof resend>;

const send = jest.fn();

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Carlos',
    email: 'carlos@test.com',
    password_hash: '$2b$12$hash',
    role: 'NONE',
    avatar_url: null,
    status: UserStatus.ACTIVE,
    token_version: 0,
    email_verified_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  send.mockResolvedValue({ error: null });
  mockResend.mockReturnValue({ emails: { send } } as never);
  tokens.countRecent.mockResolvedValue(0);
  tokens.invalidateOpen.mockResolvedValue({ count: 0 } as never);
  tokens.create.mockResolvedValue({} as never);
  users.findByEmail.mockResolvedValue(null);
  managers.findByEmail.mockResolvedValue(null);
  buildings.getUserMemberships.mockResolvedValue([] as never);
  audit.log.mockResolvedValue(undefined as never);
});

describe('o que vai para o banco', () => {
  it('grava so o hash do token; o valor cru so existe na URL do e-mail', async () => {
    await enviarConfirmacao({ kind: 'USER', id: 'user-1' }, 'Carlos', 'carlos@test.com');

    const gravado = tokens.create.mock.calls[0][0];
    expect(gravado.token_hash).toMatch(/^[0-9a-f]{64}$/);

    // O cru esta na URL — e e ele que, passado pelo hash, da o que foi gravado.
    const html = send.mock.calls[0][0].html as string;
    const cru = /token=([A-Za-z0-9_-]+)/.exec(html)?.[1] as string;
    expect(hashToken(cru)).toBe(gravado.token_hash);
    expect(html).not.toContain(gravado.token_hash);
  });

  it('normaliza a caixa do e-mail antes de gravar', async () => {
    await enviarConfirmacao({ kind: 'USER', id: 'user-1' }, 'Carlos', '  Joao@X.com  ');
    expect(tokens.create.mock.calls[0][0].email).toBe('joao@x.com');
  });

  it('fecha os links abertos antes de emitir outro', async () => {
    await enviarConfirmacao({ kind: 'USER', id: 'user-1' }, 'Carlos', 'carlos@test.com');
    expect(tokens.invalidateOpen).toHaveBeenCalledWith({ kind: 'USER', id: 'user-1' });
  });
});

describe('teto de envios', () => {
  it('o sexto pedido na mesma hora da LIMITE e nao grava nada', async () => {
    tokens.countRecent.mockResolvedValue(5);

    await expect(
      enviarConfirmacao({ kind: 'USER', id: 'user-1' }, 'Carlos', 'carlos@test.com')
    ).rejects.toThrow(TooManyEmailsError);

    expect(tokens.create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  /**
   * O 429 sozinho derrubaria a regra da resposta unica.
   *
   * Ele so dispara quando ha tokens recentes para o endereco, e tokens so
   * existem para conta nova ou nao confirmada. Seis cadastros seguidos vendo o
   * sexto virar 429 provariam que aquele e-mail nao tem conta confirmada —
   * exatamente o que o formulario publico nao pode contar.
   */
  it('no cadastro o teto e engolido: mesma resposta, sem 429', async () => {
    tokens.countRecent.mockResolvedValue(5);
    users.create.mockResolvedValue(makeAccount({ email_verified_at: null }));

    const r = await userService.create({
      name: 'Carlos',
      email: 'carlos@test.com',
      password: 'senha12345',
    });

    expect(r).toHaveProperty('ok', true);
    expect(send).not.toHaveBeenCalled();
  });

  it('mas em /auth/reenviar ele continua honesto: la a senha ja foi provada', async () => {
    users.findByEmail.mockResolvedValue(makeAccount({ email_verified_at: null }));
    mockBcrypt.compare.mockResolvedValue(true as never);
    tokens.countRecent.mockResolvedValue(5);

    await expect(
      authService.reenviarConfirmacao('carlos@test.com', 'senha12345')
    ).rejects.toThrow(TooManyEmailsError);
  });
});

describe('falha do provedor', () => {
  it('recusa do Resend vira EMAIL_FALHOU', async () => {
    send.mockResolvedValue({ error: { message: 'daily quota exceeded' } });

    await expect(
      enviarConfirmacao({ kind: 'USER', id: 'user-1' }, 'Carlos', 'carlos@test.com')
    ).rejects.toThrow(EmailDeliveryError);
  });

  it('o token gravado sobrevive a falha do envio, e o proximo pedido o invalida', async () => {
    // Grava antes de enviar de proposito: token orfao no banco e inofensivo,
    // link real numa caixa de entrada que o banco nao reconhece nao e.
    send.mockResolvedValue({ error: { message: 'timeout' } });

    await expect(
      enviarConfirmacao({ kind: 'USER', id: 'user-1' }, 'Carlos', 'carlos@test.com')
    ).rejects.toThrow(EmailDeliveryError);

    expect(tokens.create).toHaveBeenCalled();
  });
});

describe('consumo do link', () => {
  it('libera a conta do usuario', async () => {
    tokens.consume.mockResolvedValue({ user_id: 'user-1', manager_id: null } as never);

    await confirmationService.confirmar('cru');

    expect(tokens.consume).toHaveBeenCalledWith(hashToken('cru'));
    expect(users.update).toHaveBeenCalledWith('user-1', {
      email_verified_at: expect.any(Date),
    });
  });

  it('libera a conta do gestor pelo mesmo caminho', async () => {
    tokens.consume.mockResolvedValue({ user_id: null, manager_id: 'mgr-1' } as never);

    await confirmationService.confirmar('cru');

    expect(managers.update).toHaveBeenCalledWith('mgr-1', {
      email_verified_at: expect.any(Date),
    });
  });

  it('link usado, expirado ou inexistente: TOKEN_INVALIDO e nada e liberado', async () => {
    // `consume` devolve null nos tres casos — as condicoes estao no proprio UPDATE.
    tokens.consume.mockResolvedValue(null);

    await expect(confirmationService.confirmar('cru')).rejects.toThrow(InvalidTokenError);
    expect(users.update).not.toHaveBeenCalled();
    expect(managers.update).not.toHaveBeenCalled();
  });
});

describe('cadastro: uma resposta so', () => {
  const dados = { name: 'Carlos', email: 'carlos@test.com', password: 'senha12345' };

  it('e-mail novo e e-mail ja confirmado devolvem exatamente a mesma coisa', async () => {
    users.create.mockResolvedValue(makeAccount({ email_verified_at: null }));
    const novo = await userService.create(dados);

    jest.clearAllMocks();
      users.findByEmail.mockResolvedValue(makeAccount());
    const existente = await userService.create(dados);

    expect(existente).toEqual(novo);
    // E o caminho da conta confirmada nao cria, nao altera e nao envia.
    expect(users.create).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('conta nao confirmada e sobrescrita e ganha link novo', async () => {
    users.findByEmail.mockResolvedValue(makeAccount({ email_verified_at: null }));
    mockBcrypt.hash.mockResolvedValue('$2b$12$novo' as never);

    await userService.create({ ...dados, name: 'Carlos Novo' });

    expect(users.update).toHaveBeenCalledWith('user-1', {
      name: 'Carlos Novo',
      password_hash: '$2b$12$novo',
    });
    expect(tokens.create).toHaveBeenCalled();
  });

  it('a conta nasce sem acesso', async () => {
    users.create.mockResolvedValue(makeAccount({ email_verified_at: null }));
    await userService.create(dados);

    // Nada de `email_verified_at` no insert: a coluna nasce nula, e e isso que
    // segura o login ate o link ser aberto.
    expect(users.create.mock.calls[0][0]).not.toHaveProperty('email_verified_at');
  });

  it('e-mail ocupado na outra tabela sai calado, sem criar nada', async () => {
    managers.findByEmail.mockResolvedValue(makeAccount({ id: 'mgr-1' }));

    const r = await userService.create(dados);

    expect(r).toHaveProperty('ok', true);
    expect(users.create).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('o cadastro de gestor segue as mesmas regras', async () => {
    users.findByEmail.mockResolvedValue(makeAccount());

    const r = await managerService.create(dados);

    expect(r).toHaveProperty('ok', true);
    expect(managers.create).not.toHaveBeenCalled();
  });
});

describe('honeypot', () => {
  it('campo escondido preenchido: sucesso na resposta, zero escrita', async () => {
    const r = await userService.create({
      name: 'Robo',
      email: 'robo@test.com',
      password: 'senha12345',
      website: 'http://spam.example',
    });

    expect(r).toHaveProperty('ok', true);
    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(users.create).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('vale igual no cadastro de gestor', async () => {
    await managerService.create({
      name: 'Robo',
      email: 'robo@test.com',
      password: 'senha12345',
      website: 'x',
    });
    expect(managers.create).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  it('conta nao confirmada nao entra', async () => {
    users.findByEmail.mockResolvedValue(makeAccount({ email_verified_at: null }));
    mockBcrypt.compare.mockResolvedValue(true as never);

    await expect(authService.login('carlos@test.com', 'senha12345')).rejects.toThrow(
      EmailNotConfirmedError
    );
  });

  it('nem quando a conta e ADMIN', async () => {
    users.findByEmail.mockResolvedValue(makeAccount({ role: 'ADMIN', email_verified_at: null }));
    mockBcrypt.compare.mockResolvedValue(true as never);

    await expect(authService.login('admin@test.com', 'senha12345')).rejects.toThrow(
      EmailNotConfirmedError
    );
  });

  it('nem quando a conta e de gestor', async () => {
    managers.findByEmail.mockResolvedValue(makeAccount({ id: 'mgr-1', email_verified_at: null }));
    mockBcrypt.compare.mockResolvedValue(true as never);

    await expect(authService.login('gestor@test.com', 'senha12345')).rejects.toThrow(
      EmailNotConfirmedError
    );
  });

  it('senha errada da 401, e nao 403: o 403 diria que a conta existe', async () => {
    users.findByEmail.mockResolvedValue(makeAccount({ email_verified_at: null }));
    mockBcrypt.compare.mockResolvedValue(false as never);

    await expect(authService.login('carlos@test.com', 'errada')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('conta confirmada entra', async () => {
    users.findByEmail.mockResolvedValue(makeAccount());
    mockBcrypt.compare.mockResolvedValue(true as never);

    const r = await authService.login('carlos@test.com', 'senha12345');
    expect(r.access_token).toBeTruthy();
  });
});

describe('reenvio', () => {
  it('exige a senha certa', async () => {
    users.findByEmail.mockResolvedValue(makeAccount({ email_verified_at: null }));
    mockBcrypt.compare.mockResolvedValue(false as never);

    await authService.reenviarConfirmacao('carlos@test.com', 'errada');
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('com a senha certa, manda outro link', async () => {
    users.findByEmail.mockResolvedValue(makeAccount({ email_verified_at: null }));
    mockBcrypt.compare.mockResolvedValue(true as never);

    await authService.reenviarConfirmacao('carlos@test.com', 'senha12345');
    expect(tokens.create).toHaveBeenCalled();
  });

  it('conta ja confirmada nao gera link novo', async () => {
    users.findByEmail.mockResolvedValue(makeAccount());
    mockBcrypt.compare.mockResolvedValue(true as never);

    await authService.reenviarConfirmacao('carlos@test.com', 'senha12345');
    expect(tokens.create).not.toHaveBeenCalled();
  });
});
