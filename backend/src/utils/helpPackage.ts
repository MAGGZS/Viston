import { z } from 'zod';

/**
 * A conferência do pacote de vídeo de um tutorial, arquivo por arquivo.
 *
 * Tudo aqui é função pura sobre bytes: nada de banco nem de bucket. É o que
 * deixa testar "MIME falso" e "tamanho acima do limite" com um Buffer feito à
 * mão, e é o que deixa o serviço de commit ler como uma lista de passos.
 *
 * O tipo do arquivo é conferido pelos primeiros bytes (a "assinatura"), e
 * nunca pelo nome nem pelo `Content-Type` que o navegador mandou: os dois são
 * escolha de quem envia. Um `.mp4` que é um PNG renomeado passaria pelos dois
 * e quebraria o player de todo mundo que abrisse o tutorial.
 */

/** Os quatro arquivos do pacote, com o nome exato do contrato. */
export const PACKAGE_FILES = ['video.mp4', 'legenda.vtt', 'capa.jpg', 'passos.json'] as const;
export type PackageFile = (typeof PACKAGE_FILES)[number];

const MB = 1024 * 1024;

/**
 * Teto de cada arquivo, em bytes.
 *
 * Vídeo e capa vêm do contrato do pacote (8 MB e 300 KB). Legenda e passos não
 * têm teto no contrato; os daqui são folgados para o que um vídeo de dois
 * minutos produz e existem só para que um arquivo errado (um vídeo renomeado
 * para `.vtt`) não seja baixado inteiro para a memória antes de ser recusado.
 */
export const PACKAGE_LIMITS: Record<PackageFile, number> = {
  'video.mp4': 8 * MB,
  'legenda.vtt': 512 * 1024,
  'capa.jpg': 300 * 1024,
  'passos.json': 64 * 1024,
};

/** O `Content-Type` com que cada arquivo é gravado e servido. */
export const PACKAGE_CONTENT_TYPES: Record<PackageFile, string> = {
  'video.mp4': 'video/mp4',
  'legenda.vtt': 'text/vtt',
  'capa.jpg': 'image/jpeg',
  'passos.json': 'application/json',
};

/**
 * Um defeito do pacote, com o arquivo e uma frase para o admin.
 *
 * Não é `AppError`: quem decide o código HTTP é o serviço. Aqui só se diz o que
 * está errado.
 */
export class PackageProblem extends Error {
  constructor(
    public readonly file: PackageFile,
    message: string
  ) {
    super(message);
    this.name = 'PackageProblem';
  }
}

/** "8 MB", "300 KB", "1,5 MB": o tamanho como o admin lê. */
export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1).replace('.0', '').replace('.', ',')} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export function checkSize(file: PackageFile, bytes: number): void {
  const limit = PACKAGE_LIMITS[file];
  if (bytes > limit) {
    throw new PackageProblem(
      file,
      `O arquivo ${file} tem ${formatBytes(bytes)}, acima do limite de ${formatBytes(limit)}.`
    );
  }
  if (bytes === 0) throw new PackageProblem(file, `O arquivo ${file} está vazio.`);
}

/**
 * O `Content-Type` com que o objeto foi gravado no bucket.
 *
 * Os bytes já dizem o que o arquivo é (ver `checkVideo` e vizinhos), mas não
 * dizem com que tipo o Supabase vai servi-lo: é o tipo gravado no envio que
 * volta no cabeçalho de quem abre a URL assinada. Uma capa gravada como
 * `text/html` seria servida como página. Parâmetros (`; charset=utf-8`) e caixa
 * não contam.
 */
export function checkContentType(file: PackageFile, contentType: string | null | undefined): void {
  const expected = PACKAGE_CONTENT_TYPES[file];
  const got = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (got !== expected) {
    throw new PackageProblem(
      file,
      `O arquivo ${file} foi enviado como "${got || 'sem tipo'}", e precisa ser ${expected}. Envie o pacote de novo pela tela.`
    );
  }
}

/**
 * MP4 com vídeo H.264 e áudio AAC.
 *
 * A assinatura é a caixa `ftyp` nos bytes 4 a 7, que todo arquivo da família
 * ISO (MP4, MOV, M4A) tem logo no começo. Os codecs saem das entradas de amostra
 * dentro do `moov`: `avc1` (ou `avc3`) para H.264 e `mp4a` para AAC. Procurar
 * os quatro caracteres no arquivo inteiro, e não percorrer as caixas, é de
 * propósito: o vídeo tem no máximo 8 MB, a busca é instantânea, e um parser de
 * caixas seria código a manter por uma diferença que não muda a decisão.
 */
export function checkVideo(buffer: Buffer): void {
  if (buffer.length < 12 || buffer.toString('latin1', 4, 8) !== 'ftyp') {
    throw new PackageProblem('video.mp4', 'O arquivo video.mp4 não é um vídeo MP4.');
  }
  const hasH264 = buffer.includes('avc1', 0, 'latin1') || buffer.includes('avc3', 0, 'latin1');
  const hasAac = buffer.includes('mp4a', 0, 'latin1');
  if (!hasH264) {
    throw new PackageProblem('video.mp4', 'O vídeo precisa estar em H.264. Gere o pacote de novo.');
  }
  if (!hasAac) {
    throw new PackageProblem('video.mp4', 'O áudio do vídeo precisa estar em AAC. Gere o pacote de novo.');
  }
}

