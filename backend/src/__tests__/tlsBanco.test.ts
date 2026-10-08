import { X509Certificate } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sslFor } from '../lib/prisma';
import { SUPABASE_ROOT_CA } from '../lib/supabaseCa';
import { migrateUrl, withStrictMigrateTls } from '../lib/migrateTls';

describe('TLS da conexão com o banco', () => {
  it('no Supabase, confere o certificado contra o CA do Supabase', () => {
    expect(sslFor('aws-0-sa-east-1.pooler.supabase.com')).toEqual({
      ca: SUPABASE_ROOT_CA,
      rejectUnauthorized: true,
    });
  });

  it('Postgres local (CI, banco de teste) vai sem TLS', () => {
    expect(sslFor('localhost')).toBe(false);
    expect(sslFor('127.0.0.1')).toBe(false);
  });

  it('o CA embutido é o raiz do Supabase e ainda vale', () => {
    const cert = new X509Certificate(SUPABASE_ROOT_CA);
    expect(cert.subject).toContain('CN=Supabase Root 2021 CA');
    expect(new Date(cert.validTo).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('TLS do prisma migrate (DIRECT_URL)', () => {
  const remota = 'postgresql://postgres.ref:se%40nha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';

  it('sem a variável, devolve o DIRECT_URL intacto', () => {
    expect(migrateUrl({ DIRECT_URL: remota } as NodeJS.ProcessEnv)).toBe(remota);
    expect(migrateUrl({} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('com PRISMA_MIGRATE_STRICT_TLS=1, exige TLS e confere contra o CA gravado em disco', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viston-ca-'));
    const url = new URL(withStrictMigrateTls(remota, dir));
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('sslaccept')).toBe('strict');
    const caPath = url.searchParams.get('sslcert')!;
    expect(path.isAbsolute(caPath)).toBe(true);
    expect(fs.readFileSync(caPath, 'utf8').trim()).toBe(SUPABASE_ROOT_CA.trim());
    // credenciais e host não mudam
    expect(url.password).toBe('se%40nha');
    expect(url.host).toBe('aws-0-sa-east-1.pooler.supabase.com:5432');
  });

  it('não mexe em banco local nem em URL que já escolheu o próprio TLS', () => {
    const local = 'postgresql://ci:ci@localhost:5432/ci?schema=public';
    expect(withStrictMigrateTls(local)).toBe(local);
    const propria = remota + '?sslaccept=accept_invalid_certs';
    expect(withStrictMigrateTls(propria)).toBe(propria);
  });
});
