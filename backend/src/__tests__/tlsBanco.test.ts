import { X509Certificate } from 'crypto';
import { sslFor } from '../lib/prisma';
import { SUPABASE_ROOT_CA } from '../lib/supabaseCa';

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
