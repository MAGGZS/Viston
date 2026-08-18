/**
 * "Inspeção feita por: Inspetor A / Inspetor B / Inspetor C".
 *
 * O relatório e a planilha passaram a ser do dia, e o dia pode ter mais de uma
 * vistoria: a linha de quem inspecionou vira uma lista. Sem repetir quem
 * vistoriou duas vezes no mesmo dia, e sem sumir com o relatório de quem foi
 * removido do sistema — a vistoria dele aconteceu.
 */
export function inspectorNames(reports: Array<{ inspector: { name: string } | null }>): string[] {
  return [...new Set(reports.map((r) => r.inspector?.name ?? 'Usuário removido'))];
}
