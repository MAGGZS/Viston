import { Test, TestingModule } from '@nestjs/testing';
import { InspectionsService } from '../inspections.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../../reports/reports.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';

const mockPrisma = {
  building: { findUnique: jest.fn() },
  floor: { findMany: jest.fn() },
  inspectionReport: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  floorFormEntry: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  formItemResponse: { deleteMany: jest.fn() },
};

const mockReports = {
  generate: jest.fn().mockResolvedValue({ pdfUrl: 'http://pdf', excelUrl: 'http://excel' }),
};

describe('InspectionsService', () => {
  let service: InspectionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ReportsService, useValue: mockReports },
      ],
    }).compile();

    service = module.get<InspectionsService>(InspectionsService);
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('deve criar inspeção com andares válidos', async () => {
      mockPrisma.building.findUnique.mockResolvedValue({ id: 'b1', name: 'Prédio' });
      mockPrisma.floor.findMany.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }]);
      mockPrisma.inspectionReport.create.mockResolvedValue({ id: 'r1', status: 'IN_PROGRESS' });

      const result = await service.start('user1', { buildingId: 'b1', floorIds: ['f1', 'f2'] });
      expect(result).toHaveProperty('id', 'r1');
    });

    it('deve lançar NotFoundException se prédio não existir', async () => {
      mockPrisma.building.findUnique.mockResolvedValue(null);
      await expect(service.start('user1', { buildingId: 'invalid', floorIds: ['f1'] }))
        .rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se andares inválidos', async () => {
      mockPrisma.building.findUnique.mockResolvedValue({ id: 'b1' });
      mockPrisma.floor.findMany.mockResolvedValue([{ id: 'f1' }]); // só 1, pediu 2
      await expect(service.start('user1', { buildingId: 'b1', floorIds: ['f1', 'f2'] }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('finish', () => {
    const baseReport = {
      id: 'r1',
      inspectorId: 'user1',
      status: 'IN_PROGRESS',
      floorsInspected: ['f1', 'f2'],
      floorEntries: [
        { floorId: 'f1', items: [], floor: { label: '1º Andar' } },
        { floorId: 'f2', items: [], floor: { label: '2º Andar' } },
      ],
      building: { name: 'Prédio' },
      inspector: { id: 'user1', name: 'João' },
    };

    it('deve finalizar relatório quando todos os andares estão preenchidos', async () => {
      mockPrisma.inspectionReport.findUnique.mockResolvedValue(baseReport);
      mockPrisma.inspectionReport.update.mockResolvedValue({ ...baseReport, status: 'COMPLETED' });

      const result = await service.finish('r1', 'user1', Role.INSPECTOR);
      expect(mockReports.generate).toHaveBeenCalled();
      expect(mockPrisma.inspectionReport.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
    });

    it('deve lançar BadRequestException se andares faltando', async () => {
      mockPrisma.inspectionReport.findUnique.mockResolvedValue({
        ...baseReport,
        floorEntries: [{ floorId: 'f1', items: [], floor: { label: '1º Andar' } }], // falta f2
      });
      await expect(service.finish('r1', 'user1', Role.INSPECTOR))
        .rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException se relatório já finalizado', async () => {
      mockPrisma.inspectionReport.findUnique.mockResolvedValue({ ...baseReport, status: 'COMPLETED' });
      await expect(service.finish('r1', 'user1', Role.INSPECTOR))
        .rejects.toThrow(BadRequestException);
    });

    it('deve lançar ForbiddenException se inspetor tentar finalizar relatório de outro', async () => {
      mockPrisma.inspectionReport.findUnique.mockResolvedValue({ ...baseReport, inspectorId: 'other' });
      await expect(service.finish('r1', 'user1', Role.INSPECTOR))
        .rejects.toThrow(ForbiddenException);
    });

    it('ADMIN pode finalizar relatório de qualquer inspetor', async () => {
      mockPrisma.inspectionReport.findUnique.mockResolvedValue({ ...baseReport, inspectorId: 'other' });
      mockPrisma.inspectionReport.update.mockResolvedValue({ ...baseReport, status: 'COMPLETED' });

      await expect(service.finish('r1', 'admin1', Role.ADMIN)).resolves.not.toThrow();
    });
  });

  describe('findAll — RBAC', () => {
    it('INSPECTOR só vê seus próprios relatórios', async () => {
      mockPrisma.inspectionReport.findMany.mockResolvedValue([]);
      mockPrisma.inspectionReport.count.mockResolvedValue(0);

      await service.findAll({}, 'user1', Role.INSPECTOR);

      expect(mockPrisma.inspectionReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ inspectorId: 'user1' }) }),
      );
    });

    it('ADMIN vê todos os relatórios', async () => {
      mockPrisma.inspectionReport.findMany.mockResolvedValue([]);
      mockPrisma.inspectionReport.count.mockResolvedValue(0);

      await service.findAll({}, 'admin1', Role.ADMIN);

      const call = mockPrisma.inspectionReport.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('inspectorId');
    });
  });
});
