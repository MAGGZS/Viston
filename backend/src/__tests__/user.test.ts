import { userService } from '../services/user.service';
import { userRepository } from '../repositories/user.repository';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { floorFormSchema } from '../validators/inspection.validator';
import { UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

jest.mock('../repositories/user.repository');
jest.mock('bcrypt');

const mockUserRepo = userRepository as jest.Mocked<typeof userRepository>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    name: 'Carlos',
    email: 'carlos@test.com',
    password_hash: '$2b$10$hash',
    role: 'INSPECTOR',
    avatar_url: null,
    status: UserStatus.ACTIVE,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as any;
}

// ── Testes: userService.create ────────────────────────────────────────────────
describe('userService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cria usuário com senha hasheada', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    (mockBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');
    mockUserRepo.create.mockResolvedValue(makeUser());

    await userService.create({
      name: 'Carlos',
      email: 'carlos@test.com',
      password: 'Senha@123',
      role: 'INSPECTOR' as any,
    });

    expect(mockBcrypt.hash).toHaveBeenCalledWith('Senha@123', 10);
    expect(mockUserRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ password_hash: '$2b$10$hashed' })
    );
  });

  it('lança ConflictError quando e-mail já existe', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(makeUser());
    await expect(
      userService.create({ name: 'X', email: 'carlos@test.com', password: 'Senha@123', role: 'INSPECTOR' as any })
    ).rejects.toThrow(ConflictError);
  });
});

// ── Testes: userService.softDelete ────────────────────────────────────────────
describe('userService.softDelete', () => {
  beforeEach(() => jest.clearAllMocks());

  it('anonimiza dados do usuário sem deletar o registro', async () => {
    mockUserRepo.findById.mockResolvedValue(makeUser());
    mockUserRepo.softDelete.mockResolvedValue(
      makeUser({ name: 'Usuário removido', email: 'deleted_user-1@removed.invalid', status: UserStatus.DELETED })
    );

    await userService.softDelete('user-1');

    expect(mockUserRepo.softDelete).toHaveBeenCalledWith('user-1');
    expect(mockUserRepo.softDelete).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'Carlos' }));
  });

  it('lança NotFoundError para usuário inexistente', async () => {
    mockUserRepo.findById.mockResolvedValue(null);
    await expect(userService.softDelete('invalid-id')).rejects.toThrow(NotFoundError);
  });
});

// ── Testes: userService.changePassword ───────────────────────────────────────
describe('userService.changePassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lança UnauthorizedError quando senha atual está errada', async () => {
    mockUserRepo.findById.mockResolvedValue(makeUser());
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      userService.changePassword('user-1', 'senha-errada', 'NovaSenha@123')
    ).rejects.toThrow(UnauthorizedError);
  });

  it('atualiza senha quando credenciais são válidas', async () => {
    mockUserRepo.findById.mockResolvedValue(makeUser());
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
    (mockBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');
    mockUserRepo.update.mockResolvedValue(makeUser());

    await userService.changePassword('user-1', 'SenhaAtual@123', 'NovaSenha@123');
    expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', { password_hash: '$2b$10$newhash' });
  });
});

// ── Testes: floorFormSchema (validação do checklist) ─────────────────────────
describe('floorFormSchema', () => {
  const validPayload = {
    status_geral: 'OK',
    observations: [],
    manutencao: {
      cadeiras: { has_item: true, quantity: 5, is_marked: true },
      tomadas: { has_item: false },
      ar_condicionado: { status: 'OK' },
      mesas: { has_item: true, quantity: 3, is_marked: false },
      portas: { status: 'NOK' },
    },
    limpeza: {
      carpete: { status: 'NA' },
      vidros: { status: 'OK' },
      cadeiras: { has_item: true, quantity: 5, is_marked: true },
    },
  };

  it('aceita payload válido completo', () => {
    expect(() => floorFormSchema.parse(validPayload)).not.toThrow();
  });

  it('rejeita quando has_item está ausente em item com sub-form', () => {
    const invalid = {
      ...validPayload,
      manutencao: { ...validPayload.manutencao, cadeiras: { quantity: 5, is_marked: true } },
    };
    expect(() => floorFormSchema.parse(invalid)).toThrow();
  });

  it('rejeita quando quantity está ausente com has_item = true', () => {
    const invalid = {
      ...validPayload,
      manutencao: { ...validPayload.manutencao, cadeiras: { has_item: true, is_marked: true } },
    };
    expect(() => floorFormSchema.parse(invalid)).toThrow();
  });

  it('rejeita quando status está ausente em item sem sub-form', () => {
    const invalid = {
      ...validPayload,
      manutencao: { ...validPayload.manutencao, ar_condicionado: {} },
    };
    expect(() => floorFormSchema.parse(invalid)).toThrow();
  });

  it('rejeita status inválido', () => {
    const invalid = {
      ...validPayload,
      manutencao: { ...validPayload.manutencao, ar_condicionado: { status: 'INVALIDO' } },
    };
    expect(() => floorFormSchema.parse(invalid)).toThrow();
  });

  it('aceita observations como array vazio', () => {
    const withEmpty = { ...validPayload, observations: [] };
    expect(() => floorFormSchema.parse(withEmpty)).not.toThrow();
  });

  it('aceita múltiplas observações', () => {
    const withObs = { ...validPayload, observations: ['Obs 1', 'Obs 2', 'Obs 3'] };
    expect(() => floorFormSchema.parse(withObs)).not.toThrow();
  });
});
