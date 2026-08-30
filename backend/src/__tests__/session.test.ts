import request from 'supertest';

// Mesmo desenho do teste de autorização: os repositórios são mocks, porque o
// alvo aqui é o ciclo de vida da sessão — quem continua valendo depois de sair,
// de trocar a senha, de ser excluído.
jest.mock('../repositories/building.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../repositories/user.repository');
jest.mock('bcrypt');

import bcrypt from 'bcrypt';
import app from '../app';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { managerService } from '../services/manager.service';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { auditRepository, buildingRepository } from '../repositories/building.repository';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { PASSWORD_ROUNDS } from '../utils/password';
import { UnauthorizedError } from '../utils/errors';
import { AuditAction } from '@prisma/client';

const mockUserRepo = userRepository as jest.Mocked<typeof userRepository>;
const mockManagerRepo = managerRepository as jest.Mocked<typeof managerRepository>;
const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockAuditRepo = auditRepository as jest.Mocked<typeof auditRepository>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Carlos',
    email: 'carlos@test.com',
    password_hash: `$2b$${PASSWORD_ROUNDS}$hash`,
    role: 'NONE',
    avatar_url: null,
    status: 'ACTIVE',
    token_version: 0,
    // Conta que já existe é conta confirmada: é o que o backfill da migration
    // 20260830000000_email_confirmation fez com todas as que havia. Sem isto o
    // login para no 403 antes de chegar ao que estas suítes medem — a sessão e
    // o custo do hash. A confirmação em si é medida em `confirmation.test.ts`.
    email_verified_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as any;
}

function makeManager(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gestor-1',
    name: 'Marina',
    email: 'marina@test.com',
    password_hash: `$2b$${PASSWORD_ROUNDS}$hash`,
    avatar_url: null,
    status: 'ACTIVE',
    token_version: 0,
    email_verified_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildingRepo.getUserMemberships.mockResolvedValue([] as any);
  mockBuildingRepo.findAll.mockResolvedValue([] as any);
  mockBuildingRepo.findBuildingsWhereSoleManager.mockResolvedValue([] as any);
  (mockBcrypt.getRounds as jest.Mock).mockReturnValue(PASSWORD_ROUNDS);
});

