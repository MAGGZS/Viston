import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StartInspectionDto, SaveFloorFormDto, InspectionQueryDto } from './inspections.dto';
import { Role } from '@prisma/client';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class InspectionsService {
  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService,
  ) {}

  async start(userId: string, dto: StartInspectionDto) {
    const building = await this.prisma.building.findUnique({ where: { id: dto.buildingId } });
    if (!building) throw new NotFoundException('Prédio não encontrado');

    const floors = await this.prisma.floor.findMany({
      where: { id: { in: dto.floorIds }, buildingId: dto.buildingId },
    });
    if (floors.length !== dto.floorIds.length) {
      throw new BadRequestException('Um ou mais andares inválidos');
    }

    return this.prisma.inspectionReport.create({
      data: {
        inspectorId: userId,
        buildingId: dto.buildingId,
        date: new Date(),
        startedAt: new Date(),
        floorsInspected: dto.floorIds,
        status: 'IN_PROGRESS',
      },
      include: {
        building: true,
        inspector: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async saveFloorForm(reportId: string, floorId: string, userId: string, userRole: Role, dto: SaveFloorFormDto) {
    const report = await this.prisma.inspectionReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Relatório não encontrado');

    if (userRole !== Role.ADMIN && report.inspectorId !== userId) {
      throw new ForbiddenException('Sem permissão para editar este relatório');
    }

    if (report.status === 'COMPLETED') {
      throw new BadRequestException('Relatório já finalizado');
    }

    if (!report.floorsInspected.includes(floorId)) {
      throw new BadRequestException('Andar não faz parte desta inspeção');
    }

    const existing = await this.prisma.floorFormEntry.findFirst({
      where: { reportId, floorId },
    });

    if (existing) {
      await this.prisma.formItemResponse.deleteMany({ where: { floorEntryId: existing.id } });
      await this.prisma.floorFormEntry.update({
        where: { id: existing.id },
        data: {
          statusGeral: dto.statusGeral,
          notes: dto.notes,
          photos: dto.photos || [],
          completedAt: new Date(),
          items: {
            create: dto.items.map((item) => ({
              itemName: item.itemName,
              status: item.status,
              observation: item.observation,
            })),
          },
        },
      });
      return { message: 'Andar atualizado' };
    }

    await this.prisma.floorFormEntry.create({
      data: {
        reportId,
        floorId,
        statusGeral: dto.statusGeral,
        notes: dto.notes,
        photos: dto.photos || [],
        completedAt: new Date(),
        items: {
          create: dto.items.map((item) => ({
            itemName: item.itemName,
            status: item.status,
            observation: item.observation,
          })),
        },
      },
    });

    return { message: 'Andar salvo' };
  }

  async finish(reportId: string, userId: string, userRole: Role) {
    const report = await this.prisma.inspectionReport.findUnique({
      where: { id: reportId },
      include: {
        floorEntries: { include: { items: true, floor: true } },
        building: true,
        inspector: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    if (!report) throw new NotFoundException('Relatório não encontrado');
    if (userRole !== Role.ADMIN && report.inspectorId !== userId) {
      throw new ForbiddenException();
    }
    if (report.status === 'COMPLETED') {
      throw new BadRequestException('Relatório já finalizado');
    }

    const completedFloors = report.floorEntries.map((e) => e.floorId);
    const missingFloors = report.floorsInspected.filter((id) => !completedFloors.includes(id));
    if (missingFloors.length > 0) {
      throw new BadRequestException(
        `Ainda há ${missingFloors.length} andar(es) não preenchido(s)`,
      );
    }

    const { pdfUrl, excelUrl } = await this.reportsService.generate(report as any);

    return this.prisma.inspectionReport.update({
      where: { id: reportId },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        pdfUrl,
        excelUrl,
      },
      include: {
        building: true,
        inspector: { select: { id: true, name: true, avatarUrl: true } },
        floorEntries: { include: { items: true, floor: true } },
      },
    });
  }

  async findAll(query: InspectionQueryDto, userId: string, userRole: Role) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = { status: 'COMPLETED' };

    if (userRole === Role.INSPECTOR) where.inspectorId = userId;
    if (query.inspectorId && userRole === Role.ADMIN) where.inspectorId = query.inspectorId;
    if (query.floorId) where.floorsInspected = { has: query.floorId };
    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = new Date(query.startDate);
      if (query.endDate) where.date.lte = new Date(query.endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.inspectionReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          building: { select: { id: true, name: true } },
          inspector: { select: { id: true, name: true, avatarUrl: true } },
          floorEntries: { include: { floor: { select: { id: true, label: true, number: true } } } },
        },
      }),
      this.prisma.inspectionReport.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, userId: string, userRole: Role) {
    const report = await this.prisma.inspectionReport.findUnique({
      where: { id },
      include: {
        building: true,
        inspector: { select: { id: true, name: true, avatarUrl: true } },
        floorEntries: {
          include: {
            floor: true,
            items: true,
          },
          orderBy: { floor: { order: 'desc' } },
        },
      },
    });

    if (!report) throw new NotFoundException('Relatório não encontrado');
    if (userRole === Role.INSPECTOR && report.inspectorId !== userId) {
      throw new ForbiddenException();
    }

    return report;
  }
}
