const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const FLOORS = [
  { number: 6, label: '6º Andar', order: 12 },
  { number: 5, label: '5º Andar', order: 11 },
  { number: 4, label: '4º Andar', order: 10 },
  { number: 3, label: '3º Andar', order: 9 },
  { number: 2, label: '2º Andar', order: 8 },
  { number: 1, label: '1º Andar', order: 7 },
  { number: 0, label: 'Térreo', order: 6 },
  { number: -1, label: 'Subsolo 1', order: 5 },
  { number: -2, label: 'Subsolo 2', order: 4 },
  { number: -3, label: 'Subsolo 3', order: 3 },
  { number: -4, label: 'Subsolo 4', order: 2 },
  { number: -5, label: 'Subsolo 5', order: 1 },
];

const CHECKLIST_ITEMS = [
  'Elétrica',
  'Hidráulica',
  'Extintores',
  'Iluminação',
  'Iluminação de emergência',
  'Sinalização',
  'Limpeza',
  'Estrutura',
  'Portas corta-fogo',
  'Câmeras de segurança',
];

async function main() {
  console.log('🌱 Seeding database...');

  const adminHash = await bcrypt.hash('admin123', 10);
  const inspectorHash = await bcrypt.hash('inspector123', 10);
  const viewerHash = await bcrypt.hash('viewer123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@viston.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@viston.com',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  const inspector1 = await prisma.user.upsert({
    where: { email: 'joao@viston.com' },
    update: {},
    create: {
      name: 'João Silva',
      email: 'joao@viston.com',
      passwordHash: inspectorHash,
      role: 'INSPECTOR',
    },
  });

  const inspector2 = await prisma.user.upsert({
    where: { email: 'maria@viston.com' },
    update: {},
    create: {
      name: 'Maria Santos',
      email: 'maria@viston.com',
      passwordHash: inspectorHash,
      role: 'INSPECTOR',
    },
  });

  await prisma.user.upsert({
    where: { email: 'viewer@viston.com' },
    update: {},
    create: {
      name: 'Carlos Viewer',
      email: 'viewer@viston.com',
      passwordHash: viewerHash,
      role: 'VIEWER',
    },
  });

  const building = await prisma.building.upsert({
    where: { id: 'building-main-001' },
    update: {},
    create: {
      id: 'building-main-001',
      name: 'Edifício Principal',
    },
  });

  const floorRecords = [];
  for (const f of FLOORS) {
    const floor = await prisma.floor.upsert({
      where: { id: `floor-${f.number}-building-main-001` },
      update: {},
      create: {
        id: `floor-${f.number}-building-main-001`,
        buildingId: building.id,
        label: f.label,
        number: f.number,
        order: f.order,
      },
    });
    floorRecords.push(floor);
  }

  // Create sample inspections for the last 30 days
  const sampleInspectors = [inspector1, inspector2, admin];
  const today = new Date();

  for (let daysAgo = 0; daysAgo < 30; daysAgo += Math.floor(Math.random() * 4) + 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - daysAgo);
    date.setHours(9, 0, 0, 0);

    const inspector = sampleInspectors[daysAgo % sampleInspectors.length];
    const selectedFloors = floorRecords.slice(0, Math.floor(Math.random() * 4) + 2);
    const finishedAt = new Date(date);
    finishedAt.setHours(11, 30, 0, 0);

    const report = await prisma.inspectionReport.create({
      data: {
        inspectorId: inspector.id,
        buildingId: building.id,
        date: date,
        startedAt: date,
        finishedAt: finishedAt,
        floorsInspected: selectedFloors.map((f) => f.id),
        status: 'COMPLETED',
      },
    });

    const statuses = ['OK', 'ATENCAO', 'PROBLEMA'];
    const itemStatuses = ['OK', 'NOK', 'NA'];

    for (const floor of selectedFloors) {
      const entry = await prisma.floorFormEntry.create({
        data: {
          reportId: report.id,
          floorId: floor.id,
          statusGeral: statuses[Math.floor(Math.random() * statuses.length)],
          notes: daysAgo % 3 === 0 ? 'Verificação de rotina sem ocorrências.' : null,
          completedAt: finishedAt,
        },
      });

      for (const itemName of CHECKLIST_ITEMS) {
        await prisma.formItemResponse.create({
          data: {
            entryId: entry.id,
            itemName,
            status: itemStatuses[Math.floor(Math.random() * itemStatuses.length)],
            observation: null,
          },
        });
      }
    }
  }

  console.log('✅ Seed completed!');
  console.log('');
  console.log('Credentials:');
  console.log('  ADMIN:     admin@viston.com     / admin123');
  console.log('  INSPECTOR: joao@viston.com      / inspector123');
  console.log('  INSPECTOR: maria@viston.com     / inspector123');
  console.log('  VIEWER:    viewer@viston.com    / viewer123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
