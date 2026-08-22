/**
 * Quantos registros um cartão de histórico mostra por vez.
 *
 * Oito é o teto do cartão, não da consulta: acima disso a lista passa a rolar
 * dentro do painel e empurra para baixo o que estava ao lado dela — o
 * calendário, os contadores, o que mais o painel juntou. O resto continua
 * alcançável, uma página por vez, pelas setas do rodapé.
 */
export const HISTORY_PAGE_SIZE = 8;

/**
 * A faixa que a página corrente mostra: "9–16 de 24".
 *
 * Só o número da página não diz o tamanho do que se está percorrendo — e é
 * isso que decide se vale continuar clicando.
 */
export function pageRangeLabel({ page, pageSize, total, count }) {
  if (!total) return '';

  const first = (page - 1) * pageSize + 1;
  const last = first + (count ?? pageSize) - 1;

  return `${first}–${Math.min(last, total)} de ${total}`;
}
