import bcrypt from 'bcrypt';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { auditRepository, buildingRepository } from '../repositories/building.repository';
import { AccountKind, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import { hashPassword, needsRehash } from '../utils/password';
import { Actor } from '../middlewares/authenticate';
import { AuditAction } from '@prisma/client';
import { logger } from '../lib/logger';

/**
 * O token pertence à geração corrente da conta?
 *
 * Token emitido antes desta coluna existir não carrega `tv`, e vale como
 * geração 0 — que é onde toda conta começa. Assim ninguém é derrubado pela
 * migration; quem sair uma vez passa a ser cobrado do número certo.
 */
function assertCurrentSession(tokenVersion: number | undefined, accountVersion: number): void {
  if ((tokenVersion ?? 0) !== accountVersion) {
    throw new UnauthorizedError('Sessão encerrada');
  }
}

type Account = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  status: string;
  token_version: number;
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

    // Custo antigo vira custo de hoje aqui, e só aqui: é o único ponto em que a
    // senha em claro existe depois do cadastro. Falhar em refazer o hash não
    // pode barrar quem acertou a senha — o hash antigo continua correto.
    if (needsRehash(account.password_hash)) {
      const password_hash = await hashPassword(password);
      const repo = account.kind === 'MANAGER' ? managerRepository : userRepository;
      await repo.update(account.id, { password_hash }).catch((err: unknown) =>
        logger.error({ err, account_id: account.id }, '[Auth] Falha ao atualizar o custo do hash')
      );
    }

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
      refresh_token: signRefreshToken(
        account.id,
        account.role,
        account.kind,
        account.token_version
      ),
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

  /**
   * Troca o refresh token por um par novo.
   *
   * A geração do token tem de bater com a da conta: sair, trocar a senha ou ser
   * excluído incrementa `token_version`, e todo refresh token emitido antes
   * disso para de valer na hora — sem tabela de sessões, e sem esperar os sete
   * dias de validade.
   */
  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    const kind: AccountKind = payload.kind === 'MANAGER' ? 'MANAGER' : 'USER';

    // Gestor não tem papel de sistema: estar em `managers` já é o que ele é.
    if (kind === 'MANAGER') {
      const manager = await managerRepository.findById(payload.sub);
      if (!manager || manager.status === 'DELETED') {
        throw new UnauthorizedError('Conta não encontrada');
      }
      assertCurrentSession(payload.tv, manager.token_version);

      return {
        access_token: signAccessToken(manager.id, 'NONE', 'MANAGER'),
        refresh_token: signRefreshToken(manager.id, 'NONE', 'MANAGER', manager.token_version),
      };
    }

    const user = await userRepository.findById(payload.sub);
    if (!user || user.status === 'DELETED') {
      throw new UnauthorizedError('Conta não encontrada');
    }
    assertCurrentSession(payload.tv, user.token_version);

    return {
      access_token: signAccessToken(user.id, user.role, 'USER'),
      refresh_token: signRefreshToken(user.id, user.role, 'USER', user.token_version),
    };
  },

  /**
   * Encerra a sessão de quem está logado.
   *
   * Encerra todas, e não só a do aparelho que pediu: quem sai porque desconfia
   * de algo quer exatamente isso, e distinguir uma sessão da outra exigiria a
   * tabela de sessões que este desenho evita. O access token que já está na mão
   * continua valendo até expirar — no máximo quinze minutos.
   *
   * Sair de uma conta já apagada não é erro: o app manda o pedido e depois
   * limpa o armazenamento, e devolver 404 aqui deixaria o token no navegador.
   */
  async logout(actor: Actor) {
    if (actor.kind === 'MANAGER') {
      await managerRepository.bumpTokenVersion(actor.id).catch(() => undefined);
      await auditRepository.log({ manager_id: actor.id, action: AuditAction.LOGOUT });
      return;
    }

    await userRepository.bumpTokenVersion(actor.id).catch(() => undefined);
    await auditRepository.log({ user_id: actor.id, action: AuditAction.LOGOUT });
  },
};
