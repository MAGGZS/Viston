'use client';
import { Select } from '@/app/components/ui';
import { T, W } from '@/app/lib/theme';

/**
 * De qual prédio a tela está falando.
 *
 * Aparece só para quem tem mais de um vínculo — para quem tem um só, um seletor
 * de uma opção é ruído. Para quem tem dois, é a diferença entre ver metade do
 * trabalho e ver o trabalho.
 *
 * A mesma lista suspensa do resto do produto (`Select`), que já é um combobox
 * com teclado completo.
 */
export function BuildingSwitcher({ buildings, buildingId, onChange, style = {} }) {
  if (!buildings || buildings.length <= 1) return null;

  return (
    <Select
      options={buildings.map((b) => ({ value: b.building_id, label: b.name }))}
      value={buildingId ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Prédio"
      style={{ padding: '9px 34px 9px 12px', fontSize: 14, fontWeight: W.strong, ...style }}
      wrapperStyle={{ maxWidth: 260 }}
    />
  );
}

/**
 * Nome do prédio quando há um só, seletor quando há mais.
 *
 * Existe porque as telas mostravam o nome como título de seção: trocar o título
 * por um seletor sem mais nada faria a pessoa com um prédio perder a referência
 * de onde está.
 */
export function BuildingHeading({ buildings, buildingId, onChange, fallback = 'Seu prédio' }) {
  if (buildings && buildings.length > 1) {
    return <BuildingSwitcher buildings={buildings} buildingId={buildingId} onChange={onChange} />;
  }

  const name = buildings?.[0]?.name ?? fallback;
  return (
    <h2 style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 16, color: T.text }}>{name}</h2>
  );
}
