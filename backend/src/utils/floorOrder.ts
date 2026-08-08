/**
 * Ordenação de andares do mais alto para o mais baixo.
 *
 * A vistoria sempre avança de forma decrescente: último andar -> térreo -> subsolos.
 * O rank é derivado do label ("6º Andar" = 6, "Térreo" = 0, "2º Subsolo" = -2).
 */

function normalize(label: string) {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function floorRank(label: string): number {
  const normalized = normalize(label);
  const match = normalized.match(/(\d+)/);
  const num = match ? parseInt(match[1], 10) : null;

  if (normalized.includes('subsolo')) return -(num ?? 1);
  if (normalized.includes('terreo')) return 0;
  return num ?? 0;
}

/** Ordena do maior andar para o menor; empate resolvido pelo label. */
export function sortFloorsDesc<T extends { label: string }>(floors: T[]): T[] {
  return [...floors].sort(
    (a, b) =>
      floorRank(b.label) - floorRank(a.label) ||
      a.label.localeCompare(b.label, 'pt-BR', { numeric: true })
  );
}
