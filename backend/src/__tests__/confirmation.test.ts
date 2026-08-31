import bcrypt from 'bcrypt';
import { authService } from '../services/auth.service';
import {
  confirmationService,
  enviarCodigo,
  hashCodigo,
  INTERVALO_REENVIO_SEG,
} from '../services/confirmation.service';
import { userService } from '../services/user.service';
import { managerService } from '../services/manager.service';
import { emailTokenRepository, MAX_TENTATIVAS } from '../repositories/emailToken.repository';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { enviarEmail } from '../lib/mailer';
import {
  EmailDeliveryError,
  EmailNotConfirmedError,
  InvalidCodeError,
  TooManyEmailsError,
} from '../utils/errors';
import { UserStatus } from '@prisma/client';

/**
 * O modulo e mockado pela metade, de proposito.
 *
 * `MAX_TENTATIVAS` e uma constante de verdade que os testes usam para montar o
 * caso do teto — se ela virasse `undefined` junto com o resto, os testes
 * passariam comparando `undefined` com `undefined`. O `requireActual` mantem os
 * exports reais e so troca o objeto do repositorio.
 */
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
jest.mock('../repositories/building.repository');
jest.mock('../lib/mailer');
jest.mock('bcrypt');

const tokens = emailTokenRepository as jest.Mocked<typeof emailTokenRepository>;
const users = userRepository as jest.Mocked<typeof userRepository>;
const managers = managerRepository as jest.Mocked<typeof managerRepository>;
const buildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const audit = auditRepository as jest.Mocked<typeof auditRepository>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockEnviarEmail = enviarEmail as jest.MockedFunction<typeof enviarEmail>;

const CODIGO = '481507';

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

/** Registro aberto, como `findOpen` o devolve. */
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
  buildings.getUserMemberships.mockResolvedValue([] as never);
  audit.log.mockResolvedValue(undefined as never);
});

describe('emissao do codigo', () => {
  it('grava so o hash; o codigo legivel so existe dentro do e-mail', async () => {
    await enviarCodigo({ kind: 'USER', id: 'user-1' }, 'EMAIL_VERIFY', 'Carlos', 'carlos@test.com');

    const gravado = tokens.create.mock.calls[0][0];
    expect(gravado.code_hash).toMatch(/^[0-9a-f]{64}$/);

    // O codigo esta no corpo do e-mail — e, passado pelo hash, da o que foi
    // gravado. A leitura sai da versao em texto puro, e nao do HTML: prender o
    // teste a marcacao faz ele quebrar a cada mudanca de aparencia, como ja
    // quebrou uma vez.
    const [, assunto, html, texto] = mockEnviarEmail.mock.calls[0];

    // Esta assercao vem antes de extrair, e nao depois. Extrair primeiro e
    // conferir o formato depois nao prova nada — o proprio `\d{6}` ja garante
    // seis digitos no que captura — e, quando nao casa, o `undefined` chega no
    // matcher como "received must be a string", que esconde a causa.
    expect(texto).toMatch(/\d{6}/);
    const codigo = (/(\d{6})/.exec(texto) as RegExpExecArray)[1];
    expect(hashCodigo(codigo)).toBe(gravado.code_hash);

    // As duas versoes carregam o mesmo codigo, e nenhuma carrega o hash.
    expect(html).toContain(codigo);
    expect(html).not.toContain(gravado.code_hash);
    expect(texto).not.toContain(gravado.code_hash);

    // O assunto abre com o codigo: e o que deixa a pessoa ler o numero na lista
    // de e-mails, sem abrir a mensagem.
    expect(assunto.startsWith(codigo)).toBe(true);
  });

  /**
   * A versao em texto puro faz parte do contrato, e nao e enfeite.
   *
   * Cliente que nao renderiza HTML mostraria a mensagem em branco sem ela, e
   * filtro de spam trata com desconfianca quem manda so HTML. Sem esta
   * assercao, alguem poderia passar `''` e nada reclamaria.
   */
  it('manda as duas versoes, e a de texto puro nao vai vazia', async () => {
    await enviarCodigo({ kind: 'USER', id: 'user-1' }, 'EMAIL_VERIFY', 'Carlos', 'carlos@test.com');

    const [, , html, texto] = mockEnviarEmail.mock.calls[0];
    expect(html.length).toBeGreaterThan(200);
    expect(texto.length).toBeGreaterThan(80);
    // Texto puro e texto puro: sem marcacao sobrando de um copiar e colar.
    expect(texto).not.toMatch(/<[a-z][^>]*>/i);
  });

  it('normaliza a caixa do e-mail antes de gravar e de enviar', async () => {
    await enviarCodigo({ kind: 'USER', id: 'user-1' }, 'EMAIL_VERIFY', 'Carlos', '  Joao@X.com  ');
    expect(tokens.create.mock.calls[0][0].email).toBe('joao@x.com');
    expect(mockEnviarEmail.mock.calls[0][0]).toBe('joao@x.com');
  });

  it('fecha os codigos abertos antes de emitir outro', async () => {
    await enviarCodigo({ kind: 'USER', id: 'user-1' }, 'EMAIL_VERIFY', 'Carlos', 'carlos@test.com');
    expect(tokens.invalidateOpen).toHaveBeenCalledWith({ kind: 'USER', id: 'user-1' }, 'EMAIL_VERIFY');
  });

  it('escapa o nome no corpo do e-mail', async () => {
    // Nome vem de campo aberto no cadastro. Sem escapar, marcacao entraria
    // inteira na mensagem — inclusive um link falso colado num e-mail nosso.
    await enviarCodigo(
      { kind: 'USER', id: 'user-1' },
      'EMAIL_VERIFY',
      '<a href="http://mau">Carlos</a>',
      'carlos@test.com'
    );
    const html = mockEnviarEmail.mock.calls[0][2];
    expect(html).not.toContain('<a href="http://mau">');
    expect(html).toContain('&lt;a href=&quot;http://mau&quot;&gt;');
  });

  it('o e-mail de recuperacao e outro texto, com o mesmo codigo', async () => {
    await enviarCodigo({ kind: 'USER', id: 'user-1' }, 'PASSWORD_RESET', 'Carlos', 'carlos@test.com');
    expect(mockEnviarEmail.mock.calls[0][1]).toMatch(/redefinir/i);
  });
});

