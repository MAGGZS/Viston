import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const NOTIFICATION_FIELDS = {
  id: true,
  type: true,
  payload: true,
  read_at: true,
  created_at: true,
  building_id: true,
} as const;

export const notificationRepository = {
  create(data: { user_id: string; building_id?: string | null; type: string; payload: Record<string, unknown> }) {
    return prisma.notification.create({
      data: {
        user_id: data.user_id,
        building_id: data.building_id ?? null,
        type: data.type,
        payload: data.payload as Prisma.InputJsonValue,
      },
      select: NOTIFICATION_FIELDS,
    });
  },

  /** O sino: das mais novas para as mais velhas, lidas ou não — o `unread` diz quantas faltam. */
  listForUser(userId: string, limit: number) {
    return prisma.notification.findMany({
      where: { user_id: userId },
      select: NOTIFICATION_FIELDS,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  },

  countUnread(userId: string) {
    return prisma.notification.count({ where: { user_id: userId, read_at: null } });
  },

  /** O aviso, se for desta conta. Aviso de outra pessoa é aviso que não existe. */
  findOwned(id: string, userId: string) {
    return prisma.notification.findFirst({ where: { id, user_id: userId }, select: { id: true } });
  },

  markRead(id: string, userId: string, at: Date) {
    return prisma.notification.updateMany({
      where: { id, user_id: userId, read_at: null },
      data: { read_at: at },
    });
  },

  markAllRead(userId: string, at: Date) {
    return prisma.notification.updateMany({
      where: { user_id: userId, read_at: null },
      data: { read_at: at },
    });
  },
};
