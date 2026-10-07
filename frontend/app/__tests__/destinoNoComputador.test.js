import { destinoNoComputador } from '@/app/components/TelaPorLargura';

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

const usuario = (...roles) => ({
  kind: 'USER',
  role: 'NONE',
  memberships: roles.map((role, i) => ({ building_id: `p${i + 1}`, role })),
});

/**
 * Para onde cada conta vai quando abre no computador uma tela de celular.
 *
 * O inspetor ganhou mesa própria (`/desktop/inspetor`); quem só acompanha
 * continua na visualização. As outras contas não podem mudar de lugar.
 */
describe('destinoNoComputador', () => {
  it('inspetor vai para a mesa do inspetor', () => {
    expect(destinoNoComputador(usuario('INSPECTOR'))).toBe('/desktop/inspetor');
  });

  it('visualizador puro continua na visualização', () => {
    expect(destinoNoComputador(usuario('VIEWER'))).toBe('/desktop/visualizacao');
    expect(destinoNoComputador(usuario('VIEWER', 'VIEWER'))).toBe('/desktop/visualizacao');
  });

  it('conta mista (inspetor num prédio, visualizador noutro) prioriza a mesa do inspetor', () => {
    expect(destinoNoComputador(usuario('VIEWER', 'INSPECTOR'))).toBe('/desktop/inspetor');
  });

  it('inspetor que também atende chamado vai para a mesa do inspetor', () => {
    expect(destinoNoComputador(usuario('RESPONSAVEL', 'INSPECTOR'))).toBe('/desktop/inspetor');
  });

  it('conta sem vínculo continua na visualização (é onde ela se conecta a um prédio)', () => {
    expect(destinoNoComputador(usuario())).toBe('/desktop/visualizacao');
  });

  it('as outras contas não mudam de lugar', () => {
    expect(destinoNoComputador({ kind: 'MANAGER', memberships: [] })).toBe('/gestor');
    expect(destinoNoComputador({ kind: 'USER', role: 'ADMIN', memberships: [] })).toBe('/desktop/admin/dashboard');
    expect(destinoNoComputador(usuario('MODERADOR', 'INSPECTOR'))).toBe('/moderador');
    expect(destinoNoComputador(usuario('RESPONSAVEL'))).toBe('/responsavel/painel');
  });
});
