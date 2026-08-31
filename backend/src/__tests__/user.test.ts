import { userService } from '../services/user.service';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { emailTokenRepository } from '../repositories/emailToken.repository';
import { resend } from '../lib/resend';
import { buildingRepository } from '../repositories/building.repository';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { submitInspectionSchema } from '../validators/inspection.validator';
import { createUserSchema } from '../validators/auth.validator';
import { UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { PASSWORD_ROUNDS } from '../utils/password';

jest.mock('../repositories/user.repository');
// O serviço consulta os vínculos antes de apagar uma conta: prédio não pode
// ficar sem gestor (ver assertNotSoleManager).
jest.mock('../repositories/building.repository');
// O cadastro passou a olhar a outra tabela de conta e a emitir o link de
// confirmação. Sem estes três, o serviço cairia no Prisma de verdade.
jest.mock('../repositories/manager.repository');
jest.mock('../repositories/emailToken.repository');
jest.mock('../lib/resend');
jest.mock('bcrypt');

const mockUserRepo = userRepository as jest.Mocked<typeof userRepository>;
const mockManagerRepo = managerRepository as jest.Mocked<typeof managerRepository>;
const mockTokens = emailTokenRepository as jest.Mocked<typeof emailTokenRepository>;
const mockResend = resend as jest.MockedFunction<typeof resend>;
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
    // Conta que já existe é conta confirmada — ver o backfill da migration
    // 20260830000000_email_confirmation.
    email_verified_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as any;
}

// ── Testes: userService.create ────────────────────────────────────────────────
describe('userService.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // O envio tem suíte própria em `confirmation.test.ts`; aqui ele só precisa
    // não atrapalhar. Não há mais modo "sem provedor" para desviar dele.
    mockResend.mockReturnValue({
      emails: { send: jest.fn().mockResolvedValue({ error: null }) },
    } as any);
    mockManagerRepo.findByEmail.mockResolvedValue(null);
    mockTokens.countRecent.mockResolvedValue(0);
    mockTokens.invalidateOpen.mockResolvedValue({ count: 0 } as any);
    mockTokens.create.mockResolvedValue({} as any);
  });

  it('cria usuário com senha hasheada', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    (mockBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');
    mockUserRepo.create.mockResolvedValue(makeUser());

    await userService.create({
      name: 'Carlos',
      email: 'carlos@test.com',
      password: 'Senha@123',
    });

    expect(mockBcrypt.hash).toHaveBeenCalledWith('Senha@123', PASSWORD_ROUNDS);
    expect(mockUserRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ password_hash: '$2b$10$hashed' })
    );
  });

  it('sempre cria sem nível de acesso, mesmo se o corpo trouxer role', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    (mockBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');
    mockUserRepo.create.mockResolvedValue(makeUser());

    await userService.create({
      name: 'Carlos',
      email: 'carlos@test.com',
      password: 'Senha@123',
      role: 'ADMIN',
    } as any);

    expect(mockUserRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'NONE' }));
  });

  /**
   * Este teste virou o contrário do que era, e de propósito.
   *
   * Ele exigia `ConflictError` para e-mail já cadastrado — o 409 que dizia "esta
   * pessoa tem conta aqui" a quem só precisava digitar um endereço num
   * formulário público. O cadastro passou a responder a mesma coisa em todos os
   * caminhos; o que se mede agora é justamente que nada distinga os dois casos.
   */
  it('e-mail já cadastrado não vaza: mesma resposta, e nada é criado', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(makeUser());

    const r = await userService.create({
      name: 'X',
      email: 'carlos@test.com',
      password: 'Senha@123',
    });

    expect(r).toHaveProperty('ok', true);
    expect(mockUserRepo.create).not.toHaveBeenCalled();
    expect(mockUserRepo.update).not.toHaveBeenCalled();
    expect(mockTokens.create).not.toHaveBeenCalled();
  });
});

