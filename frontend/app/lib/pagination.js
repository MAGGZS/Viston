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

/**
 * Altura de um `Badge` — 12px de texto entre 4px de recuo de cada lado.
 * É o mais alto que uma célula de tabela costuma carregar.
 */
export const BADGE_HEIGHT = 26;

/**
 * O recuo de cima e de baixo da célula, em todas as listagens do produto.
 *
 * Era 11px em umas e 12px noutras, escrito à mão em cada tabela. Num lugar só
 * porque o cartão de histórico alterna entre duas tabelas diferentes — a de
 * vistorias, que mora na tela, e a de ocorrências, que é componente — e com
 * números separados a linha mudava de altura ao trocar de aba, num cartão que
 * não muda de tamanho. Um valor divergente aqui é um defeito visível, não uma
 * preferência.
 *
 * Sete, e não onze: a linha fica em 41px em vez de 50, e o cartão mostra as dez
 * vistorias em menos tela. Abaixo disto o `Badge` de 26px encosta nas bordas da
 * célula e a linha deixa de ter respiro.
 */
export const CELL_PAD_Y = 7;

/**
 * Altura da célula de espera, para o esqueleto ocupar o mesmo lugar da linha
 * que ele substitui.
 *
 * `content` é o mais alto que a célula carrega — o `Badge` acima, ou o `Avatar`
 * da coluna de inspetor —, `padY` é o recuo de cima (e o de baixo, igual), e o
 * `+1` é o fio que divide as linhas. Os três entram na conta porque o
 * `box-sizing: border-box` do Tailwind manda em tudo e o `border-collapse` põe
 * a borda dentro da caixa da célula: aqui `height` é a caixa inteira, e não o
 * miolo dela.
 *
 * Sem isto o esqueleto sai mais baixo que a lista que substitui — 12px por
 * linha na tabela de ocorrências —, e o cartão encolhe e volta a cada seta, que
 * é a sanfona que a paginação existe para evitar.
 */
export function placeholderCellHeight({ content = BADGE_HEIGHT, padY }) {
  return content + padY * 2 + 1;
}
