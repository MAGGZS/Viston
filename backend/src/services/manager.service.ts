import bcrypt from 'bcrypt';
import { AuditAction } from '@prisma/client';
import { managerRepository } from '../repositories/manager.repository';
import { PASSWORD_ROUNDS } from '../utils/password';
import { auditRepository, buildingRepository } from '../repositories/building.repository';
import { storageService } from './storage.service';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { decodeAvatarDataUrl } from '../utils/image';
import {
  enviarConfirmacaoDeCadastro,
  normalizeEmail,
  outraTabelaLivre,
  RESPOSTA_CADASTRO,
} from './confirmation.service';
import { planService } from './plan.service';
import { PLANS } from '../utils/plans';

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
  async create(data: { name: string; email: string; password: string; website?: string }) {
    // Os quatro caminhos daqui são os mesmos de `userService.create`, e pela
    // mesma razão: o cadastro de gestor também é público, e também não pode
    // dizer quais endereços já têm conta. O e-mail ser livre também na outra
    // tabela é conferido por `outraTabelaLivre`, calado.
    if (data.website) return RESPOSTA_CADASTRO;

    const email = normalizeEmail(data.email);
    const existing = await managerRepository.findByEmail(email);
    const password_hash = await bcrypt.hash(data.password, PASSWORD_ROUNDS);

    if (existing?.email_verified_at) return RESPOSTA_CADASTRO;
    if (!existing && !(await outraTabelaLivre('MANAGER', email))) return RESPOSTA_CADASTRO;

    if (existing) {
      await enviarConfirmacaoDeCadastro(
        { kind: 'MANAGER', id: existing.id },
        data.name,
        email,
        password_hash
      );
      return RESPOSTA_CADASTRO;
    }

    const manager = await managerRepository.create({
      name: data.name,
      email,
      password_hash,
    });

    await enviarConfirmacaoDeCadastro({ kind: 'MANAGER', id: manager.id }, data.name, email);
    return RESPOSTA_CADASTRO;
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

  // Só o nome: o e-mail não se troca por aqui (ver `updateMeSchema`).
  async updateMe(id: string, data: { name?: string }) {
    await managerRepository.update(id, { name: data.name });
    return this.getProfile(id);
  },

  async updateAvatar(id: string, dataUrl: string) {
    const manager = await managerRepository.findById(id);
    if (!manager || manager.status === 'DELETED') throw new NotFoundError('Gestor');

    // O tipo sai dos bytes, não do rótulo do data URL: ver `decodeAvatarDataUrl`.
    const { buffer, contentType } = decodeAvatarDataUrl(dataUrl);

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
  async findAll(page: number, limit: number, search?: string) {
    const [managers, total] = await managerRepository.findAll(page, limit, search);
    const withPlans = await Promise.all(
      managers.map(async ({ _count, ...manager }) => {
        const resolved = await planService.resolvePlan(manager.id);
        return {
          ...manager,
          buildings: _count.managed_buildings,
          plan: {
            code: resolved.code,
            name: PLANS[resolved.code].name,
            source: resolved.source,
          },
        };
      })
    );

    return {
      managers: withPlans,
      total,
      page,
      limit,
    };
  },

  async remove(id: string, requesterId?: string) {
    const manager = await managerRepository.findById(id);
    if (!manager) throw new NotFoundError('Gestor');

    await assertNotSoleManager(id);
    await managerRepository.hardDelete(id);
    await auditRepository.log?.({
      ...(requesterId ? { user_id: requesterId } : {}),
      action: AuditAction.DELETE,
      entity: 'Manager',
      entity_id: id,
    });
  },
};
