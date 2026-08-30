import { AccountRole, Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const userRepository = {
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  /**
   * Acha a conta ignorando a caixa do e-mail.
   *
   * Era `findUnique`, que no Postgres compara texto cru: quem se cadastrou como
   * `Joao@x.com` não entrava digitando `joao@x.com`. `findFirst` porque não
   * existe unique declarado sobre a expressão — mas existe no banco, o índice
   * `uq_users_email_lower`, e é ele que garante que "first" é sempre "único".
   */
  findByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
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

  create(data: { name: string; email: string; password_hash: string; role: AccountRole }) {
    return prisma.user.create({ data });
  },

  update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  },

  /**
   * Derruba as sessões abertas da conta.
   *
   * Incremento no próprio banco (`increment`), e não leitura seguida de escrita:
   * duas saídas simultâneas — o celular e o computador — leriam o mesmo número e
   * gravariam o mesmo sucessor, e uma das duas sessões sobreviveria.
   */
  bumpTokenVersion(id: string) {
    return prisma.user.update({
      where: { id },
      data: { token_version: { increment: 1 } },
    });
  },

  hardDelete(id: string) {
    return prisma.user.delete({ where: { id } });
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
