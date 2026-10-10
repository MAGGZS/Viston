// O bucket dos tutoriais visto de perto: o cliente do Supabase sai de cena, e
// o alvo é o que o `helpStorage` faz com as respostas dele. As suítes de rota
// mockam o `helpStorage` inteiro e não enxergam nada disto.
const fake = {
  getBucket: jest.fn(),
  info: jest.fn(),
  createSignedUrls: jest.fn(),
  list: jest.fn(),
  remove: jest.fn(),
};

jest.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      getBucket: (...args: unknown[]) => fake.getBucket(...args),
      from: () => ({
        info: (...args: unknown[]) => fake.info(...args),
        createSignedUrls: (...args: unknown[]) => fake.createSignedUrls(...args),
        list: (...args: unknown[]) => fake.list(...args),
        remove: (...args: unknown[]) => fake.remove(...args),
      }),
    },
  },
}));

import { helpStorage } from '../services/helpStorage.service';
import { logger } from '../lib/logger';

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined as never);
});

afterEach(() => warn.mockRestore());

describe('conferência do bucket na subida', () => {
  const avisos = () => warn.mock.calls.map((c) => String(c[1]));

  it('privado e com teto: nenhum aviso', async () => {
    fake.getBucket.mockResolvedValue({ data: { public: false, file_size_limit: 8388608 }, error: null });
    await helpStorage.checkBucket();
    expect(warn).not.toHaveBeenCalled();
  });

  it('público e sem teto: dois avisos, sem derrubar nada', async () => {
    fake.getBucket.mockResolvedValue({ data: { public: true, file_size_limit: null }, error: null });
    await expect(helpStorage.checkBucket()).resolves.toBeUndefined();
    expect(avisos()).toEqual([expect.stringContaining('PÚBLICO'), expect.stringContaining('sem limite')]);
  });

  it('bucket que não existe, ou Supabase fora do ar: só avisa', async () => {
    fake.getBucket.mockResolvedValue({ data: null, error: { message: 'Bucket not found' } });
    await expect(helpStorage.checkBucket()).resolves.toBeUndefined();
    fake.getBucket.mockRejectedValue(new Error('ECONNRESET'));
    await expect(helpStorage.checkBucket()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('info do objeto', () => {
  it('devolve tamanho e Content-Type gravado', async () => {
    fake.info.mockResolvedValue({ data: { size: 10, contentType: 'video/mp4' }, error: null });
    await expect(helpStorage.info('tmp/a/b/video.mp4')).resolves.toEqual({ size: 10, contentType: 'video/mp4' });
  });

  it('cai para o mimetype dos metadados, e nulo quando não há tipo', async () => {
    fake.info.mockResolvedValue({ data: { size: 10, metadata: { mimetype: 'image/jpeg' } }, error: null });
    await expect(helpStorage.info('tmp/a/b/capa.jpg')).resolves.toEqual({ size: 10, contentType: 'image/jpeg' });
    fake.info.mockResolvedValue({ data: { size: 10 }, error: null });
    await expect(helpStorage.info('tmp/a/b/capa.jpg')).resolves.toEqual({ size: 10, contentType: null });
  });

  it('objeto que não existe é nulo', async () => {
    fake.info.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    await expect(helpStorage.info('tmp/a/b/capa.jpg')).resolves.toBeNull();
  });
});

describe('cache das URLs assinadas', () => {
  it('depois de esquecer, a próxima leitura assina de novo', async () => {
    let n = 0;
    fake.createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://assinada/${path}?v=${++n}`, error: null })),
      error: null,
    }));
    const path = 'pasta/func/up/video.mp4';
    const primeira = (await helpStorage.signRead([path])).urls[path];
    expect((await helpStorage.signRead([path])).urls[path]).toBe(primeira);

    helpStorage.forget([path, null]);
    const depois = (await helpStorage.signRead([path])).urls[path];
    expect(depois).not.toBe(primeira);
    expect(fake.createSignedUrls).toHaveBeenCalledTimes(2);
  });
});

describe('faxina dos envios abandonados em tmp/', () => {
  const AGORA = Date.parse('2026-10-10T12:00:00Z');
  const DIA = 24 * 60 * 60 * 1000;
  const pasta = (name: string) => ({ name, id: null, created_at: null });
  const arquivo = (name: string, created_at: string | null) => ({ name, id: `id-${name}`, created_at });

  /** O bucket como o Supabase lista: uma pasta por chamada. */
  function bucketCom(conteudo: Record<string, unknown[]>) {
    fake.list.mockImplementation(async (prefix: string) => ({ data: conteudo[prefix] ?? [], error: null }));
    fake.remove.mockResolvedValue({ data: [], error: null });
  }

  it('apaga só os arquivos com mais de 24 horas, descendo pelos níveis do formato', async () => {
    bucketCom({
      tmp: [pasta('func-a'), pasta('func-b')],
      'tmp/func-a': [pasta('envio-velho'), pasta('envio-novo')],
      'tmp/func-a/envio-velho': [
        arquivo('video.mp4', '2026-10-08T12:00:00Z'),
        arquivo('passos.json', '2026-10-09T11:59:00Z'),
      ],
      'tmp/func-a/envio-novo': [arquivo('video.mp4', '2026-10-10T11:00:00Z')],
      'tmp/func-b': [pasta('envio-sem-data')],
      'tmp/func-b/envio-sem-data': [arquivo('capa.jpg', null)],
    });

    await expect(helpStorage.cleanTmp(DIA, AGORA)).resolves.toBe(2);
    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledWith([
      'tmp/func-a/envio-velho/video.mp4',
      'tmp/func-a/envio-velho/passos.json',
    ]);
  });

  it('tmp/ vazio não chama a remoção', async () => {
    bucketCom({});
    await expect(helpStorage.cleanTmp(DIA, AGORA)).resolves.toBe(0);
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it('pagina a listagem de 100 em 100', async () => {
    const muitas = Array.from({ length: 150 }, (_, i) => arquivo(`f${i}.mp4`, '2026-10-01T00:00:00Z'));
    fake.list.mockImplementation(async (prefix: string, opts: { limit: number; offset: number }) => ({
      data: prefix === 'tmp' ? muitas.slice(opts.offset, opts.offset + opts.limit) : [],
      error: null,
    }));
    fake.remove.mockResolvedValue({ data: [], error: null });
    await expect(helpStorage.cleanTmp(DIA, AGORA)).resolves.toBe(150);
    expect(fake.list).toHaveBeenCalledTimes(2);
    expect(fake.remove.mock.calls.map((c) => c[0].length)).toEqual([100, 50]);
  });

  it('listagem que falha lança, e nada é apagado', async () => {
    fake.list.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(helpStorage.cleanTmp(DIA, AGORA)).rejects.toThrow('Falha ao listar tmp');
    expect(fake.remove).not.toHaveBeenCalled();
  });
});
