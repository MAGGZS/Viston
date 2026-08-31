import { TokenPurpose } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Dono do código: uma conta comum ou uma conta de gestor, nunca as duas. */
export type TokenOwner = { kind: 'USER'; id: string } | { kind: 'MANAGER'; id: string };

/** Chutes errados que um código aguenta antes de morrer. */
export const MAX_TENTATIVAS = 5;

function ownerColumns(owner: TokenOwner) {
  return owner.kind === 'USER'
    ? { user_id: owner.id, manager_id: null }
    : { user_id: null, manager_id: owner.id };
}

export const emailTokenRepository = {
  /**
   * Quantos códigos foram emitidos para este endereço na última hora.
   *
   * Conta por e-mail e não por conta porque é o e-mail que se quer proteger de
   * ser inundado — inclusive antes de a conta existir, no primeiro cadastro.
   * Igualdade exata: tudo que entra aqui passou por `normalizeEmail`.
   */
  countRecent(email: string, purpose: TokenPurpose, sinceMs: number) {
    return prisma.emailToken.count({
      where: { email, purpose, created_at: { gte: new Date(Date.now() - sinceMs) } },
    });
  },

  /** Quando saiu o último código deste tipo — o intervalo mínimo se mede daqui. */
  async lastSentAt(email: string, purpose: TokenPurpose): Promise<Date | null> {
    const ultimo = await prisma.emailToken.findFirst({
      where: { email, purpose },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });
    return ultimo?.created_at ?? null;
  },

  /**
   * Fecha os códigos abertos antes de emitir outro.
   *
   * Sem isto, pedir um reenvio deixaria os dois valendo, e um código antigo num
   * e-mail encaminhado continuaria abrindo a conta. Só o mais recente vale.
   */
  invalidateOpen(owner: TokenOwner, purpose: TokenPurpose) {
    return prisma.emailToken.updateMany({
      where: { ...ownerColumns(owner), purpose, used_at: null },
      data: { used_at: new Date() },
    });
  },

  create(data: {
    owner: TokenOwner;
    purpose: TokenPurpose;
    email: string;
    code_hash: string;
    expires_at: Date;
  }) {
    const { owner, ...resto } = data;
    return prisma.emailToken.create({ data: { ...ownerColumns(owner), ...resto } });
  },

  /**
   * O registro aberto mais recente daquele endereço, para aquele fim.
   *
   * O código de seis dígitos não identifica linha nenhuma sozinho — a busca
   * precisa do e-mail. "Mais recente" basta porque emitir um código novo fecha
   * os anteriores (ver `invalidateOpen`): no máximo um fica aberto por conta.
   */
  findOpen(email: string, purpose: TokenPurpose) {
    return prisma.emailToken.findFirst({
      where: { email, purpose, used_at: null },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        code_hash: true,
        expires_at: true,
        attempts: true,
        user_id: true,
        manager_id: true,
      },
    });
  },

  /**
   * Gasta o registro, se ele ainda abre.
   *
   * As condições vão no `where` do UPDATE, e não numa leitura anterior: assim é
   * uma instrução só no banco, o Postgres trava a linha, e duas submissões
   * simultâneas do código certo — o dedo duplo, o botão clicado duas vezes —
   * disputam ali dentro. Só uma recebe `count: 1`.
   */
  async consume(id: string): Promise<boolean> {
    const { count } = await prisma.emailToken.updateMany({
      where: { id, used_at: null, expires_at: { gt: new Date() } },
      data: { used_at: new Date() },
    });
    return count === 1;
  },

  /**
   * Registra um chute errado, e mata o registro no último.
   *
   * O incremento acontece no banco (`increment`), e não lido e regravado aqui:
   * cinco tentativas disparadas ao mesmo tempo leriam todas o mesmo número e
   * gravariam o mesmo sucessor, e o teto contaria uma só.
   */
  registerFailure(id: string, attempts: number) {
    const estourou = attempts + 1 >= MAX_TENTATIVAS;
    return prisma.emailToken.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        ...(estourou ? { used_at: new Date() } : {}),
      },
    });
  },
};
