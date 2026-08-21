import { ZodError } from 'zod';
import { inspectionFiltersSchema } from '../validators/inspection.validator';
import { decodeAvatarDataUrl, sniffImageType } from '../utils/image';
import { ConflictError } from '../utils/errors';

// ── Filtros de data ───────────────────────────────────────────────────────────
describe('inspectionFiltersSchema', () => {
  it('recusa data que não é data', () => {
    // Antes isto passava como string, virava `new Date('abc')` no repositório e
    // saía do servidor como 500 — erro nosso para um filtro que o usuário digitou.
    expect(() => inspectionFiltersSchema.parse({ date_from: 'abc' })).toThrow(ZodError);
  });

  it('devolve a mensagem em português, e no campo certo', () => {
    try {
      inspectionFiltersSchema.parse({ date_to: '31/02/2026' });
      throw new Error('deveria ter recusado');
    } catch (err) {
      const issue = (err as ZodError).errors[0];
      expect(issue.path).toEqual(['date_to']);
      expect(issue.message).toBe('Data final inválida');
    }
  });

  it('entrega Date, não string, para o repositório', () => {
    const parsed = inspectionFiltersSchema.parse({ date_from: '2026-08-01', date_to: '2026-08-31' });
    expect(parsed.date_from).toBeInstanceOf(Date);
    expect(parsed.date_to).toBeInstanceOf(Date);
  });

  it('sem filtro de data continua sendo o caso normal', () => {
    const parsed = inspectionFiltersSchema.parse({});
    expect(parsed.date_from).toBeUndefined();
    expect(parsed.page).toBe(1);
  });
});

// ── Foto de perfil ────────────────────────────────────────────────────────────
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
]);

function dataUrl(type: string, bytes: Buffer) {
  return `data:${type};base64,${bytes.toString('base64')}`;
}

describe('sniffImageType', () => {
  it('reconhece os três formatos que o app exporta', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(WEBP)).toBe('image/webp');
  });

  it('não confunde RIFF de outro tipo com WebP', () => {
    // WAV também é RIFF. O que separa é o "WEBP" no byte 8.
    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE'),
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe('decodeAvatarDataUrl', () => {
  it('aceita a foto cujo rótulo bate com os bytes', () => {
    const { buffer, contentType } = decodeAvatarDataUrl(dataUrl('image/png', PNG));
    expect(contentType).toBe('image/png');
    expect(buffer.equals(PNG)).toBe(true);
  });

  it('recusa arquivo que só se diz imagem', () => {
    // O schema valida o rótulo, que quem envia escreve. Sem conferir os bytes,
    // qualquer coisa entrava no bucket com o content-type que o cliente pediu.
    const script = Buffer.from('<script>alert(1)</script>');
    expect(() => decodeAvatarDataUrl(dataUrl('image/png', script))).toThrow(ConflictError);
  });

  it('recusa imagem de verdade com o rótulo trocado', () => {
    expect(() => decodeAvatarDataUrl(dataUrl('image/png', JPEG))).toThrow(ConflictError);
  });

  it('recusa base64 corrompido em vez de subir arquivo truncado', () => {
    // `Buffer.from(lixo, 'base64')` não lança: ignora o que não reconhece e
    // devolve um buffer curto. Sem esta checagem, ia para o bucket assim.
    expect(() => decodeAvatarDataUrl('data:image/png;base64,@@@@nao-e-base64@@@@')).toThrow(
      ConflictError
    );
  });

  it('recusa foto acima do teto', () => {
    const gorda = Buffer.concat([PNG, Buffer.alloc(1_600_000)]);
    expect(() => decodeAvatarDataUrl(dataUrl('image/png', gorda))).toThrow(/muito grande/i);
  });

  it('recusa data URL sem corpo', () => {
    expect(() => decodeAvatarDataUrl('data:image/png;base64')).toThrow(ConflictError);
  });
});
