import fs from 'fs';
import os from 'os';
import path from 'path';
import { SUPABASE_ROOT_CA } from './supabaseCa';

/**
 * TLS conferido também no `prisma migrate deploy` (opt-in).
 *
 * O migrate não passa pelo `pg` de `prisma.ts`: ele roda o schema engine, um
 * binário em Rust que abre a própria conexão com `DIRECT_URL`. Nele,
 * `NODE_TLS_REJECT_UNAUTHORIZED` não vale nada (não é Node), e o padrão do
 * Prisma é `sslaccept=accept_invalid_certs`: criptografa, mas aceita qualquer
 * certificado.
 *
 * Com `PRISMA_MIGRATE_STRICT_TLS=1`, a URL ganha
 * `sslmode=require&sslcert=<CA do Supabase>&sslaccept=strict`, e o engine passa
 * a recusar quem não apresentar um certificado do Supabase para o host da URL.
 * O CA vai para um arquivo temporário porque o engine só lê `sslcert` de disco,
 * e o caminho é absoluto porque o relativo seria resolvido contra a pasta do
 * schema, não contra o diretório atual.
 *
 * É opt-in porque a conexão do engine com o Supabase não pôde ser exercitada
 * fora do Render: liga-se a variável, observa-se um build, e se o migrate
 * falhar no TLS basta apagá-la. Banco local (CI) e URL que já declare
 * `sslaccept` ou `sslcert` ficam como estão.
 */
export function withStrictMigrateTls(url: string, caDir: string = os.tmpdir()): string {
  const parsed = new URL(url);
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) return url;
  if (parsed.searchParams.has('sslaccept') || parsed.searchParams.has('sslcert')) return url;

  const caPath = path.join(caDir, 'viston-supabase-root-2021-ca.crt');
  fs.writeFileSync(caPath, SUPABASE_ROOT_CA.trim() + '\n');

  parsed.searchParams.set('sslmode', 'require');
  parsed.searchParams.set('sslcert', caPath);
  parsed.searchParams.set('sslaccept', 'strict');
  return parsed.toString();
}

export function migrateUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.DIRECT_URL;
  if (!url) return undefined;
  return env.PRISMA_MIGRATE_STRICT_TLS === '1' ? withStrictMigrateTls(url) : url;
}
