import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  async getMonthly(year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const reports = await this.prisma.inspectionReport.findMany({
      where: { status: 'COMPLETED', date: { gte: start, lte: end } },
      include: { inspector: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { date: 'asc' },
    });

    const map: Record<string, { count: number; inspectors: { id: string; name: string; avatarUrl: string | null }[]; reportIds: string[] }> = {};

    for (const r of reports) {
      const key = new Date(r.date).toISOString().split('T')[0];
      if (!map[key]) map[key] = { count: 0, inspectors: [], reportIds: [] };
      map[key].count++;
      map[key].reportIds.push(r.id);
      if (!map[key].inspectors.find((i) => i.id === r.inspector.id)) {
        map[key].inspectors.push(r.inspector);
      }
    }

    return map;
  }

  async getRange(range: 'semestral' | 'anual') {
    const months = range === 'anual' ? 12 : 6;
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);

    const reports = await this.prisma.inspectionReport.findMany({
      where: { status: 'COMPLETED', date: { gte: start, lte: end } },
      select: { id: true, date: true, inspectorId: true },
      orderBy: { date: 'asc' },
    });

    const map: Record<string, number> = {};
    for (const r of reports) {
      const key = new Date(r.date).toISOString().split('T')[0];
      map[key] = (map[key] || 0) + 1;
    }

    return map;
  }
}
