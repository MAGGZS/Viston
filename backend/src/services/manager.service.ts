import bcrypt from 'bcrypt';
import { managerRepository } from '../repositories/manager.repository';
import { PASSWORD_ROUNDS } from '../utils/password';
import { userRepository } from '../repositories/user.repository';
import { buildingRepository } from '../repositories/building.repository';
import { storageService } from './storage.service';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';

/** Teto da foto depois de decodificada. O recorte do app entrega bem menos. */
const MAX_AVATAR_BYTES = 1_500_000;

/**
 * O e-mail precisa ser livre nas duas tabelas.
 *
 * Postgres não faz unique entre tabelas, e o login procura nos dois lugares: se
 * o mesmo e-mail existisse em `users` e em `managers`, a entrada seria ambígua e
 * a pessoa cairia numa conta ou noutra dependendo da ordem da consulta.
 */
export async function assertEmailIsFree(email: string, ignoreManagerId?: string) {
  const [user, manager] = await Promise.all([
    userRepository.findByEmail(email),
    managerRepository.findByEmail(email),
  ]);

  if (user) throw new ConflictError('E-mail já cadastrado');
  if (manager && manager.id !== ignoreManagerId) {
    throw new ConflictError('E-mail já cadastrado');
  }
}

/**
 * Recusa apagar a conta que é a única gestora de algum prédio.
 *
 * O vínculo de gestão sai em cascata com a conta, e o prédio ficaria sem
 * ninguém para aprovar solicitação, promover inspetor ou cadastrar andar. Para
 * sair, adicione outro gestor antes.
 */
async function assertNotSoleManager(managerId: string) {
  const buildings = await buildingRepository.findBuildingsWhereSoleManager(managerId);
  if (buildings.length === 0) return;

  const names = buildings.map((b) => `"${b.name}"`).join(', ');
  throw new ConflictError(
    `Esta conta é a única gestora de ${names}. Adicione outro gestor antes de excluí-la.`
  );
}

function withoutHash<T extends { password_hash: string }>(manager: T) {
  const { password_hash: _, ...safe } = manager;
  return safe;
}

export const managerService = {
  /**
   * Cadastro público de gestor.
   *
   * A conta nasce em `managers`, não em `users`: gestor é outro tipo de conta.
   * Ela já nasce podendo cadastrar prédio — e vira gestora de cada prédio que
   * cadastrar.
   */
  async create(data: { name: string; email: string; password: string }) {
    await assertEmailIsFree(data.email);

    const password_hash = await bcrypt.hash(data.password, PASSWORD_ROUNDS);
    const manager = await managerRepository.create({
      name: data.name,
      email: data.email,
      password_hash,
    });

    return withoutHash(manager);
  },

  async findById(id: string) {
    const manager = await managerRepository.findById(id);
    if (!manager || manager.status === 'DELETED') throw new NotFoundError('Gestor');
    return withoutHash(manager);
  },

  /**
   * O perfil que o app carrega no login e a cada abertura.
   *
   * Vem com os prédios que ele administra, no mesmo formato dos vínculos do
   * usuário — assim a mesma tela de perfil serve os dois tipos de conta.
   */
  async getProfile(id: string) {
    const manager = await this.findById(id);
    const buildings = await buildingRepository.findAll(id);

    return {
      ...manager,
      kind: 'MANAGER' as const,
      memberships: buildings.map((b) => ({
        building_id: b.id,
        name: b.name,
        description: b.description,
        role: 'GESTOR' as const,
      })),
    };
  },

  async updateMe(id: string, data: { name?: string; email?: string }) {
    if (data.email) await assertEmailIsFree(data.email, id);
    await managerRepository.update(id, data);
    return this.getProfile(id);
  },

  async updateAvatar(id: string, dataUrl: string) {
    const manager = await managerRepository.findById(id);
    if (!manager || manager.status === 'DELETED') throw new NotFoundError('Gestor');

    const [header, base64] = dataUrl.split(',');
    const contentType = header.slice(header.indexOf(':') + 1, header.indexOf(';'));
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.byteLength > MAX_AVATAR_BYTES) {
      throw new ConflictError('Imagem muito grande. O limite é 1,5 MB.');
    }

    const avatar_url = await storageService.uploadAvatar(id, buffer, contentType);
    await managerRepository.update(id, { avatar_url });

    // A foto anterior sai depois de a nova estar no lugar: falhar na limpeza
    // deixa um arquivo órfão, falhar na ordem inversa deixa a conta sem foto.
    if (manager.avatar_url) await storageService.removeAvatar(manager.avatar_url);

    return this.getProfile(id);
  },

  async removeAvatar(id: string) {
    const manager = await managerRepository.findById(id);
    if (!manager || manager.status === 'DELETED') throw new NotFoundError('Gestor');

    await managerRepository.update(id, { avatar_url: null });
    if (manager.avatar_url) await storageService.removeAvatar(manager.avatar_url);

    return this.getProfile(id);
  },

  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const manager = await managerRepository.findById(id);
    if (!manager) throw new NotFoundError('Gestor');

    const valid = await bcrypt.compare(currentPassword, manager.password_hash);
    if (!valid) throw new UnauthorizedError('Senha atual incorreta');

    const password_hash = await bcrypt.hash(newPassword, PASSWORD_ROUNDS);
    await managerRepository.update(id, { password_hash });
    // Ver `userService.changePassword`: trocar a senha encerra o que já estava
    // aberto, senão a troca não tira ninguém de dentro.
    await managerRepository.bumpTokenVersion(id);
  },

  async softDelete(id: string) {
    await this.findById(id);
    await assertNotSoleManager(id);
    await managerRepository.softDelete(id);
    await managerRepository.bumpTokenVersion(id);
  },

  /** Lista do painel do admin. */
  async findAll(page: number, limit: number) {
    const [managers, total] = await managerRepository.findAll(page, limit);
    return {
      managers: managers.map(({ _count, ...manager }) => ({
        ...manager,
        buildings: _count.managed_buildings,
      })),
      total,
      page,
      limit,
    };
  },

  async remove(id: string) {
    const manager = await managerRepository.findById(id);
    if (!manager) throw new NotFoundError('Gestor');

    await assertNotSoleManager(id);
    await managerRepository.hardDelete(id);
  },
};