// ── Testes: createUserSchema (cadastro público) ──────────────────────────────
describe('createUserSchema', () => {
  it('descarta role enviado no cadastro público', () => {
    expect(() =>
      createUserSchema.parse({
        name: 'Carlos',
        email: 'carlos@test.com',
        password: 'Senha@123',
        role: 'ADMIN',
      })
    ).toThrow();
  });

  it('aceita o cadastro sem role', () => {
    const parsed = createUserSchema.parse({
      name: 'Carlos',
      email: 'carlos@test.com',
      password: 'Senha@123',
    });
    expect(parsed).not.toHaveProperty('role');
  });
});

// ── Testes: userService.softDelete ────────────────────────────────────────────
describe('userService.softDelete', () => {
  const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Sem prédio pendurado na conta: o caso do gestor único tem teste próprio
    mockBuildingRepo.findBuildingsWhereSoleManager.mockResolvedValue([]);
  });

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

  it('apaga a conta sem consultar gestão de prédio', async () => {
    // Conta de usuário não administra prédio nenhum: quem administra é conta de
    // gestor, em outra tabela. A guarda do último gestor mora lá.
    mockUserRepo.findById.mockResolvedValue(makeUser());
    mockUserRepo.softDelete.mockResolvedValue(makeUser({ status: UserStatus.DELETED }));

    await userService.softDelete('user-1');

    expect(mockUserRepo.softDelete).toHaveBeenCalledWith('user-1');
    expect(mockBuildingRepo.findBuildingsWhereSoleManager).not.toHaveBeenCalled();
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

// ── Testes: submitInspectionSchema (envio da vistoria) ───────────────────────
describe('submitInspectionSchema', () => {
  const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
  const FLOOR_ID = '22222222-2222-4222-8222-222222222222';

  const validRecord = {
    maintenance_type: 'AR_CONDICIONADO',
    category: 'CORRETIVA',
    priority: 'ALTA',
    description: 'Split da sala 601 sem gelar',
    responsible_id: '44444444-4444-4444-8444-444444444444',
  };

  const validPayload = {
    building_id: BUILDING_ID,
    floors: [{ floor_id: FLOOR_ID, records: [validRecord] }],
  };

  it('aceita payload válido completo', () => {
    expect(() => submitInspectionSchema.parse(validPayload)).not.toThrow();
  });

  it('aceita ocorrência sem responsável — o moderador encaminha depois', () => {
    const { responsible_id, ...semResponsavel } = validRecord;
    expect(() =>
      submitInspectionSchema.parse({
        building_id: BUILDING_ID,
        floors: [{ floor_id: FLOOR_ID, records: [semResponsavel] }],
      })
    ).not.toThrow();
  });

  it('recusa responsável que não é um id de conta', () => {
    expect(() =>
      submitInspectionSchema.parse({
        building_id: BUILDING_ID,
        floors: [{ floor_id: FLOOR_ID, records: [{ ...validRecord, responsible_id: 'Alan' }] }],
      })
    ).toThrow();
  });

  it('aceita andar sem nenhuma ocorrência', () => {
    expect(() =>
      submitInspectionSchema.parse({ building_id: BUILDING_ID, floors: [{ floor_id: FLOOR_ID, records: [] }] })
    ).not.toThrow();
  });

  it('rejeita envio sem nenhum andar', () => {
    expect(() => submitInspectionSchema.parse({ building_id: BUILDING_ID, floors: [] })).toThrow();
  });

  it('rejeita descrição vazia', () => {
    const invalid = {
      building_id: BUILDING_ID,
      floors: [{ floor_id: FLOOR_ID, records: [{ ...validRecord, description: '   ' }] }],
    };
    expect(() => submitInspectionSchema.parse(invalid)).toThrow();
  });

  it('rejeita tipo de manutenção inválido', () => {
    const invalid = {
      building_id: BUILDING_ID,
      floors: [{ floor_id: FLOOR_ID, records: [{ ...validRecord, maintenance_type: 'INVALIDO' }] }],
    };
    expect(() => submitInspectionSchema.parse(invalid)).toThrow();
  });
});
