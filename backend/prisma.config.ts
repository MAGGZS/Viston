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
  //
  // O datasource só é declarado quando DIRECT_URL existe. Gerar o client não
  // toca no banco, e `prisma generate` agora roda no `postinstall`: exigir a
  // variável aqui faria o `npm install` falhar na máquina de quem acabou de
  // clonar e ainda não tem `.env.local`. Quem for rodar migrate sem a variável
  // recebe o erro do próprio migrate, que é onde ele significa alguma coisa.
  ...(process.env.DIRECT_URL ? { datasource: { url: env('DIRECT_URL') } } : {}),
});
