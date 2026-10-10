import robots from '@/app/robots';
import { PRIVATE_ROUTE_PREFIXES, PUBLIC_ROUTES } from '@/app/lib/site';

/**
 * O robots.txt.
 *
 * Os rastreadores avaliam cada `Disallow` como prefixo de texto, com `$`
 * marcando o fim do caminho. O teste reproduz essa regra para conferir três
 * coisas: a rota privada exata fica bloqueada (o furo antigo era `/ajuda`
 * livre e só `/ajuda/...` barrado), as subrotas também, e nenhuma rota pública
 * cai por acaso, inclusive uma que só comece com o mesmo texto.
 */
function bloqueia(regras, caminho) {
  return regras.some((regra) =>
    regra.endsWith('$') ? caminho === regra.slice(0, -1) : caminho.startsWith(regra),
  );
}

const [geral, ia] = robots().rules;

describe.each([
  ['todos os rastreadores', geral.disallow],
  ['rastreadores de IA', ia.disallow],
])('robots para %s', (_nome, regras) => {
  it.each(PRIVATE_ROUTE_PREFIXES)('bloqueia %s exata e as subrotas', (prefixo) => {
    expect(bloqueia(regras, prefixo)).toBe(true);
    expect(bloqueia(regras, `${prefixo}/`)).toBe(true);
    expect(bloqueia(regras, `${prefixo}/qualquer/coisa`)).toBe(true);
  });

  it('não bloqueia rota que só começa com o mesmo texto', () => {
    expect(bloqueia(regras, '/ajudante')).toBe(false);
    expect(bloqueia(regras, '/homenagem')).toBe(false);
    expect(bloqueia(regras, '/gestores-parceiros')).toBe(false);
  });

  it.each(PUBLIC_ROUTES)('deixa a rota pública %s livre', (rota) => {
    expect(bloqueia(regras, rota)).toBe(false);
  });
});

it('a API continua bloqueada para todos', () => {
  expect(geral.disallow).toContain('/api/');
});
