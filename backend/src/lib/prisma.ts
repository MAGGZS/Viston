import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { SUPABASE_ROOT_CA } from './supabaseCa';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * TLS com o certificado conferido contra o CA do Supabase (ver supabaseCa.ts).
 *
 * Postgres na própria máquina (CI, banco descartável de teste) não tem TLS, e
 * ali não há rede para alguém se meter no meio: a conexão vai sem criptografia.
 */
export function sslFor(hostname: string) {
  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return false;
  return { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true };
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;
  const url = new URL(connectionString);

  const pool = new Pool({
    host: url.hostname,
    port: parseInt(url.port),
    database: url.pathname.replace('/', ''),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: sslFor(url.hostname),
    max: 10,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
