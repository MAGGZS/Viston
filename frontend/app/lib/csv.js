/**
 * Baixar uma tabela do painel como CSV.
 *
 * Gerado no navegador, e não pedido ao servidor: os dados já estão na memória
 * do React Query — foram desenhados na tela agora mesmo. Uma rota de exportação
 * refaria as mesmas consultas para devolver os mesmos números, com a chance de
 * devolver *outros* se alguém fechar um chamado no meio do caminho. O que sai
 * daqui é exatamente o que a pessoa está vendo.
 *
 * **Três decisões que existem por causa do Excel em português.**
 *
 * O separador é `;` e não a vírgula. O Excel configurado em pt-BR usa a vírgula
 * como separador decimal, e um arquivo separado por vírgula abre com tudo
 * espremido numa coluna só — o formato "correto" que ninguém consegue usar.
 *
 * O arquivo abre com BOM (`﻿`). Sem ele o Excel lê o UTF-8 como Latin-1 e
 * "Elétrica" vira "ElÃ©trica" em toda a planilha.
 *
 * Número decimal sai com vírgula, pelo mesmo motivo: "6.5" com ponto é lido
 * como texto, e a coluna deixa de somar e de ordenar.
 */

/** O que precisa de aspas: separador, aspas, quebra de linha. */
function escapar(valor) {
  if (valor === null || valor === undefined) return '';

  const texto =
    typeof valor === 'number'
      ? // Inteiro sai limpo; decimal sai com vírgula, que é o que o Excel
        // pt-BR entende como número.
        (Number.isInteger(valor) ? String(valor) : valor.toFixed(2)).replace('.', ',')
      : String(valor);

  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Monta o CSV e dispara o download.
 *
 * `colunas` é `[{ chave, titulo }]` — o cabeçalho sai na ordem em que vierem, e
 * é ela que decide o que entra: campo que não está na lista não vai para o
 * arquivo. É de propósito. Despejar o objeto inteiro levaria `id`, `floor_id` e
 * o que mais a API devolver, e quem abre a planilha teria de adivinhar quais
 * das quinze colunas são as que ele pediu.
 */
export function baixarCsv(nomeBase, colunas, linhas) {
  const cabecalho = colunas.map((c) => escapar(c.titulo)).join(';');
  const corpo = linhas.map((linha) =>
    colunas.map((c) => escapar(typeof c.valor === 'function' ? c.valor(linha) : linha[c.chave])).join(';')
  );

  // `\r\n` porque é o que o Excel espera; o resto do mundo aceita os dois.
  const conteudo = `﻿${[cabecalho, ...corpo].join('\r\n')}\r\n`;

  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${nomeBase}-${hoje()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Sem isto o blob fica na memória da aba até ela fechar — e quem exporta uma
  // vez costuma exportar de novo depois de trocar o filtro.
  URL.revokeObjectURL(url);
}

/** `2026-09-14` — ordenável no nome do arquivo, que é onde ele vai parar. */
function hoje() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * O nome do arquivo, com o recorte dentro dele.
 *
 * "chamados.csv" na pasta de downloads não diz de que prédio nem de que mês é,
 * e duas exportações do mesmo painel viram "chamados.csv" e "chamados (1).csv".
 * O recorte no nome é o que faz o arquivo continuar querendo dizer alguma coisa
 * uma semana depois.
 */
export function nomeDoRecorte(base, periodo) {
  const partes = [base, periodo?.label?.toLowerCase().replace(/\s+de\s+/g, '-').replace(/\s+/g, '-')];
  return partes.filter(Boolean).join('-');
}
