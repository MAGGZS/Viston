import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  // Migrations e introspecção usam a conexão direta (DIRECT_URL),
  // não o pooler — o pgbouncer não suporta os comandos DDL do migrate.
  datasource: { url: env('DIRECT_URL') },
});
