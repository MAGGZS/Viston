import { passwordService } from '../services/password.service';
import { hashCodigo } from '../services/confirmation.service';
import { emailTokenRepository, MAX_TENTATIVAS } from '../repositories/emailToken.repository';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { enviarEmail } from '../lib/mailer';
import { InvalidCodeError } from '../utils/errors';
import { UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

jest.mock('../repositories/emailToken.repository', () => ({
  ...jest.requireActual('../repositories/emailToken.repository'),
  emailTokenRepository: {
    countRecent: jest.fn(),
    lastSentAt: jest.fn(),
    invalidateOpen: jest.fn(),
    create: jest.fn(),
    findOpen: jest.fn(),
    consume: jest.fn(),
    registerFailure: jest.fn(),
  },
}));
jest.mock('../repositories/user.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../lib/mailer');
jest.mock('bcrypt');

const tokens = emailTokenRepository as jest.Mocked<typeof emailTokenRepository>;
const users = userRepository as jest.Mocked<typeof userRepository>;
const managers = managerRepository as jest.Mocked<typeof managerRepository>;
const mockEnviarEmail = enviarEmail as jest.MockedFunction<typeof enviarEmail>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const CODIGO = '204813';

function makeConta(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Carlos',
    email: 'carlos@test.com',
    password_hash: '$2b$12$antigo',
    role: 'NONE',
    avatar_url: null,
    status: UserStatus.ACTIVE,
    token_version: 3,
    email_verified_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as never;
}

function makeRegistro(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    code_hash: hashCodigo(CODIGO),
    expires_at: new Date(Date.now() + 600_000),
    attempts: 0,
    user_id: 'user-1',
    manager_id: null,
    ...overrides,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnviarEmail.mockResolvedValue(undefined);
  tokens.countRecent.mockResolvedValue(0);
  tokens.lastSentAt.mockResolvedValue(null);
  tokens.invalidateOpen.mockResolvedValue({ count: 0 } as never);
  tokens.create.mockResolvedValue({} as never);
  tokens.consume.mockResolvedValue(true);
  tokens.registerFailure.mockResolvedValue({} as never);
  users.findByEmail.mockResolvedValue(null);
  managers.findByEmail.mockResolvedValue(null);
  mockBcrypt.hash.mockResolvedValue('$2b$12$nova' as never);
});

describe('esqueci minha senha: a mesma resposta sempre', () => {
  it('conta que existe recebe o codigo', async () => {
    users.findByEmail.mockResolvedValue(makeConta());

    const r = await passwordService.solicitar('carlos@test.com');

    expect(r).toHaveProperty('ok', true);
    expect(tokens.create.mock.calls[0][0].purpose).toBe('PASSWORD_RESET');
    expect(mockEnviarEmail).toHaveBeenCalled();
  });

  it('e-mail sem conta devolve a mesma coisa, e nao manda nada', async () => {
    const semConta = await passwordService.solicitar('ninguem@test.com');

    users.findByEmail.mockResolvedValue(makeConta());
    const comConta = await passwordService.solicitar('carlos@test.com');

    // Byte a byte iguais: e isso que impede o formulario de virar um
    // verificador de quais enderecos tem conta.
    expect(semConta).toEqual(comConta);
    expect(mockEnviarEmail).toHaveBeenCalledTimes(1);
  });

  it('conta apagada nao recebe codigo, e nem diz que foi apagada', async () => {
    users.findByEmail.mockResolvedValue(makeConta({ status: UserStatus.DELETED }));

    const r = await passwordService.solicitar('carlos@test.com');

    expect(r).toHaveProperty('ok', true);
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  /**
   * Quem nunca confirmou o e-mail nao tem senha a recuperar.
   *
   * Mandar codigo de redefinicao para ali seria abrir um segundo caminho para
   * tomar a conta antes de o primeiro ter sido percorrido.
   */
  it('conta nunca confirmada nao entra no fluxo de recuperacao', async () => {
    users.findByEmail.mockResolvedValue(makeConta({ email_verified_at: null }));

    await passwordService.solicitar('carlos@test.com');

    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it('o teto de reenvio nao vaza pelo 429', async () => {
    users.findByEmail.mockResolvedValue(makeConta());
    tokens.countRecent.mockResolvedValue(5);

    const r = await passwordService.solicitar('carlos@test.com');

    expect(r).toHaveProperty('ok', true);
  });

  it('gestor tambem recupera senha', async () => {
    managers.findByEmail.mockResolvedValue(makeConta({ id: 'mgr-1' }));

    await passwordService.solicitar('gestor@test.com');

    expect(tokens.create.mock.calls[0][0].owner).toEqual({ kind: 'MANAGER', id: 'mgr-1' });
  });
});

describe('conferir o codigo sem gastar', () => {
  it('codigo certo passa e o registro continua aberto', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro());

    await passwordService.verificar('carlos@test.com', CODIGO);

    expect(tokens.consume).not.toHaveBeenCalled();
  });

  it('codigo errado conta a tentativa', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro());

    await expect(passwordService.verificar('carlos@test.com', '000000')).rejects.toThrow(
      InvalidCodeError
    );
    expect(tokens.registerFailure).toHaveBeenCalledWith('tok-1', 0);
  });
});

describe('redefinir a senha', () => {
  it('troca o hash e derruba as sessoes abertas', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro());

    await passwordService.redefinir('carlos@test.com', CODIGO, 'senhanova123');

    expect(users.update).toHaveBeenCalledWith('user-1', { password_hash: '$2b$12$nova' });
    // Sem isto a troca seria teatro: o refresh token que ja estava na mao de
    // quem invadiu seguiria valendo por sete dias.
    expect(users.bumpTokenVersion).toHaveBeenCalledWith('user-1');
  });

  it('gasta o codigo — o mesmo nao serve duas vezes', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro());

    await passwordService.redefinir('carlos@test.com', CODIGO, 'senhanova123');

    expect(tokens.consume).toHaveBeenCalledWith('tok-1');
  });

  /**
   * A tela anterior nao autoriza nada.
   *
   * O codigo e conferido de novo aqui de proposito: se `verificar` bastasse,
   * pular aquela tela e postar direto trocaria a senha sem codigo nenhum.
   */
  it('codigo errado nao troca a senha, mesmo tendo passado pela tela anterior', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro());

    await expect(
      passwordService.redefinir('carlos@test.com', '000000', 'senhanova123')
    ).rejects.toThrow(InvalidCodeError);

    expect(users.update).not.toHaveBeenCalled();
    expect(users.bumpTokenVersion).not.toHaveBeenCalled();
  });

  it('codigo vencido nao troca a senha', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro({ expires_at: new Date(Date.now() - 1000) }));

    await expect(
      passwordService.redefinir('carlos@test.com', CODIGO, 'senhanova123')
    ).rejects.toThrow(InvalidCodeError);
    expect(users.update).not.toHaveBeenCalled();
  });

  it('tentativas esgotadas fecham a porta', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro({ attempts: MAX_TENTATIVAS }));

    await expect(
      passwordService.redefinir('carlos@test.com', CODIGO, 'senhanova123')
    ).rejects.toThrow(InvalidCodeError);
  });

  it('gestor troca a senha pelo mesmo caminho', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro({ user_id: null, manager_id: 'mgr-1' }));

    await passwordService.redefinir('gestor@test.com', CODIGO, 'senhanova123');

    expect(managers.update).toHaveBeenCalledWith('mgr-1', { password_hash: '$2b$12$nova' });
    expect(managers.bumpTokenVersion).toHaveBeenCalledWith('mgr-1');
  });
});
