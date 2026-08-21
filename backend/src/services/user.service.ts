import bcrypt from 'bcrypt';
import { userRepository } from '../repositories/user.repository';
import { PASSWORD_ROUNDS } from '../utils/password';
import { buildingRepository } from '../repositories/building.repository';
import { storageService } from './storage.service';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { decodeAvatarDataUrl } from '../utils/image';

/**
 * Cadastro público. Toda conta nasce igual: sem poder nenhum.
 *
 * `role` entra como literal e não como `AccountRole.X`: se o Prisma Client
 * estiver desatualizado, o enum vira `undefined`, o Prisma omite a coluna e o
 * banco aplica o default sem erro nenhum. Com literal, ou o valor chega inteiro
 * ou o insert falha alto.
 */
async function register(data: { name: string; email: string; password: string }) {
  const existing = await userRepository.findByEmail(data.email);
  if (existing) throw new ConflictError('E-mail já cadastrado');

  const password_hash = await bcrypt.hash(data.password, PASSWORD_ROUNDS);
  const user = await userRepository.create({
    name: data.name,
    email: data.email,
    role: 'NONE',
    password_hash,
  });

  const { password_hash: _, ...safe } = user;
  return safe;
}

/** Junta os vínculos ao usuário — o formato que o app espera do perfil. */
async function withMemberships<T extends { id: string }>(user: T) {
  return { ...user, memberships: await buildingRepository.getUserMemberships(user.id) };
}

export const userService = {
  /**
   * Cadastro público comum. A conta nasce sem vínculo: só a tela inicial, o
   * histórico e o perfil. Ganha papel quando entra num prédio.
   */
  create(data: { name: string; email: string; password: string }) {
    return register(data);
  },

  /**
   * O perfil que o app carrega no login e a cada abertura.
   *
   * Vem com os vínculos porque é deles que o frontend tira o que a pessoa pode
   * fazer: `role` aqui só diz se ela é o ADMIN do sistema.
   */
  async getProfile(id: string) {
    return withMemberships(await this.findById(id));
  },

  /**
   * Lista do painel do admin.
   *
   * Cada conta leva os papéis que ela ocupa em prédios — é o que a coluna
   * "função" mostra agora que `users.role` só diz ADMIN ou nada.
   */
  async findAll(page: number, limit: number) {
    const [users, total] = await userRepository.findAll(page, limit);
    const rolesByUser = await buildingRepository.getMembershipsByUserIds(users.map((u) => u.id));

    return {
      users: users.map((user) => ({
        ...user,
        building_roles: rolesByUser.get(user.id) ?? [],
      })),
      total,
      page,
      limit,
    };
  },

  async findById(id: string) {
    const user = await userRepository.findById(id);
    if (!user || user.status === 'DELETED') throw new NotFoundError('Usuário');
    const { password_hash: _, ...safe } = user;
    return safe;
  },

  /**
   * Edição pelo ADMIN: nome e status. O papel ficou de fora de propósito —
   * ver `buildingService`/`PATCH /buildings/:id/members/:userId`.
   */
  async update(id: string, data: { name?: string; status?: 'ACTIVE' | 'DELETED' }) {
    // Sem `findById` aqui: ele esconde quem está DELETED, e reativar um usuário
    // desativado é justamente uma das edições permitidas.
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('Usuário');

    const updated = await userRepository.update(id, data);
    const { password_hash: _, ...safe } = updated;
    return safe;
  },

  // As três rotas abaixo devolvem o perfil inteiro, com os vínculos: é o
  // resultado delas que o app grava por cima do usuário logado, e sem os
  // vínculos ele perderia, na hora, o que a pessoa pode fazer em cada prédio.
  async updateMe(id: string, data: { name?: string; email?: string }) {
    if (data.email) {
      const existing = await userRepository.findByEmail(data.email);
      if (existing && existing.id !== id) throw new ConflictError('E-mail já em uso');
    }
    const updated = await userRepository.update(id, data);
    const { password_hash: _, ...safe } = updated;
    return withMemberships(safe);
  },

  /**
   * Troca a foto de perfil.
   *
   * A imagem chega recortada do app; aqui só se decodifica, sobe e grava a URL.
   * A foto anterior sai do bucket depois de a nova estar no lugar — falhar na
   * limpeza deixa um arquivo órfão, falhar na ordem inversa deixa o usuário sem
   * foto nenhuma.
   */
  async updateAvatar(id: string, dataUrl: string) {
    const user = await userRepository.findById(id);
    if (!user || user.status === 'DELETED') throw new NotFoundError('Usuário');

    // O tipo sai dos bytes, não do rótulo do data URL: ver `decodeAvatarDataUrl`.
    const { buffer, contentType } = decodeAvatarDataUrl(dataUrl);

    const avatar_url = await storageService.uploadAvatar(id, buffer, contentType);
    const updated = await userRepository.update(id, { avatar_url });

    if (user.avatar_url) await storageService.removeAvatar(user.avatar_url);

    const { password_hash: _, ...safe } = updated;
    return withMemberships(safe);
  },

  /** Volta para a inicial do nome. */
  async removeAvatar(id: string) {
    const user = await userRepository.findById(id);
    if (!user || user.status === 'DELETED') throw new NotFoundError('Usuário');

    const updated = await userRepository.update(id, { avatar_url: null });
    if (user.avatar_url) await storageService.removeAvatar(user.avatar_url);

    const { password_hash: _, ...safe } = updated;
    return withMemberships(safe);
  },

  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('Usuário');

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedError('Senha atual incorreta');

    const password_hash = await bcrypt.hash(newPassword, PASSWORD_ROUNDS);
    await userRepository.update(id, { password_hash });

    // Senha trocada derruba as sessões abertas: se a troca foi porque a antiga
    // vazou, deixar o refresh token de sete dias de pé anularia o motivo dela.
    // Quem trocou entra de novo, uma vez.
    await userRepository.bumpTokenVersion(id);
  },

  async softDelete(id: string) {
    await this.findById(id);
    await userRepository.softDelete(id);
    // A conta some das telas na hora; sem isto, o refresh token dela seguiria
    // renovando o acesso até expirar.
    await userRepository.bumpTokenVersion(id);
  },

  /**
   * Remove definitivamente o usuário do banco.
   * As inspeções dele são preservadas com inspector_id nulo (ON DELETE SET NULL).
   * Prédio não entra na conta: usuário comum não administra nenhum — quem
   * administra é conta de gestor, que vive em outra tabela.
   */
  async remove(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new ConflictError('Você não pode excluir a própria conta por aqui');
    }

    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('Usuário');

    await userRepository.hardDelete(id);
  },
};
