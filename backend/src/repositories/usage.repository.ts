import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';

export const usageRepository = {
  /**
   * Guarda o espaço que as fotos de um prédio passaram a ocupar.
   *
   * `skipDuplicates` porque `path` é único: reenviar a mesma foto (retry de
   * rede, dedo duplo) não pode virar uma segunda linha e contar o dobro do
   * espaço que existe no bucket.
   */
  createPhotoAssets(assets: { building_id: string; path: string; bytes: number }[]) {
    if (assets.length === 0) return Promise.resolve({ count: 0 });

    return prisma.photoAsset.createMany({
      data: assets.map((a) => ({ ...a, bytes: BigInt(a.bytes) })),
      skipDuplicates: true,
    });
  },

  /** Esquece as fotos apagadas do bucket — o espaço delas volta para a conta. */
  deletePhotoAssets(paths: string[]) {
    if (paths.length === 0) return Promise.resolve({ count: 0 });
    return prisma.photoAsset.deleteMany({ where: { path: { in: paths } } });
  },

  /**
   * Quanto as fotos de uma conta de gestor ocupam, em bytes.
   *
   * A soma chega pelo dono do prédio, e não por uma coluna de gestor na foto:
   * a foto é do prédio, e quem paga por ela é quem paga pelo prédio (ver o
   * comentário de `PhotoAsset` no schema). Prédio que trocou de dono muda de
   * conta sozinho, sem reescrever linha nenhuma.
   */
  async sumPhotoBytes(managerId: string): Promise<bigint> {
    const { _sum } = await prisma.photoAsset.aggregate({
      where: { building: { owner_manager_id: managerId } },
      _sum: { bytes: true },
    });

    return _sum.bytes ?? 0n;
  },

  /**
   * Soma envios ao contador do mês, criando a linha na primeira vez.
   *
   * `upsert` e `increment`, e não ler-somar-gravar: dois envios no mesmo
   * instante fariam os dois lerem o mesmo número e gravarem o mesmo número, e
   * um dos dois sumiria da conta.
   */
  incrementEmails(managerId: string, period: string, count: number) {
    return prisma.usageCounter.upsert({
      where: { manager_id_period: { manager_id: managerId, period } },
      create: { manager_id: managerId, period, emails_sent: count },
      update: { emails_sent: { increment: count } },
    });
  },

  /**
   * Reserva um envio do mês, só se ainda houver cota. Devolve se reservou.
   *
   * Um comando só, no banco: cria a linha do mês ou soma 1, e o `WHERE` do
   * `DO UPDATE` recusa a soma quando o contador já chegou ao limite. Ler,
   * mandar e só depois somar deixava duas requisições juntas lerem o mesmo
   * número e as duas passarem do teto. Sem linha devolvida, não há cota.
   *
   * O `id` vai daqui: a coluna não tem default no banco (o Prisma o gera no
   * cliente), e o SQL cru não passa pelo Prisma.
   */
  async reserveEmail(managerId: string, period: string, limit: number): Promise<boolean> {
    if (limit <= 0) return false;
    const rows = await prisma.$queryRaw<Array<{ emails_sent: number }>>`
      INSERT INTO "usage_counters" ("id", "manager_id", "period", "emails_sent", "updated_at")
      VALUES (${randomUUID()}, ${managerId}, ${period}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("manager_id", "period") DO UPDATE
        SET "emails_sent" = "usage_counters"."emails_sent" + 1, "updated_at" = CURRENT_TIMESTAMP
        WHERE "usage_counters"."emails_sent" < ${limit}
      RETURNING "emails_sent"
    `;
    return rows.length > 0;
  },

  /** Devolve a reserva de um envio que não saiu — o que falhou não conta. */
  async releaseEmail(managerId: string, period: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "usage_counters"
         SET "emails_sent" = "emails_sent" - 1, "updated_at" = CURRENT_TIMESTAMP
       WHERE "manager_id" = ${managerId} AND "period" = ${period} AND "emails_sent" > 0
    `;
  },

  /**
   * Reserva um envio no teto diário do sistema (`email_daily_counters`), só se
   * ainda houver vaga. Mesmo comando único de `reserveEmail`.
   */
  async reserveDailyEmail(scope: string, day: string, cap: number): Promise<boolean> {
    if (cap <= 0) return false;
    const rows = await prisma.$queryRaw<Array<{ sent: number }>>`
      INSERT INTO "email_daily_counters" ("scope", "day", "sent", "updated_at")
      VALUES (${scope}, ${day}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("scope", "day") DO UPDATE
        SET "sent" = "email_daily_counters"."sent" + 1, "updated_at" = CURRENT_TIMESTAMP
        WHERE "email_daily_counters"."sent" < ${cap}
      RETURNING "sent"
    `;
    return rows.length > 0;
  },

  /** Devolve a vaga do dia de um envio que não saiu. */
  async releaseDailyEmail(scope: string, day: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "email_daily_counters"
         SET "sent" = "sent" - 1, "updated_at" = CURRENT_TIMESTAMP
       WHERE "scope" = ${scope} AND "day" = ${day} AND "sent" > 0
    `;
  },

  findCounter(managerId: string, period: string) {
    return prisma.usageCounter.findUnique({
      where: { manager_id_period: { manager_id: managerId, period } },
    });
  },
};
