import { BuildingRole, PlanCode } from '@prisma/client';

/**
 * O catálogo dos planos.
 *
 * Vive aqui, e nunca no banco. O banco guarda qual plano a conta tem; o que o
 * plano permite é regra de produto — muda com o produto, precisa ser revisada
 * em code review, e não tem por que exigir migration nem ficar editável por
 * quem alcança o banco. Uma linha `UPDATE` que desse 150 GB a uma conta grátis
 * não deixaria rastro nenhum; esta mudança deixa um commit.
 */

/** Papéis que consomem vaga no prédio. O gestor entra pela chave 'GESTOR'. */
export type PlanRole = 'GESTOR' | BuildingRole;

/**
 * Recurso que o plano abre ou fecha, ao lado dos limites numéricos.
 *
 * Limite é "quantos"; recurso é "se existe". Moderador é os dois ao mesmo
 * tempo — no LIVRE o limite é zero, que é o mesmo que não ter —, e por isso
 * aparece nas duas listas: a mensagem de erro que o usuário lê é diferente
 * ("seu plano não inclui moderadores" e não "você já tem 0 de 0").
 */
export type Feature =
  | 'MODERADOR'
  | 'EXPORT_CSV'
  | 'DOIS_FATORES'
  | 'MARCA_PROPRIA'
  | 'CARTEIRA'
  | 'API';

/**
 * Sem teto.
 *
 * `Infinity` e não um número grande: qualquer comparação `atual >= limite`
 * responde certo sozinha, sem um caso especial em cada chamada. Nunca vai para
 * o banco nem para JSON — quem for responder isto numa API troca por `null`.
 */
export const ILIMITADO = Number.POSITIVE_INFINITY;

const GB = 1024 ** 3;

export interface Limits {
  /** Prédios inclusos no plano, sem comprar nada além. */
  readonly buildings: number;
  /** Teto de prédios extras que a conta pode comprar em cima dos inclusos. */
  readonly extraBuildings: number;
  /** Quantas pessoas cabem em cada papel, por prédio. */
  readonly people: Readonly<Record<PlanRole, number>>;
  /** Espaço de fotos da conta inteira, em bytes. */
  readonly storageBytes: number;
  /** E-mails que a conta pode disparar no mês. */
  readonly emailsPerMonth: number;
}

export interface Plan {
  readonly code: PlanCode;
  readonly name: string;
  readonly limits: Limits;
  readonly features: readonly Feature[];
}

/**
 * Os três planos.
 *
 * LIVRE é a conta que acabou de nascer: um prédio, uma pessoa de cada papel,
 * nenhum recurso. Não é demonstração com prazo — é o produto pequeno, e continua
 * funcionando para sempre.
 *
 * ESSENCIAL e PRO não limitam pessoas: cobrar por assento faria o cliente
 * economizar no lugar errado, deixando de cadastrar o inspetor que faria a
 * vistoria. O que separa os dois é quantos prédios cabem e o que se pode fazer
 * com eles.
 */
export const PLANS: Readonly<Record<PlanCode, Plan>> = {
  [PlanCode.LIVRE]: {
    code: PlanCode.LIVRE,
    name: 'Livre',
    limits: {
      buildings: 1,
      extraBuildings: 0,
      people: {
        GESTOR: 1,
        [BuildingRole.MODERADOR]: 0,
        [BuildingRole.RESPONSAVEL]: 1,
        [BuildingRole.INSPECTOR]: 1,
        [BuildingRole.VIEWER]: 1,
      },
      storageBytes: 1 * GB,
      emailsPerMonth: 100,
    },
    features: [],
  },

  [PlanCode.ESSENCIAL]: {
    code: PlanCode.ESSENCIAL,
    name: 'Essencial',
    limits: {
      buildings: 1,
      extraBuildings: 2,
      people: {
        GESTOR: ILIMITADO,
        [BuildingRole.MODERADOR]: ILIMITADO,
        [BuildingRole.RESPONSAVEL]: ILIMITADO,
        [BuildingRole.INSPECTOR]: ILIMITADO,
        [BuildingRole.VIEWER]: ILIMITADO,
      },
      storageBytes: 20 * GB,
      emailsPerMonth: 2_000,
    },
    features: ['MODERADOR', 'EXPORT_CSV', 'DOIS_FATORES'],
  },

  [PlanCode.PRO]: {
    code: PlanCode.PRO,
    name: 'Pro',
    limits: {
      buildings: 5,
      extraBuildings: 20,
      people: {
        GESTOR: ILIMITADO,
        [BuildingRole.MODERADOR]: ILIMITADO,
        [BuildingRole.RESPONSAVEL]: ILIMITADO,
        [BuildingRole.INSPECTOR]: ILIMITADO,
        [BuildingRole.VIEWER]: ILIMITADO,
      },
      storageBytes: 150 * GB,
      emailsPerMonth: 20_000,
    },
    features: ['MODERADOR', 'EXPORT_CSV', 'DOIS_FATORES', 'MARCA_PROPRIA', 'CARTEIRA', 'API'],
  },
};

/** O plano de quem não tem concessão nem assinatura. */
export const DEFAULT_PLAN = PlanCode.LIVRE;

/** Se aquele plano abre o recurso. */
export function planHasFeature(plan: PlanCode, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}
