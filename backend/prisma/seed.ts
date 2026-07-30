import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const FLOORS = [
  { number: 6, label: '6º Andar', order: 11 },
  { number: 5, label: '5º Andar', order: 10 },
  { number: 4, label: '4º Andar', order: 9 },
  { number: 3, label: '3º Andar', order: 8 },
  { number: 2, label: '2º Andar', order: 7 },
  { number: 1, label: '1º Andar', order: 6 },
  { number: 0, label: 'Térreo', order: 5 },
  { number: -1, label: 'Subsolo 1', order: 4 },
  { number: -2, label: 'Subsolo 2', order: 3 },
  { number: -3, label: 'Subsolo 3', order: 2 },
  { number: -4, label: 'Subsolo 4', order: 1 },
  { number: -5, label: 'Subsolo 5', order: 0 },
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
  console.log('🌱 Iniciando seed...');

  const adminHash = await bcrypt.hash('Admin@123', 10);
  const inspectorHash = await bcrypt.hash('Inspector@123', 10);
  const viewerHash = await bcrypt.hash('Viewer@123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@viston.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@viston.com',
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });

  const inspector1 = await prisma.user.upsert({
    where: { email: 'joao.silva@viston.com' },
    update: {},
    create: {
      name: 'João Silva',
      email: 'joao.silva@viston.com',
      passwordHash: inspectorHash,
      role: Role.INSPECTOR,
    },
  });

  const inspector2 = await prisma.user.upsert({
    where: { email: 'maria.santos@viston.com' },
    update: {},
    create: {
      name: 'Maria Santos',
      email: 'maria.santos@viston.com',
      passwordHash: inspectorHash,
      role: Role.INSPECTOR,
    },
  });

  await prisma.user.upsert({
    where: { email: 'viewer@viston.com' },
    update: {},
    create: {
      name: 'Visualizador',
      email: 'viewer@viston.com',
      passwordHash: viewerHash,
      role: Role.VIEWER,
    },
  });

  const building = await prisma.building.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Edifício Central',
    },
  });

  const floors = [];
  for (const f of FLOORS) {
    const floor = await prisma.floor.upsert({
      where: { id: `00000000-0000-0000-0000-0000000000${String(f.order).padStart(2, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0000-0000000000${String(f.order).padStart(2, '0')}`,
        buildingId: building.id,
        label: f.label,
        number: f.number,
        order: f.order,
      },
    });
    floors.push(floor);
  }

  // Criar algumas inspeções de exemplo dos últimos 30 dias
  const inspectors = [inspector1, inspector2, admin];
  const today = new Date();

  for (let i = 0; i < 8; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(8 + Math.floor(Math.random() * 4), 0, 0, 0);

    const inspector = inspectors[i % inspectors.length];
    const selectedFloors = floors.slice(0, 3 + (i % 4));

    const report = await prisma.inspectionReport.create({
      data: {
        inspectorId: inspector.id,
        buildingId: building.id,
        date: date,
        startedAt: date,
        finishedAt: new Date(date.getTime() + 2 * 60 * 60 * 1000),
        floorsInspected: selectedFloors.map((f) => f.id),
        status: 'COMPLETED',
      },
    });

    for (const floor of selectedFloors) {
      const statuses = ['OK', 'ATENCAO', 'PROBLEMA'] as const;
      const entry = await prisma.floorFormEntry.create({
        data: {
          reportId: report.id,
          floorId: floor.id,
          statusGeral: statuses[Math.floor(Math.random() * statuses.length)],
          notes: i % 3 === 0 ? 'Verificação de rotina realizada sem intercorrências.' : null,
          photos: [],
          completedAt: new Date(date.getTime() + 30 * 60 * 1000),
        },
      });

      for (const itemName of CHECKLIST_ITEMS) {
        const itemStatuses = ['OK', 'NOK', 'NA'] as const;
        await prisma.formItemResponse.create({
          data: {
            floorEntryId: entry.id,
            itemName,
            status: itemStatuses[Math.floor(Math.random() * itemStatuses.length)],
            observation: null,
          },
        });
      }
    }
  }

  console.log('✅ Seed concluído!');
  console.log('');
  console.log('👤 Usuários criados:');
  console.log('   ADMIN     → admin@viston.com       / Admin@123');
  console.log('   INSPECTOR → joao.silva@viston.com  / Inspector@123');
  console.log('   INSPECTOR → maria.santos@viston.com / Inspector@123');
  console.log('   VIEWER    → viewer@viston.com       / Viewer@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
