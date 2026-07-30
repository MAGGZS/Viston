import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @Get()
  get(
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('range') range?: string,
  ) {
    if (range === 'semestral' || range === 'anual') {
      return this.calendarService.getRange(range);
    }
    const now = new Date();
    return this.calendarService.getMonthly(
      parseInt(year || String(now.getFullYear())),
      parseInt(month || String(now.getMonth() + 1)),
    );
  }
}
