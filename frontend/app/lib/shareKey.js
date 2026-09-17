// Chave de compartilhamento do prédio: 8 (temporário) ou 12 caracteres.
export const SHARE_KEY_LENGTH = 12;
export const SHARE_TOKEN_LENGTH = 8;

/** Normaliza o que o usuário digitou (maiúsculas, sem espaços/hífens). */
export function normalizeShareKey(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Formata para exibição: ABCD-EFGH ou ABCD-EFGH-JKMN */
export function formatShareKey(key) {
  return normalizeShareKey(key).replace(/(.{4})(?=.)/g, '$1-');
}

export function isCompleteShareKey(key) {
  const len = normalizeShareKey(key).length;
  return len === SHARE_TOKEN_LENGTH || len === SHARE_KEY_LENGTH;
}
