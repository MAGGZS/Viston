import { IsArray, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FloorGeneralStatus, ItemStatus } from '@prisma/client';

export class StartInspectionDto {
  @ApiProperty()
  @IsUUID()
  buildingId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  floorIds: string[];
}

export class FormItemDto {
  @ApiProperty()
  @IsString()
  itemName: string;

  @ApiProperty({ enum: ItemStatus })
  @IsEnum(ItemStatus)
  status: ItemStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observation?: string;
}

export class SaveFloorFormDto {
  @ApiProperty({ enum: FloorGeneralStatus })
  @IsEnum(FloorGeneralStatus)
  statusGeral: FloorGeneralStatus;

  @ApiProperty({ type: [FormItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormItemDto)
  items: FormItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  photos?: string[];
}

export class InspectionQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inspectorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  floorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;
}
