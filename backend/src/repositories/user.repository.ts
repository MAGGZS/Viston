import { Prisma, Role, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const userRepository = {
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findAll(page: number, limit: number) {
    const skip = (page - 1) * limit;
    return Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true, name: true, email: true, role: true,
          avatar_url: true, status: true, created_at: true, updated_at: true,
        },
      }),
      prisma.user.count(),
    ]);
  },

  create(data: { name: string; email: string; password_hash: string; role: Role }) {
    return prisma.user.create({ data });
  },

  update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  },

  softDelete(id: string) {
    return prisma.user.update({
      where: { id },
      data: {
        name: 'Usuário removido',
        email: `deleted_${id}@removed.invalid`,
        avatar_url: null,
        status: UserStatus.DELETED,
      },
    });
  },
};
