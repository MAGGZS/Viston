'use client';

/**
 * Onde os tokens ficam, e o único lugar que sabe os nomes das chaves.
 *
 * Antes, cada ponto que precisava limpar a sessão limpava do seu jeito — e o
 * interceptor do axios chamava `localStorage.clear()`, que apaga o domínio
 * inteiro. Hoje isso já custaria o rascunho da vistoria guardado ao lado
 * (ver `lib/draft.js`): quem tem sessão expirada no 18º andar perderia a manhã
 * de trabalho junto com o token.
 */
const ACCESS = 'access_token';
const REFRESH = 'refresh_token';

export function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS);
}

export function getRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH);
}

export function setTokens(accessToken, refreshToken) {
  localStorage.setItem(ACCESS, accessToken);
  localStorage.setItem(REFRESH, refreshToken);
}

/** Só os dois tokens. O que mais estiver guardado no domínio não é da sessão. */
export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

/**
 * Sessão expirada e sem como renovar.
 *
 * O interceptor não conhece o router do Next, e trocar a rota por
 * `window.location.href` recarrega a página inteira: cai o cache do TanStack
 * Query, cai o estado das telas, e a volta ao login custa um branco de
 * segundos. Ele avisa por evento; quem escuta (o `AuthProvider`) navega com o
 * router e a aplicação continua viva.
 */
export const SESSION_EXPIRED = 'viston:session-expired';

export function notifySessionExpired() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED));
}
