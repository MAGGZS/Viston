import dotenv from 'dotenv';
import path from 'path';

// Mesma escolha do src/config.ts: as migrations precisam do banco do ambiente em
// que se está, não do outro.
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  // Migrations e introspecção usam a conexão direta (DIRECT_URL),
  // não o pooler — o pgbouncer não suporta os comandos DDL do migrate.
  datasource: { url: env('DIRECT_URL') },
});
