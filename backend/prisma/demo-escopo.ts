/**
 * O que conta como "dado de demonstração", num lugar só.
 *
 * O seed de demonstração (`seed-demo.ts`) e a limpeza (`seed-demo-limpar.ts`)
 * rodam no banco de produção, por decisão do proprietário. O schema não tem
 * coluna de marca, então o escopo é deduzido assim:
 *
 * - Conta demo: `users` ou `managers` com e-mail terminado em `@viston.demo`.
 *   O domínio não existe; nenhum cliente real se cadastra com ele.
 * - Prédio demo: um dos ids fixos do seed (`PREDIOS_FIXOS`), ou qualquer prédio
 *   cujo dono (`owner_manager_id`) ou criador (`created_by`) seja gestor demo.
 *
 * Tudo o que pende desses prédios e dessas contas (andares, vistorias,
 * chamados, vínculos, pedidos, avisos, logs) é demo por consequência.
 *
 * A trava contra estrago: se um prédio demo tiver gestor ou membro de fora do
 * domínio, ou se um gestor demo administrar prédio de fora, o escopo devolve
 * isso em `alheios`, e quem escreve no banco se recusa a continuar. Nesse
 * caso alguém real se misturou aos dados demo, e quem decide é uma pessoa.
 */
import type { PrismaClient } from '@prisma/client';

export const DOMINIO_DEMO = '@viston.demo';

/** Ids fixos dos prédios do seed. UUID válido, fácil de reconhecer no banco. */
export const PREDIOS_FIXOS = {
  principal: 'de300000-0000-4000-8000-000000000001',
  anexo: 'de300000-0000-4000-8000-000000000002',
  paula: 'de300000-0000-4000-8000-000000000003',
} as const;

export const IDS_PREDIOS_FIXOS: string[] = Object.values(PREDIOS_FIXOS);

export type EscopoDemo = {
  userIds: string[];
  managerIds: string[];
  buildingIds: string[];
  /** Mistura com dados reais. Vazio é o único estado em que se pode escrever. */
  alheios: string[];
};

const emailDemo = { endsWith: DOMINIO_DEMO, mode: 'insensitive' as const };

export async function lerEscopoDemo(prisma: PrismaClient): Promise<EscopoDemo> {
  const [users, managers] = await Promise.all([
    prisma.user.findMany({ where: { email: emailDemo }, select: { id: true } }),
    prisma.manager.findMany({ where: { email: emailDemo }, select: { id: true } }),
  ]);
  const userIds = users.map((u) => u.id);
  const managerIds = managers.map((m) => m.id);

  const buildings = await prisma.building.findMany({
    where: {
      OR: [
        { id: { in: IDS_PREDIOS_FIXOS } },
        ...(managerIds.length
          ? [{ owner_manager_id: { in: managerIds } }, { created_by: { in: managerIds } }]
          : []),
      ],
    },
    select: { id: true, name: true },
  });
  const buildingIds = buildings.map((b) => b.id);

  const alheios: string[] = [];

  if (buildingIds.length) {
    const [gestoresDeFora, membrosDeFora] = await Promise.all([
      prisma.buildingManager.findMany({
        where: { building_id: { in: buildingIds }, manager: { NOT: { email: emailDemo } } },
        select: { building_id: true, manager: { select: { id: true } } },
      }),
      prisma.buildingMember.findMany({
        where: { building_id: { in: buildingIds }, user: { NOT: { email: emailDemo } } },
        select: { building_id: true, user: { select: { id: true } } },
      }),
    ]);
    for (const g of gestoresDeFora) {
      alheios.push(`prédio ${g.building_id} tem gestor fora do domínio demo (manager ${g.manager.id})`);
    }
    for (const m of membrosDeFora) {
      alheios.push(`prédio ${m.building_id} tem membro fora do domínio demo (user ${m.user.id})`);
    }
  }

  if (managerIds.length) {
    const prediosDeFora = await prisma.buildingManager.findMany({
      where: { manager_id: { in: managerIds }, building_id: { notIn: buildingIds } },
      select: { building_id: true, manager_id: true },
    });
    for (const p of prediosDeFora) {
      alheios.push(`gestor demo ${p.manager_id} administra prédio de fora do escopo (${p.building_id})`);
    }
  }

  return { userIds, managerIds, buildingIds, alheios };
}

/** Só o host do banco, nunca a URL: ela carrega a senha. */
export function hostDoBanco(url: string | undefined): string {
  if (!url) return '(DATABASE_URL vazio)';
  try {
    return new URL(url).hostname || '(sem host)';
  } catch {
    return '(DATABASE_URL ilegível)';
  }
}
