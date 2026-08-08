// Ordenação de andares do mais alto para o mais baixo — a vistoria sempre avança assim.
// Rank derivado do label: "6º Andar" = 6, "Térreo" = 0, "2º Subsolo" = -2.

export function floorRank(label = '') {
  const normalized = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const match = normalized.match(/(\d+)/);
  const num = match ? parseInt(match[1], 10) : null;

  if (normalized.includes('subsolo')) return -(num ?? 1);
  if (normalized.includes('terreo')) return 0;
  return num ?? 0;
}

export function sortFloorsDesc(floors = []) {
  return [...floors].sort(
    (a, b) =>
      floorRank(b.label) - floorRank(a.label) ||
      a.label.localeCompare(b.label, 'pt-BR', { numeric: true })
  );
}
