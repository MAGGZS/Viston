const { z } = require('zod');
const prisma = require('../utils/prisma');
const { AppError } = require('../utils/AppError');
const { uploadFile } = require('../utils/storage');
const { generatePdf } = require('../services/pdf.service');
const { generateExcel } = require('../services/excel.service');

const createSchema = z.object({
  buildingId: z.string().uuid(),
  floorIds: z.array(z.string().uuid()).min(1),
  date: z.string().optional(),
});

const floorEntrySchema = z.object({
  statusGeral: z.enum(['OK', 'ATENCAO', 'PROBLEMA']),
  notes: z.string().optional(),
  items: z.array(z.object({
    itemName: z.string(),
    status: z.enum(['OK', 'NOK', 'NA']),
    observation: z.string().optional(),
  })),
});

async function createInspection(req, res) {
  const { buildingId, floorIds, date } = createSchema.parse(req.body);

  const report = await prisma.inspectionReport.create({
    data: {
      inspectorId: req.user.sub,
      buildingId,
      date: date ? new Date(date) : new Date(),
      startedAt: new Date(),
      floorsInspected: floorIds,
      status: 'IN_PROGRESS',
    },
  });

  return res.status(201).json(report);
}

async function saveFloorEntry(req, res) {
  const { id: reportId, floorId } = req.params;
  const data = floorEntrySchema.parse(req.body);

  const report = await prisma.inspectionReport.findUnique({ where: { id: reportId } });
  if (!report) throw new AppError('Relatório não encontrado', 404);
  if (report.status === 'COMPLETED') throw new AppError('Relatório já finalizado', 400);
  if (report.inspectorId !== req.user.sub && req.user.role !== 'ADMIN') {
    throw new AppError('Acesso não autorizado', 403);
  }

  // Upload photos if any
  const photoUrls = [];
  if (req.files?.length) {
    for (const file of req.files) {
      const path = `inspections/${reportId}/${floorId}/${Date.now()}-${file.originalname}`;
      const url = await uploadFile('photos', path, file.buffer, file.mimetype);
      photoUrls.push(url);
    }
  }

  const entry = await prisma.floorFormEntry.upsert({
    where: { reportId_floorId: { reportId, floorId } },
    update: {
      statusGeral: data.statusGeral,
      notes: data.notes,
      photos: photoUrls.length ? photoUrls : undefined,
      completedAt: new Date(),
      items: {
        deleteMany: {},
        create: data.items.map((i) => ({
          itemName: i.itemName,
          status: i.status,
          observation: i.observation,
        })),
      },
    },
    create: {
      reportId,
      floorId,
      statusGeral: data.statusGeral,
      notes: data.notes,
      photos: photoUrls,
      completedAt: new Date(),
      items: {
        create: data.items.map((i) => ({
          itemName: i.itemName,
          status: i.status,
          observation: i.observation,
        })),
      },
    },
    include: { items: true },
  });

  return res.json(entry);
}

async function finishInspection(req, res) {
  const { id } = req.params;

  const report = await prisma.inspectionReport.findUnique({
    where: { id },
    include: {
      inspector: true,
      building: { include: { floors: true } },
      floorEntries: { include: { items: true, floor: true } },
    },
  });

  if (!report) throw new AppError('Relatório não encontrado', 404);
  if (report.status === 'COMPLETED') throw new AppError('Relatório já finalizado', 400);
  if (report.inspectorId !== req.user.sub && req.user.role !== 'ADMIN') {
    throw new AppError('Acesso não autorizado', 403);
  }

  const completedFloors = report.floorEntries.filter((e) => e.completedAt);
  if (completedFloors.length !== report.floorsInspected.length) {
    throw new AppError('Nem todos os andares selecionados foram preenchidos', 400);
  }

  const [pdfBuffer, excelBuffer] = await Promise.all([
    generatePdf(report),
    generateExcel(report),
  ]);

  const basePath = `reports/${id}`;
  const [pdfUrl, excelUrl] = await Promise.all([
    uploadFile('reports', `${basePath}/relatorio.pdf`, pdfBuffer, 'application/pdf'),
    uploadFile('reports', `${basePath}/relatorio.xlsx`, excelBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  ]);

  const updated = await prisma.inspectionReport.update({
    where: { id },
    data: { status: 'COMPLETED', finishedAt: new Date(), pdfUrl, excelUrl },
  });

  return res.json(updated);
}

async function listInspections(req, res) {
  const { page = 1, limit = 20, inspectorId, floorId, startDate, endDate } = req.query;

  const where = { status: 'COMPLETED' };
  if (inspectorId) where.inspectorId = inspectorId;
  if (floorId) where.floorsInspected = { has: floorId };
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(startDate);
    if (endDate) where.date.lte = new Date(endDate);
  }

  const [total, inspections] = await Promise.all([
    prisma.inspectionReport.count({ where }),
    prisma.inspectionReport.findMany({
      where,
      include: {
        inspector: { select: { id: true, name: true, avatarUrl: true } },
        building: { select: { id: true, name: true } },
        floorEntries: { include: { floor: { select: { id: true, label: true, number: true } } } },
      },
      orderBy: { date: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
  ]);

  return res.json({ total, page: Number(page), limit: Number(limit), data: inspections });
}

async function getInspection(req, res) {
  const report = await prisma.inspectionReport.findUnique({
    where: { id: req.params.id },
    include: {
      inspector: { select: { id: true, name: true, avatarUrl: true } },
      building: { select: { id: true, name: true } },
      floorEntries: {
        include: {
          floor: true,
          items: true,
        },
        orderBy: { floor: { order: 'asc' } },
      },
    },
  });
  if (!report) throw new AppError('Relatório não encontrado', 404);
  return res.json(report);
}

async function downloadPdf(req, res) {
  const report = await prisma.inspectionReport.findUnique({ where: { id: req.params.id } });
  if (!report?.pdfUrl) throw new AppError('PDF não disponível', 404);
  return res.redirect(report.pdfUrl);
}

async function downloadExcel(req, res) {
  const report = await prisma.inspectionReport.findUnique({ where: { id: req.params.id } });
  if (!report?.excelUrl) throw new AppError('Excel não disponível', 404);
  return res.redirect(report.excelUrl);
}

module.exports = {
  createInspection, saveFloorEntry, finishInspection,
  listInspections, getInspection, downloadPdf, downloadExcel,
};
