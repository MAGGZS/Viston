import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BuildingsService } from './buildings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('buildings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('buildings')
export class BuildingsController {
  constructor(private buildingsService: BuildingsService) {}

  @Get()
  findAll() {
    return this.buildingsService.findAll();
  }

  @Get(':id/floors')
  findFloors(@Param('id') id: string) {
    return this.buildingsService.findFloors(id);
  }
}
