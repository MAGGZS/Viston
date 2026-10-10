import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/historico',
  useSearchParams: () => new URLSearchParams(),
}));

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
import api from '../../lib/api';

import { AvisoRelatorioDoDia, listaDeNomes } from '@/app/components/AvisoRelatorioDoDia';
import { InspectionPreview } from '@/app/components/InspectionPreview';
import { ReportDocumentModal } from '@/app/components/ReportDocumentModal';

/** O formato de `GET /inspections/:id/day` (ver `buildDayReport`, no backend). */
const DIA = {
  date: '2026-08-20T00:00:00.000Z',
  building: { id: 'p1', name: 'Edifício Demonstração' },
  inspectors: ['Ana Ribeiro', 'Carlos Pereira'],
  reports: [
    { id: 'r1', inspector: { name: 'Ana Ribeiro' } },
    { id: 'r2', inspector: { name: 'Carlos Pereira' } },
  ],
  has_excel: false,
  floor_form_entries: [],
};

function comConsulta(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  api.get.mockReset();
});

/**
 * O topo do relatório do dia.
 *
 * Abrir uma vistoria abre o dia inteiro do prédio, com as vistorias de todo
 * mundo. Sem dizer isso, quem abria a própria vistoria e via ocorrências de
 * outra pessoa achava que o relatório estava errado.
 */
describe('aviso do relatório do dia', () => {
  it('diz que junta as vistorias da data, em DD/MM/AAAA, e quem vistoriou', async () => {
    const { container } = render(<AvisoRelatorioDoDia report={DIA} />);

    expect(container).toHaveTextContent('Este relatório junta todas as vistorias do prédio em 20/08/2026.');
    expect(screen.getByText('Vistoriado por Ana Ribeiro e Carlos Pereira.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a data é a do dia da vistoria, sem escorregar pelo fuso', () => {
    // Meia-noite UTC é o dia anterior no Brasil: lida como `new Date()`, a data
    // apareceria como 19/08. `parseReportDate` lê só o dia.
    const { container } = render(<AvisoRelatorioDoDia report={{ ...DIA, date: '2026-08-20' }} />);
    expect(container).toHaveTextContent('20/08/2026');
  });

  it.each([
    [[], ''],
    [['Ana'], 'Ana'],
    [['Ana', 'Bia'], 'Ana e Bia'],
    [['Ana', 'Bia', 'Carlos'], 'Ana, Bia e Carlos'],
  ])('listaDeNomes(%j) = %s', (nomes, esperado) => {
    expect(listaDeNomes(nomes)).toBe(esperado);
  });

  it('aparece no topo da prévia do dia, antes das ações', () => {
    comConsulta(<InspectionPreview report={DIA} reportId="r1" />);

    const aviso = screen.getByText(/Este relatório junta todas as vistorias do prédio em/);
    const acao = screen.getByRole('button', { name: /Relatório completo/ });
    expect(aviso.compareDocumentPosition(acao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Vistoriado por Ana Ribeiro e Carlos Pereira.')).toBeInTheDocument();
  });

  it('aparece no relatório completo, com os nomes do campo `inspectors`', async () => {
    api.get.mockResolvedValue({ data: DIA });
    comConsulta(<ReportDocumentModal open onClose={() => {}} reportId="r1" />);

    expect(await screen.findByText(/Este relatório junta todas as vistorias do prédio em/)).toHaveTextContent('20/08/2026');
    expect(screen.getByText('Vistoriado por Ana Ribeiro e Carlos Pereira.')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/inspections/r1/day');
  });
});
