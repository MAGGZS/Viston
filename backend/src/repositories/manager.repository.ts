import { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Campos do gestor que podem sair da API — nunca inclui password_hash. */
const PUBLIC_MANAGER_FIELDS = {
  id: true,
  name: true,
  email: true,
  avatar_url: true,
  status: true,
  /// A suspensão sai junto: é o que o painel de planos mostra ao lado do nome,
  /// e sem ela a tela teria de perguntar conta a conta para saber quem está
  /// suspenso. É uma data, e não um segredo — quem a lê já é o admin.
  suspended_at: true,
  created_at: true,
  updated_at: true,
} as const;

export const managerRepository = {
  findById(id: string) {
    return prisma.manager.findUnique({ where: { id } });
  },

  /** Ignora a caixa do e-mail — ver `userRepository.findByEmail`. */
  findByEmail(email: string) {
    return prisma.manager.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
  },

  create(data: { name: string; email: string; password_hash: string }) {
    return prisma.manager.create({ data });
  },

  update(id: string, data: Prisma.ManagerUpdateInput) {
    return prisma.manager.update({ where: { id }, data });
  },

  /** Derruba as sessões abertas da conta — ver `userRepository.bumpTokenVersion`. */
  bumpTokenVersion(id: string) {
    return prisma.manager.update({
      where: { id },
      data: { token_version: { increment: 1 }, refresh_token_jti: null },
    });
  },

  setRefreshTokenJti(id: string, jti: string | null) {
    return prisma.manager.update({
      where: { id },
      data: { refresh_token_jti: jti },
    });
  },

  /**
   * A página de gestores, opcionalmente recortada por um termo de busca.
   *
   * A busca é do banco, e não da tela. Filtrar no cliente parecia funcionar e
   * mentia: a tela recebia só a primeira página, então procurar pelo gestor de
   * número 21 respondia "nenhum gestor encontrado" — um falso negativo em cima
   * de uma conta que existe, na mesa de quem dá suporte.
   *
   * `contains` com `insensitive` em nome e e-mail: é como a pessoa procura —
   * um pedaço do nome, ou o domínio da empresa.
   */
  findAll(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const termo = search?.trim();

    const where: Prisma.ManagerWhereInput = termo
      ? {
          OR: [
            { name: { contains: termo, mode: 'insensitive' } },
            { email: { contains: termo, mode: 'insensitive' } },
          ],
        }
      : {};

    return Promise.all([
      prisma.manager.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          ...PUBLIC_MANAGER_FIELDS,
          _count: { select: { managed_buildings: true } },
        },
      }),
      // O total acompanha o mesmo recorte: sem isto, a paginação da busca
      // prometeria páginas que não existem.
      prisma.manager.count({ where }),
    ]);
  },

  hardDelete(id: string) {
    return prisma.manager.delete({ where: { id } });
  },

  /**
   * Suspende ou devolve a conta, pela mão do admin.
   *
   * Uma data, e não um booleano: "desde quando" é a primeira pergunta de quem
   * abre o caso depois, e um `true` não a responde. Nulo é conta normal.
   *
   * Nada a ver com `status = DELETED`: a conta existe, os prédios dela existem,
   * e voltar é tirar a data.
   */
  setSuspended(id: string, suspended: boolean) {
    return prisma.manager.update({
      where: { id },
      data: { suspended_at: suspended ? new Date() : null },
    });
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
