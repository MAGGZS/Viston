import { prisma } from '../lib/prisma';

/** Dono do token: uma conta comum ou uma conta de gestor, nunca as duas. */
export type TokenOwner = { kind: 'USER'; id: string } | { kind: 'MANAGER'; id: string };

function ownerColumns(owner: TokenOwner) {
  return owner.kind === 'USER'
    ? { user_id: owner.id, manager_id: null }
    : { user_id: null, manager_id: owner.id };
}

export const emailTokenRepository = {
  /**
   * Quantos links foram emitidos para este endereço na última hora.
   *
   * Conta por e-mail e não por conta porque é o e-mail que se quer proteger de
   * ser inundado — inclusive antes de a conta existir, no primeiro cadastro.
   * `mode: 'insensitive'` acompanha o índice em `lower(email)`.
   */
  countRecent(email: string, sinceMs: number) {
    return prisma.emailToken.count({
      where: {
        email: { equals: email, mode: 'insensitive' },
        created_at: { gte: new Date(Date.now() - sinceMs) },
      },
    });
  },

  /**
   * Fecha os links abertos da conta antes de emitir outro.
   *
   * Sem isto, pedir um reenvio deixaria os dois valendo, e um link antigo num
   * e-mail encaminhado continuaria abrindo a conta. Só o mais recente vale.
   */
  invalidateOpen(owner: TokenOwner) {
    return prisma.emailToken.updateMany({
      where: { ...ownerColumns(owner), used_at: null },
      data: { used_at: new Date() },
    });
  },

  create(data: {
    owner: TokenOwner;
    email: string;
    token_hash: string;
    expires_at: Date;
  }) {
    return prisma.emailToken.create({
      data: {
        ...ownerColumns(data.owner),
        email: data.email,
        token_hash: data.token_hash,
        expires_at: data.expires_at,
      },
    });
  },

  /**
   * Consome o link, se ele ainda abre.
   *
   * `updateMany` com as três condições no `where` é uma instrução só no banco:
   * o Postgres trava a linha, confere que `used_at` continua nulo e que o prazo
   * não passou, e grava. Dois cliques no mesmo instante — o dedo duplo, o
   * pré-carregador do cliente de e-mail — chegam aqui juntos e só um recebe
   * `count: 1`. Ler antes e gravar depois deixaria os dois passarem.
   */
  async consume(token_hash: string) {
    const agora = new Date();
    const { count } = await prisma.emailToken.updateMany({
      where: { token_hash, used_at: null, expires_at: { gt: agora } },
      data: { used_at: agora },
    });
    if (count === 0) return null;

    // Só depois de ganhar a corrida é que interessa saber de quem era.
    return prisma.emailToken.findUnique({
      where: { token_hash },
      select: { user_id: true, manager_id: true },
    });
  },
};
