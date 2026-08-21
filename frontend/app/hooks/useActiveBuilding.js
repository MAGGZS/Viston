'use client';
import { useCallback, useState } from 'react';
import { useMyBuildings } from '@/app/hooks/useApi';

/**
 * O prédio de que as telas estão falando.
 *
 * Antes cada tela escrevia `myBuildings[0]`. Quem tem vínculo com dois prédios
 * via só o primeiro — sem seletor e sem aviso de que havia outro —, e o backend
 * sempre soube de todos: `getUserMemberships` devolve a lista inteira e as
 * listagens já filtram por prédio. Faltava a escolha na interface.
 *
 * A escolha vive no aparelho e não na URL: as telas do telefone não têm rota
 * por prédio, e quem trabalha em dois quer que o app abra no mesmo em que
 * estava ontem. Se o vínculo com o prédio escolhido acabar, a escolha cai para
 * o primeiro da lista sozinha — sem isso a tela ficaria vazia sem explicação.
 */
const STORAGE_KEY = 'viston:predio-ativo';

function readStored() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useActiveBuilding({ filter } = {}) {
  const { data: buildings = [], isLoading } = useMyBuildings();
  const [storedId, setStoredId] = useState(readStored);

  // `filter` recorta a lista ao que a tela aceita — a vistoria, por exemplo, só
  // enxerga prédio em que a pessoa é inspetora: abrir noutro só daria 403 no fim.
  const available = filter ? buildings.filter(filter) : buildings;

  // O guardado só vale enquanto o vínculo existir. Vínculo removido, rebaixado,
  // prédio apagado: a tela volta para o primeiro em vez de ficar em branco.
  const active = available.find((b) => b.building_id === storedId) ?? available[0] ?? null;

  const setActive = useCallback((buildingId) => {
    setStoredId(buildingId);
    try {
      localStorage.setItem(STORAGE_KEY, buildingId);
    } catch {
      // Sem espaço para a preferência: a escolha vale nesta sessão.
    }
  }, []);

  return {
    buildings: available,
    active,
    buildingId: active?.building_id ?? null,
    setActive,
    isLoading,
    /** Só faz sentido mostrar o seletor quando há do que escolher. */
    hasChoice: available.length > 1,
  };
}
