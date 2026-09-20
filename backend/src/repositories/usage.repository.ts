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

  findCounter(managerId: string, period: string) {
    return prisma.usageCounter.findUnique({
      where: { manager_id_period: { manager_id: managerId, period } },
    });
  },
};
