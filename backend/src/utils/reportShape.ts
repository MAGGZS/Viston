/**
 * Troca o caminho no bucket por "tem planilha?".
 *
 * O caminho é detalhe de armazenamento e não serve a nenhuma tela: quem baixa
 * passa por `GET /inspections/:id/excel`, que confere o vínculo e assina uma URL
 * de poucos minutos. Deixá-lo sair daria metade do caminho de graça a quem já
 * não pode ver o relatório.
 *
 * Mora fora do repositório de propósito: as suítes trocam o repositório inteiro
 * por mock, e uma função de formato que virasse `jest.fn()` devolveria
 * `undefined` no lugar do relatório.
 */
export function withExcelFlag<T extends { excel_path?: string | null }>(report: T) {
  const { excel_path, ...rest } = report;
  return { ...rest, has_excel: Boolean(excel_path) };
}
