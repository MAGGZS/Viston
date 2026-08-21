'use client';

/**
 * Chave de uma tentativa de envio.
 *
 * Vai no cabeçalho `Idempotency-Key` e é o que separa "mandei duas vezes" de
 * "quis mandar duas vezes". Em campo, com 4G instável no corredor de um prédio,
 * o primeiro caso é o comum: a resposta demora, a pessoa toca de novo, e sem
 * chave nascem dois relatórios idênticos — duas linhas no calendário, dois
 * chamados por ocorrência.
 *
 * A chave nasce quando a vistoria começa e sobrevive junto ao rascunho: o
 * reenvio de amanhã, do rascunho retomado, ainda é a mesma tentativa.
 */
export function newSubmissionKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();

  // Navegador antigo (ou contexto sem HTTPS, onde `crypto` some): aleatório o
  // bastante para não colidir entre envios do mesmo aparelho.
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