/** JPEG começa com FF D8 FF, seja JFIF, EXIF ou sem cabeçalho de aplicação. */
export function checkPoster(buffer: Buffer): void {
  if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new PackageProblem('capa.jpg', 'O arquivo capa.jpg não é uma imagem JPEG.');
  }
}

const TIMESTAMP = String.raw`(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})`;
const CUE_TIMING = new RegExp(`^${TIMESTAMP}[ \\t]+-->[ \\t]+${TIMESTAMP}(?:[ \\t].*)?$`);

function seconds(h: string | undefined, m: string, s: string, ms: string): number {
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

/**
 * WebVTT válido o bastante para o navegador mostrar.
 *
 * Confere o que, faltando, faz a legenda sumir sem erro nenhum na tela: o
 * cabeçalho `WEBVTT` na primeira linha, UTF-8 válido, pelo menos uma deixa, e
 * cada deixa terminando depois de começar. Estilo, região e posição não são
 * conferidos: errados, eles só deixam a legenda feia.
 */
export function checkCaptions(buffer: Buffer): void {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new PackageProblem('legenda.vtt', 'A legenda não está em UTF-8.');
  }
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  if (!/^WEBVTT(?:[ \t].*)?$/.test(lines[0] ?? '')) {
    throw new PackageProblem('legenda.vtt', 'A legenda não é WebVTT: a primeira linha precisa ser WEBVTT.');
  }

  let cues = 0;
  for (const line of lines) {
    if (!line.includes('-->')) continue;
    const m = line.trim().match(CUE_TIMING);
    if (!m) {
      throw new PackageProblem('legenda.vtt', `A legenda tem um tempo inválido: "${line.trim().slice(0, 60)}".`);
    }
    const start = seconds(m[1], m[2], m[3], m[4]);
    const end = seconds(m[5], m[6], m[7], m[8]);
    if (end <= start) {
      throw new PackageProblem('legenda.vtt', `A legenda tem uma fala que termina antes de começar: "${line.trim()}".`);
    }
    cues += 1;
  }
  if (cues === 0) throw new PackageProblem('legenda.vtt', 'A legenda não tem nenhuma fala.');
}

/**
 * Os tetos do `passos.json`.
 *
 * O vídeo do contrato tem cerca de dois minutos; dez é folga de sobra e ainda
 * barra o absurdo. Abas e textos seguem o que o PATCH da aba aceita (título de
 * 120, texto de 2000): um pacote não pode gravar o que a tela não deixaria
 * escrever.
 */
export const STEPS_LIMITS = {
  duracao_s: 600,
  abas: 50,
  slug: 100,
  titulo: 120,
  texto: 2000,
} as const;

/**
 * O `passos.json` do contrato. Campos a mais são ignorados.
 *
 * `.finite()` em todo número: o `JSON.parse` lê `1e400` como `Infinity`, e o
 * zod aceita `Infinity` como número. Sem isto, uma duração infinita passaria
 * por "positiva" e qualquer tempo de aba caberia nela.
 */
const stepsSchema = z.object({
  pasta: z.string().min(1).max(STEPS_LIMITS.slug),
  id: z.string().min(1).max(STEPS_LIMITS.slug),
  script_hash: z.string().regex(/^[0-9a-f]{64}$/, 'script_hash precisa ser SHA-256 em hexadecimal'),
  duracao_s: z.number().finite().positive().max(STEPS_LIMITS.duracao_s),
  abas: z
    .array(
      z.object({
        ordem: z.number().int().min(1),
        titulo: z.string().max(STEPS_LIMITS.titulo),
        texto: z.string().max(STEPS_LIMITS.texto),
        inicio_s: z.number().finite().min(0),
      })
    )
    .min(1)
    .max(STEPS_LIMITS.abas),
});

export type PackageSteps = z.infer<typeof stepsSchema>;

/**
 * Lê e confere o `passos.json`, sem olhar para a funcionalidade de destino.
 *
 * O que se confere aqui é a coerência interna: abas em ordem 1, 2, 3...,
 * tempos que não voltam e que cabem no vídeo. Se o pacote é desta
 * funcionalidade, e se tem o mesmo número de abas, é pergunta do serviço, que
 * conhece o destino.
 */
export function parseSteps(buffer: Buffer): PackageSteps {
  let raw: unknown;
  try {
    raw = JSON.parse(buffer.toString('utf8').replace(/^﻿/, ''));
  } catch {
    throw new PackageProblem('passos.json', 'O arquivo passos.json não é um JSON válido.');
  }
  const parsed = stepsSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    const where = first.path.length ? ` (${first.path.join('.')})` : '';
    throw new PackageProblem('passos.json', `O passos.json está fora do formato${where}: ${first.message}.`);
  }
  const steps = parsed.data;

  steps.abas.forEach((aba, i) => {
    if (aba.ordem !== i + 1) {
      throw new PackageProblem('passos.json', `As abas do passos.json precisam estar na ordem 1, 2, 3; a posição ${i + 1} tem ordem ${aba.ordem}.`);
    }
    if (i > 0 && aba.inicio_s < steps.abas[i - 1].inicio_s) {
      throw new PackageProblem('passos.json', `A aba ${aba.ordem} começa antes da aba ${aba.ordem - 1}.`);
    }
    if (aba.inicio_s >= steps.duracao_s) {
      throw new PackageProblem('passos.json', `A aba ${aba.ordem} começa depois do fim do vídeo.`);
    }
  });

  return steps;
}
