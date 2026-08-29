import { format } from 'date-fns';

/**
 * A escolha de período dos gráficos do painel, traduzida em duas datas.
 *
 * A tela pergunta "qual ano" e "qual mês", e o servidor só conhece intervalo —
 * a mesma divisão do relatório em .docx (ver RelatorioModal): calendário é
 * conforto de quem pergunta, não conceito do domínio, e traduzi-lo aqui deixa
 * acrescentar um recorte novo sem tocar na API.
 *
 * As datas são montadas como texto 'AAAA-MM-DD', sem passar por `Date`: o mês
 * escolhido é um dia do calendário, e convertê-lo para instante o deslocaria
 * para o dia anterior em qualquer fuso a oeste de Greenwich.
 */

/** Sem mês escolhido: do primeiro dia do ano até o dia em que se está olhando. */
export const ATE_HOJE = '';

const pad = (n) => String(n).padStart(2, '0');

/** Último dia do mês, sem tabela: o dia 0 do mês seguinte. */
function ultimoDia(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * O intervalo de uma escolha.
 *
 * `hoje` entra por parâmetro para o teste poder fixá-lo — e porque "até hoje"
 * é literalmente o dia em que a pessoa está vendo o gráfico, o que faz do
 * relógio uma entrada da função, não um detalhe escondido dentro dela.
 *
 * `format` e não `toISOString`: o segundo dá o dia em UTC, e depois das 21h em
 * São Paulo isso já é amanhã — o gráfico passaria a somar um dia que ainda não
 * aconteceu.
 */
export function intervaloDe({ year, month }, hoje = new Date()) {
  if (!month) {
    return { date_from: `${year}-01-01`, date_to: format(hoje, 'yyyy-MM-dd') };
  }
  const m = Number(month);
  return {
    date_from: `${year}-${pad(m)}-01`,
    date_to: `${year}-${pad(m)}-${pad(ultimoDia(year, m))}`,
  };
}
