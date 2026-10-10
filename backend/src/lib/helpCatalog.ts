import catalogoJson from '../data/catalogo.json';

/**
 * O catálogo da central de ajuda, como o backend o lê.
 *
 * O arquivo `src/data/catalogo.json` é gerado por `tutoriais/scripts/catalogo.mjs`
 * a partir de `tutoriais/roteiros.md`, e é cópia byte a byte de
 * `tutoriais/catalogo.json` (o teste `helpCatalogo.test.ts` confere). Mora
 * dentro de `backend/` porque o Render roda o serviço a partir desta pasta, e o
 * import abaixo é o que faz o `tsc` copiá-lo para `dist/` no build: sem passo
 * de cópia à parte para alguém esquecer.
 *
 * O backend nunca calcula hash de roteiro: lê o `script_hash` pronto. Quem
 * calcula é o script, e só ele (ver o comentário de `scriptHash` lá).
 */
export type CatalogoAba = { ordem: number; titulo: string; narracao: string };

export type CatalogoFuncionalidade = {
  id: string;
  titulo: string;
  dispositivo: 'MOBILE' | 'DESKTOP';
  ordem: number;
  script_hash: string;
  abas: CatalogoAba[];
};

export type CatalogoPasta = {
  slug: string;
  titulo: string;
  ordem: number;
  descricao: string;
  icone: string;
  target_roles: string[];
  admin_only: boolean;
  funcionalidades: CatalogoFuncionalidade[];
};

export type Catalogo = { pastas: CatalogoPasta[] };

export const catalogo = catalogoJson as Catalogo;

/**
 * `slug da funcionalidade -> script_hash` do roteiro atual.
 *
 * Montado uma vez na carga do módulo: o catálogo só muda com deploy, e o
 * estado de cada funcionalidade é calculado a cada listagem do admin.
 */
const hashes = new Map<string, string>();
for (const pasta of catalogo.pastas) {
  for (const func of pasta.funcionalidades) hashes.set(func.id, func.script_hash);
}

export const helpCatalog = {
  /** O `script_hash` atual da funcionalidade. `null` quando ela saiu do roteiro. */
  scriptHash(slug: string): string | null {
    return hashes.get(slug) ?? null;
  },
};
