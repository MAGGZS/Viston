/**
 * Seed da central de ajuda, pela linha de comando.
 *
 *   npm run seed:ajuda                          cria o que falta, sem reescrever textos
 *   npm run seed:ajuda -- --textos              também reescreve títulos e textos com os
 *                                               do roteiro (use depois de mudar a narração)
 *   npm run seed:ajuda -- --producao            autoriza escrever num banco que não é
 *                                               desta máquina (combina com --textos)
 *
 * Lê `src/data/catalogo.json` e escreve no banco do `DATABASE_URL` do
 * ambiente. Nesta máquina o `.env.local` aponta para o banco de produção, então
 * o script recusa qualquer host que não seja `localhost`, `127.0.0.1` ou `::1`
 * sem a flag `--producao`. Para testar, passe um `DATABASE_URL` local na frente
 * do comando.
 *
 * A regra do que o seed escreve e do que ele preserva está em
 * `src/services/helpSeed.service.ts`. Em produção, o mesmo seed roda pela
 * rota `POST /admin/help/sync`, que não depende de shell no Render.
 */
import dotenv from 'dotenv';
import path from 'path';
import { databaseHost, isLocalDatabaseUrl } from '../utils/localDatabase';

// Mesma escolha de arquivo do src/config.ts. Precisa vir antes do import do
// Prisma, que lê DATABASE_URL na carga do módulo; por isso os imports abaixo
// são require tardios, e não import no topo.
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const url = process.env.DATABASE_URL;
if (!isLocalDatabaseUrl(url) && !process.argv.includes('--producao')) {
  console.error(
    [
      `Seed recusado: o DATABASE_URL aponta para "${databaseHost(url)}", que não é um banco desta máquina.`,
      'Nesta máquina o .env.local aponta para o banco de produção.',
      'Para testar, passe um DATABASE_URL local na frente do comando.',
      'Para escrever nesse banco de propósito: npm run seed:ajuda -- --producao',
    ].join('\n')
  );
  process.exit(1);
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { helpSeedService } = require('../services/helpSeed.service') as typeof import('../services/helpSeed.service');
const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');

async function main() {
  const textos = process.argv.includes('--textos');
  const summary = await helpSeedService.sync({ textos });
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
