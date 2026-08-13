import bcrypt from 'bcrypt';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { auditRepository, buildingRepository } from '../repositories/building.repository';
import { AccountKind, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import { AuditAction } from '@prisma/client';

type Account = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  status: string;
  kind: AccountKind;
  role: string;
};

/**
 * Acha a conta pelo e-mail, nas duas tabelas.
 *
 * Uma porta só de propósito: quem entra não deveria precisar saber em que tabela
 * mora. O e-mail é único entre as duas (garantido no cadastro — ver
 * `assertEmailIsFree`), então a busca nunca é ambígua.
 */
async function findAccountByEmail(email: string): Promise<Account | null> {
  const user = await userRepository.findByEmail(email);
  if (user) return { ...user, kind: 'USER', role: user.role };

  const manager = await managerRepository.findByEmail(email);
  // Gestor não tem papel de sistema: estar em `managers` já é o que ele é.
  if (manager) return { ...manager, kind: 'MANAGER', role: 'NONE' };

  return null;
}

/** Os prédios da conta, no mesmo formato para os dois tipos. */
async function accountMemberships(account: { id: string; kind: AccountKind }) {
  if (account.kind === 'MANAGER') {
    const buildings = await buildingRepository.findAll(account.id);
    return buildings.map((b) => ({
      building_id: b.id,
      name: b.name,
      description: b.description,
      role: 'GESTOR' as const,
    }));
  }

  return buildingRepository.getUserMemberships(account.id);
}

export const authService = {
  async login(email: string, password: string) {
    const account = await findAccountByEmail(email);
    if (!account || account.status === 'DELETED') {
      throw new UnauthorizedError('Credenciais inválidas');
    }

    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) throw new UnauthorizedError('Credenciais inválidas');

    await auditRepository.log(
      account.kind === 'MANAGER'
        ? { manager_id: account.id, action: AuditAction.LOGIN }
        : { user_id: account.id, action: AuditAction.LOGIN }
    );

    // Os prédios vão junto porque é por eles que o app decide para onde mandar a
    // pessoa logo depois do login.
    const memberships = await accountMemberships(account);

    return {
      access_token: signAccessToken(account.id, account.role, account.kind),
      refresh_token: signRefreshToken(account.id, account.role, account.kind),
      user: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        kind: account.kind,
        avatar_url: account.avatar_url,
        memberships,
      },
    };
  },

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    const kind: AccountKind = payload.kind === 'MANAGER' ? 'MANAGER' : 'USER';

    // Gestor não tem papel de sistema: estar em `managers` já é o que ele é.
    if (kind === 'MANAGER') {
      const manager = await managerRepository.findById(payload.sub);
      if (!manager || manager.status === 'DELETED') {
        throw new UnauthorizedError('Conta não encontrada');
      }

      return {
        access_token: signAccessToken(manager.id, 'NONE', 'MANAGER'),
        refresh_token: signRefreshToken(manager.id, 'NONE', 'MANAGER'),
      };
    }

    const user = await userRepository.findById(payload.sub);
    if (!user || user.status === 'DELETED') {
      throw new UnauthorizedError('Conta não encontrada');
    }

    return {
      access_token: signAccessToken(user.id, user.role, 'USER'),
      refresh_token: signRefreshToken(user.id, user.role, 'USER'),
    };
  },
};
