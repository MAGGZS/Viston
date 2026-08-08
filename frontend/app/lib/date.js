/**
 * `date` do relatório é uma coluna DATE: a API devolve meia-noite UTC.
 * Convertido direto com `new Date(...)`, o fuso do Brasil joga a data para o dia anterior.
 * Aqui a parte de calendário é lida da própria string.
 */
export function parseReportDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return new Date(value);
  return new Date(y, m - 1, d);
}
