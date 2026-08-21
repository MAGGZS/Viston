import { resolveApiBaseUrl } from '@/app/lib/api';

/**
 * De onde o app fala com a API.
 *
 * O palpite antigo — "host que não é localhost, então é produção" — fazia toda
 * pré-visualização da Vercel escrever no banco de produção: alguém abria o
 * preview de um branch para conferir uma tela e cadastrava prédio de verdade.
 * Estes casos são a fronteira exata entre os ambientes.
 */
describe('resolveApiBaseUrl', () => {
  it('localhost fala com o backend local', () => {
    expect(resolveApiBaseUrl('localhost')).toBe('http://localhost:4000');
    expect(resolveApiBaseUrl('127.0.0.1')).toBe('http://localhost:4000');
  });

  it('o domínio de produção fala com a API de produção', () => {
    expect(resolveApiBaseUrl('viston-nine.vercel.app')).toBe('https://viston.onrender.com');
  });

  it('preview da Vercel falha alto em vez de escrever em produção', () => {
    expect(() => resolveApiBaseUrl('viston-git-branch-teste.vercel.app')).toThrow(
      /NEXT_PUBLIC_API_URL/
    );
  });

  it('domínio novo também precisa dizer com quem fala', () => {
    // Trocar o domínio do produto não pode fazer o app apontar para lugar
    // nenhum em silêncio — nem, pior, continuar apontando para produção.
    expect(() => resolveApiBaseUrl('vistoria.exemplo.com.br')).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it('a mensagem diz qual host ficou sem resposta', () => {
    expect(() => resolveApiBaseUrl('preview-123.vercel.app')).toThrow(/preview-123\.vercel\.app/);
  });
});
