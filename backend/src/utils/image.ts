import { ConflictError } from './errors';

/** Teto da foto depois de decodificada. O recorte do app entrega bem menos. */
export const MAX_AVATAR_BYTES = 1_500_000;

/**
 * Assinatura dos três formatos que o `<canvas>` do app exporta.
 *
 * WebP é RIFF: os quatro primeiros bytes são "RIFF", o tamanho vem depois, e
 * "WEBP" só aparece no byte 8 — por isso ele tem um segundo trecho a conferir.
 */
const SIGNATURES: Array<{ type: string; bytes: number[]; at?: { offset: number; bytes: number[] } }> = [
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  {
    type: 'image/webp',
    bytes: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    at: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // "WEBP"
  },
];

function matches(buffer: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

/** O que o arquivo é de verdade, pelos primeiros bytes. `null` se não for imagem conhecida. */
export function sniffImageType(buffer: Buffer): string | null {
  const hit = SIGNATURES.find(
    (sig) => matches(buffer, sig.bytes) && (!sig.at || matches(buffer, sig.at.bytes, sig.at.offset))
  );
  return hit?.type ?? null;
}

/**
 * Decodifica a foto de perfil que chegou como data URL, conferindo o que ela é.
 *
 * O schema valida o *rótulo* do data URL — o texto `data:image/png;base64,` —,
 * que quem envia escreve. Sozinho, ele deixava subir qualquer coisa com o
 * cabeçalho certo: o content-type do objeto no bucket vinha do cliente, e o
 * arquivo servido depois era o que o cliente quisesse. Aqui o tipo sai dos
 * bytes, e o rótulo só é aceito se combinar com eles.
 *
 * O base64 também é conferido: `Buffer.from(lixo, 'base64')` não lança — ele
 * ignora o que não reconhece e devolve um buffer curto, e o resultado era uma
 * foto corrompida no bucket sem erro nenhum no caminho.
 */
export function decodeAvatarDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } {
  const separator = dataUrl.indexOf(',');
  if (separator === -1) throw new ConflictError('Arquivo de imagem inválido');

  const header = dataUrl.slice(0, separator);
  const base64 = dataUrl.slice(separator + 1);
  const declared = header.slice(header.indexOf(':') + 1, header.indexOf(';'));

  const buffer = Buffer.from(base64, 'base64');
  // O ida-e-volta pega o base64 truncado ou com caractere estranho: o que o
  // Node ignorou na entrada não reaparece na saída.
  if (buffer.byteLength === 0 || buffer.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')) {
    throw new ConflictError('Arquivo de imagem inválido');
  }

  if (buffer.byteLength > MAX_AVATAR_BYTES) {
    throw new ConflictError('Imagem muito grande. O limite é 1,5 MB.');
  }

  const real = sniffImageType(buffer);
  if (!real || real !== declared) throw new ConflictError('Arquivo de imagem inválido');

  return { buffer, contentType: real };
}
