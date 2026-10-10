import { featuresUpdate, startsUpdate, stepsUpdate } from '../repositories/help.repository';
import { databaseHost, isLocalDatabaseUrl } from '../utils/localDatabase';

// Os UPDATE em lote da central de ajuda e a trava do seed pela linha de
// comando. O SQL é conferido pela forma (uma instrução só, todo valor como
// parâmetro). A execução foi conferida à mão num Postgres de verdade (PGlite),
// com as colunas da migration `central_de_ajuda`: a suíte não tem banco.

const espaco = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('UPDATE em lote', () => {
  it('os tempos das abas vão num UPDATE só, casados pela ordem', () => {
    const q = startsUpdate('feat-1', [0, 5.5, 10]);
    expect(espaco(q.text)).toMatch(/^UPDATE "help_steps" AS st SET "start_s" = v\.start_s, "updated_at" = NOW\(\) FROM \(VALUES/);
    expect(q.text.match(/UPDATE/g)).toHaveLength(1);
    expect(q.values).toEqual([1, 0, 2, 5.5, 3, 10, 'feat-1']);
  });

  it('título e texto das abas vão como parâmetro, nunca no texto do SQL', () => {
    const malicioso = "'); DROP TABLE help_steps; --";
    const q = stepsUpdate([
      { id: 'a', data: { title: malicioso, body: 'b1' } },
      { id: 'b', data: { title: 't2', body: 'b2' } },
    ]);
    expect(q.text).not.toContain('DROP');
    expect(q.values).toEqual(['a', malicioso, 'b1', 'b', 't2', 'b2']);
    expect(q.text.match(/UPDATE/g)).toHaveLength(1);
  });

  it('a funcionalidade muda só o que veio; o resto vai nulo e o COALESCE mantém', () => {
    const q = featuresUpdate([
      { id: 'f1', data: { title: 'Novo' } },
      { id: 'f2', data: { folder_id: 'pasta-2', device: 'DESKTOP' } },
    ]);
    expect(q.values).toEqual(['f1', null, null, 'Novo', 'f2', 'pasta-2', 'DESKTOP', null]);
    expect(espaco(q.text)).toContain('"device" = COALESCE(v.device::"HelpDevice", fe."device")');
  });
});

describe('trava do seed pela linha de comando', () => {
  it.each([
    'postgresql://ci:ci@localhost:5432/ci?schema=public',
    'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
    'postgresql://u:p@[::1]:5432/db',
    'postgres://u:p@LOCALHOST/db',
  ])('%s é local', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([
    'postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres',
    'postgresql://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
    'postgresql://u:p@localhost.exemplo.com/db',
    'isto não é URL',
    '',
    undefined,
  ])('%s não é local', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });

  it('a mensagem mostra só o host, nunca a senha', () => {
    expect(databaseHost('postgresql://u:segredo@db.x.supabase.co:5432/postgres')).toBe('db.x.supabase.co');
    expect(databaseHost(undefined)).toBe('(DATABASE_URL vazio)');
  });
});
