import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBuildingHistory, useBuildingOccurrences } from '@/app/hooks/useApi';
import { HISTORY_PAGE_SIZE } from '@/app/lib/pagination';

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
// Jest indexa o mock pelo arquivo resolvido, então `useApi` recebe este mesmo.
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import api from '../../lib/api';

/**
 * A paginação do histórico.
 *
 * O que se cobre aqui é o que quebra em silêncio: o tamanho pedido à API, a
 * página andando de verdade, e a volta para a primeira quando o que se está
 * listando muda — sem isso, quem estava na página 3 de um prédio com trinta
 * vistorias trocava para um com cinco e via um cartão vazio, sem entender.
 */
function wrapper({ children }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Uma resposta de listagem com `total` registros, recortada na página pedida. */
function respostaCom(total, campo = 'inspections') {
  // `(url, config)`: os parâmetros vão no *segundo* argumento do axios.
  return (_url, { params }) => {
    const { page, limit } = params;
    const primeiro = (page - 1) * limit;
    const linhas = Array.from(
      { length: Math.max(0, Math.min(limit, total - primeiro)) },
      (_, i) => ({ id: `r${primeiro + i}` })
    );
    return Promise.resolve({
      data: { [campo]: linhas, total, page, limit, pages: Math.ceil(total / limit) },
    });
  };
}

beforeEach(() => api.get.mockReset());

describe('useBuildingHistory', () => {
  it('pede oito por vez, e não a lista inteira', async () => {
    api.get.mockImplementation(respostaCom(24));

    const { result } = renderHook(() => useBuildingHistory('predio-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(api.get).toHaveBeenCalledWith(
      '/buildings/predio-1/history',
      expect.objectContaining({ params: expect.objectContaining({ page: 1, limit: HISTORY_PAGE_SIZE }) })
    );
    expect(result.current.rows).toHaveLength(8);
    expect(result.current.pages).toBe(3);
    expect(result.current.total).toBe(24);
  });

  it('a seta anda para a próxima página e volta', async () => {
    api.get.mockImplementation(respostaCom(24));

    const { result } = renderHook(() => useBuildingHistory('predio-1'), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(8));
    expect(result.current.rows[0].id).toBe('r0');

    act(() => result.current.next());
    await waitFor(() => expect(result.current.rows[0]?.id).toBe('r8'));
    expect(result.current.page).toBe(2);

    act(() => result.current.prev());
    await waitFor(() => expect(result.current.rows[0]?.id).toBe('r0'));
    expect(result.current.page).toBe(1);
  });

  it('não passa da última página nem volta antes da primeira', async () => {
    // O rodapé já desabilita as setas nas pontas; isto é a rede embaixo — um
    // clique a mais não pode pedir a página 4 de três.
    api.get.mockImplementation(respostaCom(12));

    const { result } = renderHook(() => useBuildingHistory('predio-1'), { wrapper });
    await waitFor(() => expect(result.current.pages).toBe(2));

    act(() => result.current.prev());
    expect(result.current.page).toBe(1);

    act(() => result.current.next());
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.next());
    expect(result.current.page).toBe(2);
  });

  it('volta para a primeira página ao trocar de prédio', async () => {
    api.get.mockImplementation(respostaCom(24));

    const { result, rerender } = renderHook(({ id }) => useBuildingHistory(id), {
      wrapper,
      initialProps: { id: 'predio-1' },
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(8));

    act(() => result.current.next());
    await waitFor(() => expect(result.current.page).toBe(2));

    rerender({ id: 'predio-2' });
    expect(result.current.page).toBe(1);
  });

  it('sem prédio não busca nada, e não fica carregando para sempre', async () => {
    const { result } = renderHook(() => useBuildingHistory(null), { wrapper });

    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.rows).toEqual([]);
  });
});

describe('useBuildingOccurrences', () => {
  it('pagina as ocorrências do mesmo jeito', async () => {
    api.get.mockImplementation(respostaCom(19, 'tickets'));

    const { result } = renderHook(() => useBuildingOccurrences('predio-1'), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(8));

    expect(api.get).toHaveBeenCalledWith(
      '/buildings/predio-1/tickets',
      expect.objectContaining({
        params: expect.objectContaining({ group: 'TODOS', page: 1, limit: HISTORY_PAGE_SIZE }),
      })
    );
    expect(result.current.pages).toBe(3);

    // A última página é a que sobrou, e não oito em branco.
    act(() => result.current.next());
    act(() => result.current.next());
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
  });
});
