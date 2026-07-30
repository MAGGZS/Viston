import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { InspectionsService } from './inspections.service';
import { StartInspectionDto, SaveFloorFormDto, InspectionQueryDto } from './inspections.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportsService } from '../reports/reports.service';

@ApiTags('inspections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inspections')
export class InspectionsController {
  constructor(
    private inspectionsService: InspectionsService,
    private reportsService: ReportsService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.INSPECTOR)
  start(
    @CurrentUser('id') userId: string,
    @Body() dto: StartInspectionDto,
  ) {
    return this.inspectionsService.start(userId, dto);
  }

  @Patch(':id/floors/:floorId')
  @Roles(Role.ADMIN, Role.INSPECTOR)
  saveFloor(
    @Param('id') id: string,
    @Param('floorId') floorId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Body() dto: SaveFloorFormDto,
  ) {
    return this.inspectionsService.saveFloorForm(id, floorId, userId, userRole, dto);
  }

  @Post(':id/finish')
  @Roles(Role.ADMIN, Role.INSPECTOR)
  finish(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
  ) {
    return this.inspectionsService.finish(id, userId, userRole);
  }

  @Get()
  findAll(
    @Query() query: InspectionQueryDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
  ) {
    return this.inspectionsService.findAll(query, userId, userRole);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
  ) {
    return this.inspectionsService.findOne(id, userId, userRole);
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.reportsService.generatePdfBuffer(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="vistoria-${id}.pdf"`,
    });
    res.send(buffer);
  }

  @Get(':id/excel')
  async downloadExcel(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.reportsService.generateExcelBuffer(id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="vistoria-${id}.xlsx"`,
    });
    res.send(buffer);
  }
}
