import { randomInt } from 'crypto';

// Alfabeto sem caracteres ambiguos (sem 0/O/1/I/L) para leitura/digitacao humana.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const SHARE_KEY_LENGTH = 12;

/** Gera uma chave aleatoria de compartilhamento (~59 bits de entropia). */
export function generateShareKey(): string {
  let key = '';
  for (let i = 0; i < SHARE_KEY_LENGTH; i++) {
    key += ALPHABET[randomInt(ALPHABET.length)];
  }
  return key;
}

/** Normaliza o que o usuario digitou (maiusculas, sem espacos/hifens). */
export function normalizeShareKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidShareKeyFormat(key: string): boolean {
  return key.length === SHARE_KEY_LENGTH && [...key].every((c) => ALPHABET.includes(c));
}

/** Formata para exibicao: ABCD-EFGH-JKMN */
export function formatShareKey(key: string): string {
  return key.replace(/(.{4})(?=.)/g, '$1-');
}
