import { supabase } from '../lib/supabase';
import { config } from '../config';
import { logger } from '../lib/logger';

/**
 * O bucket dos vídeos da central de ajuda.
 *
 * Privado, como o das planilhas: o tutorial é material de quem usa o produto,
 * e URL pública e permanente viraria link solto em grupo de mensagem. A leitura
 * é por URL assinada, gerada por quem já passou pela sessão.
 *
 * O envio também não passa pelo Express: o admin recebe URLs assinadas de
 * upload e manda os arquivos direto ao Supabase. Um vídeo de 8 MB atravessando
 * o backend no plano gratuito do Render (memória curta, oceano entre o serviço
 * e o banco) seria o pior caminho possível para ele.
 */

/**
 * Validade da URL de leitura: quatro horas.
 *
 * Longa o bastante para a pessoa abrir o tutorial, pausar, almoçar e voltar
 * sem o vídeo quebrar no meio. Curta o bastante para que o link copiado da aba
 * do navegador não vire acesso permanente.
 */
export const READ_URL_TTL_SECONDS = 4 * 60 * 60;

/**
 * Por quanto tempo a mesma URL assinada é reaproveitada.
 *
 * Cada assinatura nova é uma URL nova, e o cache do navegador é por URL: sem
 * reaproveitar, quem abre o mesmo tutorial duas vezes baixa o vídeo duas
 * vezes. Guardando a URL em memória e entregando a mesma enquanto ela ainda
 * tiver pelo menos uma hora de vida, a segunda visita sai do cache. A hora de
 * folga é para que a URL entregue nunca expire durante quem acabou de recebê-la.
 */
const REUSE_MIN_REMAINING_MS = 60 * 60 * 1000;

const signedCache = new Map<string, { url: string; expiresAt: number }>();

function bucket() {
  return supabase.storage.from(config.supabase.bucketTutoriais);
}

/** Nada de `..`, barra no começo ou nome vazio: o caminho é sempre montado aqui. */
function assertSafePath(path: string): void {
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    throw new Error(`Caminho inválido no bucket de tutoriais: "${path}"`);
  }
}

/** Quantos níveis abaixo de `tmp/` a faxina desce: funcionalidade, envio, arquivo. */
const TMP_DEPTH = 3;

/** Itens por página na listagem do bucket. */
const LIST_PAGE = 100;

/** Quantos caminhos por chamada de remoção. */
const REMOVE_CHUNK = 100;

/** Uma pasta do bucket, todas as páginas. */
async function listDir(prefix: string): Promise<{ name: string; id: string | null; created_at?: string | null }[]> {
  const all: { name: string; id: string | null; created_at?: string | null }[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await bucket().list(prefix, { limit: LIST_PAGE, offset });
    if (error || !data) {
      throw new Error(`Falha ao listar ${prefix} no bucket de tutoriais: ${error?.message ?? 'sem resposta'}`);
    }
    all.push(...data.map((d) => ({ name: d.name, id: d.id ?? null, created_at: d.created_at ?? null })));
    if (data.length < LIST_PAGE) return all;
  }
}

