// Chave de compartilhamento do prédio: 12 caracteres, alfabeto sem ambiguidade.
export const SHARE_KEY_LENGTH = 12;

/** Normaliza o que o usuário digitou (maiúsculas, sem espaços/hífens). */
export function normalizeShareKey(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Formata para exibição: ABCD-EFGH-JKMN */
export function formatShareKey(key) {
  return normalizeShareKey(key).replace(/(.{4})(?=.)/g, '$1-');
}

export function isCompleteShareKey(key) {
  return normalizeShareKey(key).length === SHARE_KEY_LENGTH;
}
