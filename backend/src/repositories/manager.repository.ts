import { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Campos do gestor que podem sair da API — nunca inclui password_hash. */
const PUBLIC_MANAGER_FIELDS = {
  id: true,
  name: true,
  email: true,
  avatar_url: true,
  status: true,
  created_at: true,
  updated_at: true,
} as const;

export const managerRepository = {
  findById(id: string) {
    return prisma.manager.findUnique({ where: { id } });
  },

  findByEmail(email: string) {
    return prisma.manager.findUnique({ where: { email } });
  },

  create(data: { name: string; email: string; password_hash: string }) {
    return prisma.manager.create({ data });
  },

  update(id: string, data: Prisma.ManagerUpdateInput) {
    return prisma.manager.update({ where: { id }, data });
  },

  findAll(page: number, limit: number) {
    const skip = (page - 1) * limit;
    return Promise.all([
      prisma.manager.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          ...PUBLIC_MANAGER_FIELDS,
          _count: { select: { managed_buildings: true } },
        },
      }),
      prisma.manager.count(),
    ]);
  },

  hardDelete(id: string) {
    return prisma.manager.delete({ where: { id } });
  },

  /**
   * Mesma anonimização da conta de usuário: o registro fica, o nome e o e-mail
   * saem. As ações dele na auditoria continuam apontando para esta linha.
   */
  softDelete(id: string) {
    return prisma.manager.update({
      where: { id },
      data: {
        name: 'Gestor removido',
        email: `deleted_${id}@removed.invalid`,
        avatar_url: null,
        status: UserStatus.DELETED,
      },
    });
  },
};
