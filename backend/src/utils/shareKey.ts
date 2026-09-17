import { randomInt } from 'crypto';

// Alfabeto sem caracteres ambiguos (sem 0/O/1/I/L) para leitura/digitacao humana.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const SHARE_KEY_LENGTH = 12;
export const SHARE_TOKEN_LENGTH = 8;
export const SHARE_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutos

/** Gera uma chave aleatoria de compartilhamento (~59 bits de entropia). */
export function generateShareKey(): string {
  let key = '';
  for (let i = 0; i < SHARE_KEY_LENGTH; i++) {
    key += ALPHABET[randomInt(ALPHABET.length)];
  }
  return key;
}

/** Gera um token temporario de 8 caracteres para QR Code e compartilhamento rotativo. */
export function generateShareToken(): string {
  let token = '';
  for (let i = 0; i < SHARE_TOKEN_LENGTH; i++) {
    token += ALPHABET[randomInt(ALPHABET.length)];
  }
  return token;
}

/** Normaliza o que o usuario digitou (maiusculas, sem espacos/hifens). */
export function normalizeShareKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidShareKeyFormat(key: string): boolean {
  return key.length === SHARE_KEY_LENGTH && [...key].every((c) => ALPHABET.includes(c));
}

export function isValidShareTokenFormat(token: string): boolean {
  return (token.length === SHARE_TOKEN_LENGTH || token.length === SHARE_KEY_LENGTH) &&
    [...token].every((c) => ALPHABET.includes(c));
}

/** Formata para exibicao: ABCD-EFGH ou ABCD-EFGH-JKMN */
export function formatShareKey(key: string): string {
  return key.replace(/(.{4})(?=.)/g, '$1-');
}

