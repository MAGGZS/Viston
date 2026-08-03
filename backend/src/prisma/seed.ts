import { PrismaClient, Role, InspectionStatus, FloorStatus, ItemCategory, ItemStatus, AuditAction } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const FLOORS = [
  { label: '6º Andar', order: 6 },
  { label: '5º Andar', order: 5 },
  { label: '4º Andar', order: 4 },
  { label: '3º Andar', order: 3 },
  { label: '2º Andar', order: 2 },
  { label: '1º Andar', order: 1 },
  { label: 'Térreo', order: 0 },
  { label: 'Subsolo 1', order: -1 },
  { label: 'Subsolo 2', order: -2 },
  { label: 'Subsolo 3', order: -3 },
  { label: 'Subsolo 4', order: -4 },
  { label: 'Subsolo 5', order: -5 },
];

async function main() {
  console.log('🌱 Iniciando seed...');

  // Limpar dados existentes (ordem importa por FK)
  await prisma.auditLog.deleteMany();
  await prisma.formItemResponse.deleteMany();
  await prisma.floorFormEntry.deleteMany();
  await prisma.inspectionReport.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.building.deleteMany();
  await prisma.user.deleteMany();

  // ── Usuários ──────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@123', 10);
  const inspHash = await bcrypt.hash('Inspector@123', 10);
  const viewHash = await bcrypt.hash('Viewer@123', 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Administrador',
      email: 'admin@viston.com',
      password_hash: adminHash,
      role: Role.ADMIN,
    },
  });

  const inspector1 = await prisma.user.create({
    data: {
      name: 'Carlos Inspetor',
      email: 'carlos@viston.com',
      password_hash: inspHash,
      role: Role.INSPECTOR,
    },
  });

  const inspector2 = await prisma.user.create({
    data: {
      name: 'Ana Inspetora',
      email: 'ana@viston.com',
      password_hash: inspHash,
      role: Role.INSPECTOR,
    },
  });

  await prisma.user.create({
    data: {
      name: 'Visualizador',
      email: 'viewer@viston.com',
      password_hash: viewHash,
      role: Role.VIEWER,
    },
  });

  console.log('✅ Usuários criados');

  // ── Prédio + 12 andares fixos ─────────────────────────────────────────────
  const building = await prisma.building.create({
    data: { name: 'Edifício Principal' },
  });

  const floors = await Promise.all(
    FLOORS.map((f) =>
      prisma.floor.create({
        data: { building_id: building.id, label: f.label, order: f.order },
      })
    )
  );

  console.log('✅ Prédio e 12 andares criados');

  // ── Inspeção COMPLETED (exemplo completo) ─────────────────────────────────
  const completedReport = await prisma.inspectionReport.create({
    data: {
      inspector_id: inspector1.id,
      building_id: building.id,
      date: new Date('2024-01-15'),
      started_at: new Date('2024-01-15T08:00:00Z'),
      finished_at: new Date('2024-01-15T10:30:00Z'),
      floors_inspected: [floors[0].id, floors[1].id, floors[6].id], // 6º, 5º, Térreo
      status: InspectionStatus.COMPLETED,
      google_form_synced: true,
      google_form_synced_at: new Date('2024-01-15T10:31:00Z'),
    },
  });

  // Criar FloorFormEntry + FormItemResponse para cada andar do relatório completo
  const completedFloors = [floors[0], floors[1], floors[6]];
  for (const floor of completedFloors) {
    const entry = await prisma.floorFormEntry.create({
      data: {
        report_id: completedReport.id,
        floor_id: floor.id,
        status_geral: FloorStatus.OK,
        observations: ['Tudo em ordem neste andar.'],
        photos: [],
      },
    });

    await prisma.formItemResponse.createMany({
      data: [
        // MANUTENCAO
        { floor_form_entry_id: entry.id, category: ItemCategory.MANUTENCAO, item_name: 'Cadeiras', has_item: true, quantity: 10, is_marked: true },
        { floor_form_entry_id: entry.id, category: ItemCategory.MANUTENCAO, item_name: 'Tomadas', has_item: true, quantity: 4, is_marked: false },
        { floor_form_entry_id: entry.id, category: ItemCategory.MANUTENCAO, item_name: 'Ar-condicionado', status: ItemStatus.OK },
        { floor_form_entry_id: entry.id, category: ItemCategory.MANUTENCAO, item_name: 'Mesas', has_item: true, quantity: 5, is_marked: true },
        { floor_form_entry_id: entry.id, category: ItemCategory.MANUTENCAO, item_name: 'Portas', status: ItemStatus.OK },
        // LIMPEZA
        { floor_form_entry_id: entry.id, category: ItemCategory.LIMPEZA, item_name: 'Carpete', status: ItemStatus.OK },
        { floor_form_entry_id: entry.id, category: ItemCategory.LIMPEZA, item_name: 'Vidros', status: ItemStatus.OK },
        { floor_form_entry_id: entry.id, category: ItemCategory.LIMPEZA, item_name: 'Cadeiras', has_item: true, quantity: 10, is_marked: true },
      ],
    });
  }

  console.log('✅ Inspeção COMPLETED criada');

  // ── Inspeção IN_PROGRESS (parcial — só 1 andar preenchido de 3) ───────────
  const inProgressReport = await prisma.inspectionReport.create({
    data: {
      inspector_id: inspector2.id,
      building_id: building.id,
      date: new Date(),
      floors_inspected: [floors[2].id, floors[3].id, floors[4].id], // 4º, 3º, 2º
      status: InspectionStatus.IN_PROGRESS,
    },
  });

  const partialEntry = await prisma.floorFormEntry.create({
    data: {
      report_id: inProgressReport.id,
      floor_id: floors[2].id,
      status_geral: FloorStatus.ATENCAO,
      observations: ['Ar-condicionado com ruído.'],
      photos: [],
    },
  });

  await prisma.formItemResponse.createMany({
    data: [
      { floor_form_entry_id: partialEntry.id, category: ItemCategory.MANUTENCAO, item_name: 'Cadeiras', has_item: true, quantity: 8, is_marked: false },
      { floor_form_entry_id: partialEntry.id, category: ItemCategory.MANUTENCAO, item_name: 'Tomadas', has_item: false },
      { floor_form_entry_id: partialEntry.id, category: ItemCategory.MANUTENCAO, item_name: 'Ar-condicionado', status: ItemStatus.NOK },
      { floor_form_entry_id: partialEntry.id, category: ItemCategory.MANUTENCAO, item_name: 'Mesas', has_item: true, quantity: 4, is_marked: true },
      { floor_form_entry_id: partialEntry.id, category: ItemCategory.MANUTENCAO, item_name: 'Portas', status: ItemStatus.OK },
      { floor_form_entry_id: partialEntry.id, category: ItemCategory.LIMPEZA, item_name: 'Carpete', status: ItemStatus.NA },
      { floor_form_entry_id: partialEntry.id, category: ItemCategory.LIMPEZA, item_name: 'Vidros', status: ItemStatus.OK },
      { floor_form_entry_id: partialEntry.id, category: ItemCategory.LIMPEZA, item_name: 'Cadeiras', has_item: true, quantity: 8, is_marked: false },
    ],
  });

  console.log('✅ Inspeção IN_PROGRESS criada');

  // ── Segunda inspeção COMPLETED (sync pendente) ────────────────────────────
  const completedReport2 = await prisma.inspectionReport.create({
    data: {
      inspector_id: inspector1.id,
      building_id: building.id,
      date: new Date('2024-01-20'),
      started_at: new Date('2024-01-20T09:00:00Z'),
      finished_at: new Date('2024-01-20T11:00:00Z'),
      floors_inspected: [floors[5].id], // 1º andar
      status: InspectionStatus.COMPLETED,
      google_form_synced: false,
    },
  });

  const entry2 = await prisma.floorFormEntry.create({
    data: {
      report_id: completedReport2.id,
      floor_id: floors[5].id,
      status_geral: FloorStatus.PROBLEMA,
      observations: ['Porta danificada.', 'Vidro quebrado.'],
      photos: [],
    },
  });

  await prisma.formItemResponse.createMany({
    data: [
      { floor_form_entry_id: entry2.id, category: ItemCategory.MANUTENCAO, item_name: 'Cadeiras', has_item: true, quantity: 6, is_marked: false },
      { floor_form_entry_id: entry2.id, category: ItemCategory.MANUTENCAO, item_name: 'Tomadas', has_item: true, quantity: 2, is_marked: true },
      { floor_form_entry_id: entry2.id, category: ItemCategory.MANUTENCAO, item_name: 'Ar-condicionado', status: ItemStatus.OK },
      { floor_form_entry_id: entry2.id, category: ItemCategory.MANUTENCAO, item_name: 'Mesas', has_item: false },
      { floor_form_entry_id: entry2.id, category: ItemCategory.MANUTENCAO, item_name: 'Portas', status: ItemStatus.NOK },
      { floor_form_entry_id: entry2.id, category: ItemCategory.LIMPEZA, item_name: 'Carpete', status: ItemStatus.OK },
      { floor_form_entry_id: entry2.id, category: ItemCategory.LIMPEZA, item_name: 'Vidros', status: ItemStatus.NOK },
      { floor_form_entry_id: entry2.id, category: ItemCategory.LIMPEZA, item_name: 'Cadeiras', has_item: true, quantity: 6, is_marked: false },
    ],
  });

  // Audit log de falha de sync
  await prisma.auditLog.create({
    data: {
      user_id: inspector1.id,
      action: AuditAction.SYNC_GOOGLE_FORM_FAILED,
      entity: 'InspectionReport',
      entity_id: completedReport2.id,
      metadata: { error: 'Google Forms timeout (seed example)' },
    },
  });

  console.log('✅ Segunda inspeção COMPLETED (sync pendente) criada');

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('\n📋 Credenciais de acesso:');
  console.log('  ADMIN:     admin@viston.com     / Admin@123');
  console.log('  INSPECTOR: carlos@viston.com    / Inspector@123');
  console.log('  INSPECTOR: ana@viston.com       / Inspector@123');
  console.log('  VIEWER:    viewer@viston.com    / Viewer@123');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
