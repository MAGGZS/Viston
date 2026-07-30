import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const mockPrisma = {
  user: { findUnique: jest.fn() },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('deve retornar tokens com credenciais válidas', async () => {
      const hash = await bcrypt.hash('senha123', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'test@test.com', passwordHash: hash,
        role: 'INSPECTOR', name: 'Test', avatarUrl: null, status: 'ACTIVE',
      });

      const result = await service.login('test@test.com', 'senha123');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('test@test.com');
    });

    it('deve lançar UnauthorizedException com senha errada', async () => {
      const hash = await bcrypt.hash('correta', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'test@test.com', passwordHash: hash, status: 'ACTIVE',
      });

      await expect(service.login('test@test.com', 'errada'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException para usuário DELETED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'deleted@test.com', status: 'DELETED',
      });

      await expect(service.login('deleted@test.com', 'qualquer'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException para e-mail inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login('nao@existe.com', 'senha'))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});
