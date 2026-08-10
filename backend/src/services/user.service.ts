import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { userRepository } from '../repositories/user.repository';
import { storageService } from './storage.service';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';

/** Teto da foto depois de decodificada. O recorte do app entrega bem menos. */
const MAX_AVATAR_BYTES = 1_500_000;

/**
 * Cadastro público, com o papel decidido pela rota (nunca pelo corpo).
 *
 * `role` entra como literal e não como `Role.X`: se o Prisma Client estiver
 * desatualizado, `Role.GESTOR` vira `undefined`, o Prisma omite a coluna e o
 * banco aplica o default (INSPECTOR) sem erro nenhum. Com literal, ou o valor
 * chega inteiro ou o insert falha alto.
 */
async function register(
  data: { name: string; email: string; password: string },
  role: Role
) {
  const existing = await userRepository.findByEmail(data.email);
  if (existing) throw new ConflictError('E-mail já cadastrado');

  const password_hash = await bcrypt.hash(data.password, 10);
  const user = await userRepository.create({
    name: data.name,
    email: data.email,
    role,
    password_hash,
  });

  const { password_hash: _, ...safe } = user;
  return safe;
}

export const userService = {
  /**
   * Cadastro público comum. O papel sai sempre como VIEWER: quem define o nível
   * de acesso de verdade é o gestor do prédio, depois do vínculo.
   */
  create(data: { name: string; email: string; password: string }) {
    return register(data, 'VIEWER');
  },

  /**
   * Cadastro público de gestor, pela tela própria do login.
   * O gestor cria os próprios prédios e administra quem se vincula a eles.
   */
  createManager(data: { name: string; email: string; password: string }) {
    return register(data, 'GESTOR');
  },

  async findAll(page: number, limit: number) {
    const [users, total] = await userRepository.findAll(page, limit);
    return { users, total, page, limit };
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

  async updateMe(id: string, data: { name?: string; email?: string }) {
    if (data.email) {
      const existing = await userRepository.findByEmail(data.email);
      if (existing && existing.id !== id) throw new ConflictError('E-mail já em uso');
    }
    const updated = await userRepository.update(id, data);
    const { password_hash: _, ...safe } = updated;
    return safe;
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

    const [header, base64] = dataUrl.split(',');
    const contentType = header.slice(header.indexOf(':') + 1, header.indexOf(';'));
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.byteLength > MAX_AVATAR_BYTES) {
      throw new ConflictError('Imagem muito grande. O limite é 1,5 MB.');
    }

    const avatar_url = await storageService.uploadAvatar(id, buffer, contentType);
    const updated = await userRepository.update(id, { avatar_url });

    if (user.avatar_url) await storageService.removeAvatar(user.avatar_url);

    const { password_hash: _, ...safe } = updated;
    return safe;
  },

  /** Volta para a inicial do nome. */
  async removeAvatar(id: string) {
    const user = await userRepository.findById(id);
    if (!user || user.status === 'DELETED') throw new NotFoundError('Usuário');

    const updated = await userRepository.update(id, { avatar_url: null });
    if (user.avatar_url) await storageService.removeAvatar(user.avatar_url);

    const { password_hash: _, ...safe } = updated;
    return safe;
  },

  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('Usuário');

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedError('Senha atual incorreta');

    const password_hash = await bcrypt.hash(newPassword, 10);
    await userRepository.update(id, { password_hash });
  },

  async softDelete(id: string) {
    await this.findById(id);
    await userRepository.softDelete(id);
  },

  /**
   * Remove definitivamente o usuário do banco.
   * As inspeções dele são preservadas com inspector_id nulo (ON DELETE SET NULL),
   * assim como os prédios que ele criou (created_by nulo).
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