describe('tetos de reenvio', () => {
  it('recusa dois pedidos dentro do intervalo minimo', async () => {
    tokens.lastSentAt.mockResolvedValue(new Date(Date.now() - (INTERVALO_REENVIO_SEG - 5) * 1000));

    await expect(
      enviarCodigo({ kind: 'USER', id: 'user-1' }, 'EMAIL_VERIFY', 'Carlos', 'carlos@test.com')
    ).rejects.toThrow(TooManyEmailsError);

    expect(tokens.create).not.toHaveBeenCalled();
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it('aceita depois de passado o intervalo', async () => {
    tokens.lastSentAt.mockResolvedValue(new Date(Date.now() - (INTERVALO_REENVIO_SEG + 5) * 1000));
    await enviarCodigo({ kind: 'USER', id: 'user-1' }, 'EMAIL_VERIFY', 'Carlos', 'carlos@test.com');
    expect(mockEnviarEmail).toHaveBeenCalled();
  });

  it('o sexto pedido na mesma hora da LIMITE e nao grava nada', async () => {
    tokens.countRecent.mockResolvedValue(5);

    await expect(
      enviarCodigo({ kind: 'USER', id: 'user-1' }, 'EMAIL_VERIFY', 'Carlos', 'carlos@test.com')
    ).rejects.toThrow(TooManyEmailsError);

    expect(tokens.create).not.toHaveBeenCalled();
  });

  /**
   * O 429 sozinho derrubaria a regra da resposta unica no cadastro.
   *
   * Ele so dispara quando ha codigos recentes, e codigos so existem para conta
   * nova ou nao confirmada. Seis cadastros seguidos vendo o sexto virar 429
   * provariam que aquele e-mail nao tem conta confirmada.
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
    expect(mockEnviarEmail).not.toHaveBeenCalled();
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
  it('recusa do provedor vira EMAIL_FALHOU, e o codigo gravado sobrevive', async () => {
    // Grava antes de enviar de proposito: codigo orfao no banco e inofensivo,
    // codigo real numa caixa de entrada que o banco nao reconhece nao e.
    mockEnviarEmail.mockRejectedValue(new EmailDeliveryError());

    await expect(
      enviarCodigo({ kind: 'USER', id: 'user-1' }, 'EMAIL_VERIFY', 'Carlos', 'carlos@test.com')
    ).rejects.toThrow(EmailDeliveryError);

    expect(tokens.create).toHaveBeenCalled();
  });
});

describe('verificacao do codigo', () => {
  it('codigo certo libera a conta do usuario', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro());

    await confirmationService.confirmar('carlos@test.com', CODIGO);

    expect(users.update).toHaveBeenCalledWith('user-1', { email_verified_at: expect.any(Date) });
  });

  it('libera a conta do gestor pelo mesmo caminho', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro({ user_id: null, manager_id: 'mgr-1' }));

    await confirmationService.confirmar('gestor@test.com', CODIGO);

    expect(managers.update).toHaveBeenCalledWith('mgr-1', { email_verified_at: expect.any(Date) });
  });

  it('codigo errado conta a tentativa e nao libera nada', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro());

    await expect(confirmationService.confirmar('carlos@test.com', '000000')).rejects.toThrow(
      InvalidCodeError
    );

    expect(tokens.registerFailure).toHaveBeenCalledWith('tok-1', 0);
    expect(users.update).not.toHaveBeenCalled();
  });

  it('codigo vencido nao abre, e nem conta tentativa', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro({ expires_at: new Date(Date.now() - 1000) }));

    await expect(confirmationService.confirmar('carlos@test.com', CODIGO)).rejects.toThrow(
      InvalidCodeError
    );
    expect(tokens.registerFailure).not.toHaveBeenCalled();
  });

  it('tentativas esgotadas fecham a porta mesmo para o codigo certo', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro({ attempts: MAX_TENTATIVAS }));

    await expect(confirmationService.confirmar('carlos@test.com', CODIGO)).rejects.toThrow(
      InvalidCodeError
    );
    expect(users.update).not.toHaveBeenCalled();
  });

  it('sem registro aberto, o erro e o mesmo de codigo errado', async () => {
    tokens.findOpen.mockResolvedValue(null);

    await expect(confirmationService.confirmar('ninguem@test.com', CODIGO)).rejects.toThrow(
      InvalidCodeError
    );
  });

  it('perder a corrida do consumo nao libera a conta', async () => {
    tokens.findOpen.mockResolvedValue(makeRegistro());
    tokens.consume.mockResolvedValue(false);

    await expect(confirmationService.confirmar('carlos@test.com', CODIGO)).rejects.toThrow(
      InvalidCodeError
    );
    expect(users.update).not.toHaveBeenCalled();
  });
});

describe('cadastro: uma resposta so', () => {
  const dados = { name: 'Carlos', email: 'carlos@test.com', password: 'senha12345' };

  it('e-mail novo e e-mail ja confirmado devolvem exatamente a mesma coisa', async () => {
    users.create.mockResolvedValue(makeAccount({ email_verified_at: null }));
    const novo = await userService.create(dados);

    jest.clearAllMocks();
    mockEnviarEmail.mockResolvedValue(undefined);
    users.findByEmail.mockResolvedValue(makeAccount());
    const existente = await userService.create(dados);

    expect(existente).toEqual(novo);
    expect(users.create).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('conta nao confirmada e sobrescrita e ganha codigo novo', async () => {
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
    expect(users.create.mock.calls[0][0]).not.toHaveProperty('email_verified_at');
  });

  it('e-mail ocupado na outra tabela sai calado, sem criar nada', async () => {
    managers.findByEmail.mockResolvedValue(makeAccount({ id: 'mgr-1' }));

    const r = await userService.create(dados);

    expect(r).toHaveProperty('ok', true);
    expect(users.create).not.toHaveBeenCalled();
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
    expect(mockEnviarEmail).not.toHaveBeenCalled();
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

  it('com a senha certa, manda outro codigo', async () => {
    users.findByEmail.mockResolvedValue(makeAccount({ email_verified_at: null }));
    mockBcrypt.compare.mockResolvedValue(true as never);

    await authService.reenviarConfirmacao('carlos@test.com', 'senha12345');
    expect(tokens.create).toHaveBeenCalled();
  });

  it('conta ja confirmada nao gera codigo novo', async () => {
    users.findByEmail.mockResolvedValue(makeAccount());
    mockBcrypt.compare.mockResolvedValue(true as never);

    await authService.reenviarConfirmacao('carlos@test.com', 'senha12345');
    expect(tokens.create).not.toHaveBeenCalled();
  });
});
