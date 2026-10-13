/**
 * Apaga os dados de demonstração. Só eles.
 *
 *   npm run seed:demo:limpar                                  contagem seca (padrão, não escreve nada)
 *   DEMO_CONFIRMAR=sim npm run seed:demo:limpar -- --apagar   apaga de verdade
 *
 * O escopo é o mesmo do seed (`demo-escopo.ts`): contas `@viston.demo` e os
 * prédios delas, com tudo o que pende deles. Quem roda o `--apagar` é o
 * proprietário, não o agente.
 *
 * Se algum prédio demo tiver conta de fora do domínio, ou algum gestor demo
 * administrar prédio de fora, o script lista e não apaga nada: alguém real se
 * misturou aos dados demo e a decisão é de uma pessoa.
 *
 * O que fica de fora: arquivos no storage do Supabase. Fotos enviadas durante
 * as gravações (bucket de fotos, listadas em `photo_assets`) e planilhas
 * geradas (`inspection_reports.excel_path`) não são apagadas por aqui; a
 * contagem seca lista os caminhos para apagar pelo painel do Supabase.
 */
import dotenv from 'dotenv';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { lerEscopoDemo, hostDoBanco } from './demo-escopo';

const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

/* eslint-disable @typescript-eslint/no-require-imports */
const { prisma } = require('../src/lib/prisma') as { prisma: PrismaClient };

async function main() {
  const apagar = process.argv.includes('--apagar');
  console.log(`Banco: ${hostDoBanco(process.env.DATABASE_URL)} · modo: ${apagar ? 'APAGAR' : 'seco (só contagem)'}`);

  const escopo = await lerEscopoDemo(prisma);
  const b = { in: escopo.buildingIds };
  const u = { in: escopo.userIds };
  const m = { in: escopo.managerIds };
  const noPredio = { floor_form_entry: { report: { building_id: b } } };

  // Em sequência, e não em paralelo: uma conexão só basta, e o pooler agradece.
  const predios = await prisma.building.findMany({ where: { id: b }, select: { id: true, name: true } });
  const andares = await prisma.floor.count({ where: { building_id: b } });
  const vistorias = await prisma.inspectionReport.count({ where: { building_id: b } });
  const chamados = await prisma.maintenanceRecord.count({ where: noPredio });
  const relatos = await prisma.ticketUpdate.count({ where: { ticket: noPredio } });
  const vinculos = await prisma.buildingMember.count({ where: { OR: [{ building_id: b }, { user_id: u }] } });
  const gestores = await prisma.buildingManager.count({ where: { OR: [{ building_id: b }, { manager_id: m }] } });
  const pedidos = await prisma.buildingAccessRequest.count({ where: { OR: [{ building_id: b }, { user_id: u }] } });
  const avisos = await prisma.notification.count({ where: { OR: [{ building_id: b }, { user_id: u }] } });
  const logs = await prisma.auditLog.count({ where: { OR: [{ building_id: b }, { user_id: u }, { manager_id: m }] } });
  const fotos = await prisma.photoAsset.findMany({ where: { building_id: b }, select: { path: true } });
  const planilhas = await prisma.inspectionReport.findMany({
    where: { building_id: b, excel_path: { not: null } },
    select: { excel_path: true },
    distinct: ['excel_path'],
  });

  console.log(
    JSON.stringify(
      {
        contas_usuario: escopo.userIds.length,
        contas_gestor: escopo.managerIds.length,
        predios: predios.map((p) => `${p.name} (${p.id})`),
        andares,
        vistorias,
        chamados,
        relatos_de_chamado: relatos,
        vinculos_de_equipe: vinculos,
        vinculos_de_gestor: gestores,
        pedidos_de_acesso: pedidos,
        avisos: avisos,
        logs_de_auditoria: logs,
        storage_nao_apagado: {
          fotos: fotos.map((f) => f.path),
          planilhas: planilhas.map((p) => p.excel_path),
        },
        mistura_com_dados_reais: escopo.alheios,
      },
      null,
      2
    )
  );

  if (escopo.alheios.length) {
    console.error('Limpeza recusada: há dados de fora do domínio demo misturados ao escopo (ver acima).');
    process.exitCode = 1;
    return;
  }
  if (!apagar) {
    console.log('Nada foi apagado. Para apagar: DEMO_CONFIRMAR=sim npm run seed:demo:limpar -- --apagar');
    return;
  }
  if (process.env.DEMO_CONFIRMAR !== 'sim') {
    console.error('Limpeza recusada: --apagar exige DEMO_CONFIRMAR=sim.');
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      // Logs primeiro: `audit_logs.user_id` é SET NULL, e o log de uma conta
      // demo não tem para que ficar sem dono.
      await tx.auditLog.deleteMany({ where: { OR: [{ building_id: b }, { user_id: u }, { manager_id: m }] } });
      await tx.notification.deleteMany({ where: { OR: [{ building_id: b }, { user_id: u }] } });
      await tx.feedback.deleteMany({ where: { OR: [{ user_id: u }, { manager_id: m }] } });
      // Prédios antes das contas de gestor: com o prédio fora, o gatilho que
      // impede prédio sem gestor não tem o que proteger.
      await tx.building.deleteMany({ where: { id: b } });
      await tx.user.deleteMany({ where: { id: u } });
      await tx.manager.deleteMany({ where: { id: m } });
    },
    { timeout: 180_000, maxWait: 30_000 }
  );

  const depois = await lerEscopoDemo(prisma);
  console.log(
    `Apagado. Restam no escopo demo: ${depois.userIds.length + depois.managerIds.length} contas, ${depois.buildingIds.length} prédios.`
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
