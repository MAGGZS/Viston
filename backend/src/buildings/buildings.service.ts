import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BuildingsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.building.findMany({
      include: { floors: { orderBy: { order: 'desc' } } },
    });
  }

  async findFloors(buildingId: string) {
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      include: { floors: { orderBy: { order: 'desc' } } },
    });
    if (!building) throw new NotFoundException('Prédio não encontrado');
    return building.floors;
  }
}