// ── A geração da sessão ───────────────────────────────────────────────────────
describe('authService.refresh', () => {
  it('renova enquanto a geração do token bate com a da conta', async () => {
    mockUserRepo.findById.mockResolvedValue(makeUser({ token_version: 3 }));

    const result = await authService.refresh(signRefreshToken('user-1', 'NONE', 'USER', 3));

    expect(result.access_token).toBeTruthy();
    expect(result.refresh_token).toBeTruthy();
  });

  it('recusa o refresh token emitido antes da última saída', async () => {
    // A conta já está na geração 4; o token na mão é da 3.
    mockUserRepo.findById.mockResolvedValue(makeUser({ token_version: 4 }));

    await expect(
      authService.refresh(signRefreshToken('user-1', 'NONE', 'USER', 3))
    ).rejects.toThrow(UnauthorizedError);
  });

  it('aceita token antigo, sem geração, enquanto a conta nunca encerrou sessão', async () => {
    // Tokens emitidos antes desta coluna existir não carregam `tv`. Derrubá-los
    // na migration deslogaria todo mundo de uma vez, sem motivo.
    mockUserRepo.findById.mockResolvedValue(makeUser({ token_version: 0 }));

    const legado = require('jsonwebtoken').sign(
      { sub: 'user-1', kind: 'USER', role: 'NONE', type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    await expect(authService.refresh(legado)).resolves.toHaveProperty('access_token');
  });

  it('derruba o token sem geração assim que a conta encerra uma sessão', async () => {
    mockUserRepo.findById.mockResolvedValue(makeUser({ token_version: 1 }));

    const legado = require('jsonwebtoken').sign(
      { sub: 'user-1', kind: 'USER', role: 'NONE', type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    await expect(authService.refresh(legado)).rejects.toThrow(UnauthorizedError);
  });

  it('cobra a geração também da conta de gestor', async () => {
    mockManagerRepo.findById.mockResolvedValue(makeManager({ token_version: 2 }));

    await expect(
      authService.refresh(signRefreshToken('gestor-1', 'NONE', 'MANAGER', 1))
    ).rejects.toThrow(UnauthorizedError);
  });
});

// ── Sair ──────────────────────────────────────────────────────────────────────
describe('POST /auth/logout', () => {
  it('incrementa a geração da conta e grava LOGOUT', async () => {
    mockUserRepo.bumpTokenVersion.mockResolvedValue(makeUser({ token_version: 1 }));

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${signAccessToken('user-1', 'NONE')}`);

    expect(res.status).toBe(204);
    expect(mockUserRepo.bumpTokenVersion).toHaveBeenCalledWith('user-1');
    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', action: AuditAction.LOGOUT })
    );
  });

  it('marca a saída do gestor na tabela dele', async () => {
    mockManagerRepo.bumpTokenVersion.mockResolvedValue(makeManager({ token_version: 1 }));

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${signAccessToken('gestor-1', 'NONE', 'MANAGER')}`);

    expect(res.status).toBe(204);
    expect(mockManagerRepo.bumpTokenVersion).toHaveBeenCalledWith('gestor-1');
    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      expect.objectContaining({ manager_id: 'gestor-1', action: AuditAction.LOGOUT })
    );
  });

  it('exige estar logado', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(401);
  });
});

// ── O que mais encerra sessão ─────────────────────────────────────────────────
describe('eventos que encerram a sessão', () => {
  it('trocar a senha derruba as sessões abertas', async () => {
    mockUserRepo.findById.mockResolvedValue(makeUser());
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
    (mockBcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$novo');
    mockUserRepo.update.mockResolvedValue(makeUser());
    mockUserRepo.bumpTokenVersion.mockResolvedValue(makeUser({ token_version: 1 }));

    await userService.changePassword('user-1', 'atual', 'NovaSenha@123');

    expect(mockUserRepo.bumpTokenVersion).toHaveBeenCalledWith('user-1');
  });

  it('excluir a conta derruba as sessões abertas', async () => {
    mockUserRepo.findById.mockResolvedValue(makeUser());
    mockUserRepo.softDelete.mockResolvedValue(makeUser({ status: 'DELETED' }));
    mockUserRepo.bumpTokenVersion.mockResolvedValue(makeUser({ token_version: 1 }));

    await userService.softDelete('user-1');

    expect(mockUserRepo.bumpTokenVersion).toHaveBeenCalledWith('user-1');
  });

  it('vale igual para a conta de gestor', async () => {
    mockManagerRepo.findById.mockResolvedValue(makeManager());
    mockManagerRepo.softDelete.mockResolvedValue(makeManager({ status: 'DELETED' }));
    mockManagerRepo.bumpTokenVersion.mockResolvedValue(makeManager({ token_version: 1 }));

    await managerService.softDelete('gestor-1');

    expect(mockManagerRepo.bumpTokenVersion).toHaveBeenCalledWith('gestor-1');
  });
});

// ── Custo do hash ─────────────────────────────────────────────────────────────
describe('login', () => {
  it('refaz o hash antigo quando a senha confere', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(makeUser({ password_hash: '$2b$10$antigo' }));
    mockManagerRepo.findByEmail.mockResolvedValue(null);
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
    (mockBcrypt.getRounds as jest.Mock).mockReturnValue(10);
    (mockBcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$novo');
    mockUserRepo.update.mockResolvedValue(makeUser());

    await authService.login('carlos@test.com', 'Senha@123');

    expect(mockBcrypt.hash).toHaveBeenCalledWith('Senha@123', PASSWORD_ROUNDS);
    expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', { password_hash: '$2b$12$novo' });
  });

  it('não mexe no hash que já está no custo de hoje', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(makeUser());
    mockManagerRepo.findByEmail.mockResolvedValue(null);
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
    (mockBcrypt.getRounds as jest.Mock).mockReturnValue(PASSWORD_ROUNDS);

    await authService.login('carlos@test.com', 'Senha@123');

    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('senha errada não vira re-hash', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(makeUser({ password_hash: '$2b$10$antigo' }));
    mockManagerRepo.findByEmail.mockResolvedValue(null);
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(authService.login('carlos@test.com', 'errada')).rejects.toThrow(UnauthorizedError);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });
});