export const helpStorage = {
  /**
   * URL assinada de upload para um caminho. Vale duas horas (prazo fixo do
   * Supabase), e só serve para aquele caminho exato.
   */
  async createUploadUrl(path: string): Promise<{ signedUrl: string; token: string }> {
    assertSafePath(path);
    const { data, error } = await bucket().createSignedUploadUrl(path);
    if (error || !data) {
      throw new Error(`Falha ao assinar o upload do tutorial: ${error?.message ?? 'sem resposta'}`);
    }
    return { signedUrl: data.signedUrl, token: data.token };
  },

  /**
   * Tamanho em bytes e `Content-Type` gravado do objeto, ou `null` quando ele
   * não existe. O tipo pode faltar (objeto antigo, envio sem cabeçalho): aí
   * vem `null`, e o commit recusa como tipo errado.
   */
  async info(path: string): Promise<{ size: number; contentType: string | null } | null> {
    assertSafePath(path);
    const { data, error } = await bucket().info(path);
    if (error || !data || typeof data.size !== 'number') return null;
    const meta = (data.metadata ?? {}) as Record<string, unknown>;
    const contentType = data.contentType ?? (typeof meta.mimetype === 'string' ? meta.mimetype : null);
    return { size: data.size, contentType: contentType || null };
  },

  /**
   * Esquece as URLs assinadas guardadas para estes caminhos.
   *
   * Não invalida nada no Supabase: URL assinada não se revoga, e a que já foi
   * entregue vale até expirar. O que isto garante é que nenhuma requisição
   * nova receba de novo a mesma URL; a próxima assinatura sai do zero.
   */
  forget(paths: (string | null | undefined)[]): void {
    for (const p of paths) if (p) signedCache.delete(p);
  },

  /**
   * Confere a configuração do bucket na subida do servidor.
   *
   * O bucket é criado à mão no painel do Supabase, e não por migration: o
   * schema `storage` não existe no Postgres do CI nem no PGlite, e a cadeia de
   * migrations quebraria neles. O preço é que nada garante que ele nasceu
   * privado e com teto de tamanho. Aqui se confere e se grita no log; nunca se
   * derruba a subida, pelo mesmo motivo da checagem do provedor de e-mail: o
   * resto da API não depende deste bucket.
   */
  async checkBucket(): Promise<void> {
    const name = config.supabase.bucketTutoriais;
    try {
      const { data, error } = await supabase.storage.getBucket(name);
      if (error || !data) {
        logger.warn({ bucket: name, err: error }, '[Ajuda] Bucket de tutoriais não encontrado; o envio de vídeos vai falhar');
        return;
      }
      if (data.public) {
        logger.warn({ bucket: name }, '[Ajuda] Bucket de tutoriais está PÚBLICO; os vídeos ficam abertos sem URL assinada');
      }
      if (!data.file_size_limit) {
        logger.warn({ bucket: name }, '[Ajuda] Bucket de tutoriais sem limite de tamanho por arquivo; o teto só é conferido no commit');
      }
    } catch (err) {
      logger.warn({ bucket: name, err }, '[Ajuda] Não foi possível conferir o bucket de tutoriais');
    }
  },

  async download(path: string): Promise<Buffer> {
    assertSafePath(path);
    const { data, error } = await bucket().download(path);
    if (error || !data) {
      throw new Error(`Falha ao ler ${path} do bucket de tutoriais: ${error?.message ?? 'sem resposta'}`);
    }
    return Buffer.from(await data.arrayBuffer());
  },

  async move(from: string, to: string): Promise<void> {
    assertSafePath(from);
    assertSafePath(to);
    const { error } = await bucket().move(from, to);
    if (error) throw new Error(`Falha ao mover ${from} para ${to}: ${error.message}`);
  },

  /**
   * Apaga objetos. Nunca derruba quem chamou: é usado na limpeza depois de uma
   * falha e na remoção dos arquivos antigos depois de um commit que já deu
   * certo. Nos dois casos, o que importa já aconteceu, e um objeto que sobrou
   * no bucket é lixo, não defeito. O log fica para quem quiser varrer depois.
   */
  async remove(paths: string[]): Promise<void> {
    const valid = paths.filter(Boolean);
    if (valid.length === 0) return;
    valid.forEach(assertSafePath);
    valid.forEach((p) => signedCache.delete(p));
    const { error } = await bucket().remove(valid);
    if (error) logger.error({ err: error, paths: valid }, '[Ajuda] Falha ao apagar arquivos do bucket');
  },

  /**
   * Apaga de `tmp/` os arquivos com mais de `maxAgeMs`: os envios que o admin
   * começou e não confirmou. Devolve quantos foram apagados.
   *
   * O Supabase lista uma pasta por vez, então a varredura desce pelos níveis
   * do formato `tmp/<funcionalidade>/<envio>/<arquivo>` (até três, nunca mais
   * fundo). Pasta aparece na listagem com `id` nulo; arquivo tem `id` e
   * `created_at`. Arquivo sem data legível fica: na dúvida, não se apaga.
   *
   * Lança quando a listagem falha; quem chama roda em segundo plano e só
   * registra no log. A remoção em si é a de `remove`, que nunca lança.
   */
  async cleanTmp(maxAgeMs: number, now: number = Date.now()): Promise<number> {
    const cutoff = now - maxAgeMs;
    const old: string[] = [];

    async function walk(prefix: string, depth: number): Promise<void> {
      for (const entry of await listDir(prefix)) {
        const path = `${prefix}/${entry.name}`;
        if (!entry.id) {
          if (depth < TMP_DEPTH) await walk(path, depth + 1);
          continue;
        }
        const at = Date.parse(entry.created_at ?? '');
        if (Number.isFinite(at) && at < cutoff) old.push(path);
      }
    }

    await walk('tmp', 1);
    for (let i = 0; i < old.length; i += REMOVE_CHUNK) {
      await helpStorage.remove(old.slice(i, i + REMOVE_CHUNK));
    }
    if (old.length) logger.info({ apagados: old.length }, '[Ajuda] Envios abandonados apagados de tmp/');
    return old.length;
  },

  /**
   * URLs de leitura para vários caminhos, numa ida só ao Supabase.
   *
   * Devolve `caminho -> URL` e o instante em que a primeira delas expira, que a
   * tela usa para saber quando pedir de novo. Caminho nulo é ignorado.
   */
  async signRead(paths: (string | null | undefined)[]): Promise<{ urls: Record<string, string>; expiresAt: Date | null }> {
    const now = Date.now();
    const urls: Record<string, string> = {};
    let earliest: number | null = null;
    const missing: string[] = [];

    for (const path of new Set(paths.filter((p): p is string => !!p))) {
      assertSafePath(path);
      const hit = signedCache.get(path);
      if (hit && hit.expiresAt - now > REUSE_MIN_REMAINING_MS) {
        urls[path] = hit.url;
        earliest = earliest === null ? hit.expiresAt : Math.min(earliest, hit.expiresAt);
      } else {
        missing.push(path);
      }
    }

    if (missing.length > 0) {
      const { data, error } = await bucket().createSignedUrls(missing, READ_URL_TTL_SECONDS);
      if (error || !data) {
        throw new Error(`Falha ao assinar as URLs dos tutoriais: ${error?.message ?? 'sem resposta'}`);
      }
      const expiresAt = now + READ_URL_TTL_SECONDS * 1000;
      for (const item of data) {
        if (!item.path || !item.signedUrl || item.error) continue;
        urls[item.path] = item.signedUrl;
        signedCache.set(item.path, { url: item.signedUrl, expiresAt });
        earliest = earliest === null ? expiresAt : Math.min(earliest, expiresAt);
      }
    }

    return { urls, expiresAt: earliest === null ? null : new Date(earliest) };
  },
};
