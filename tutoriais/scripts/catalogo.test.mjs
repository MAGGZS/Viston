/**
 * Testes do parser do roteiro e do hash das funcionalidades.
 *
 * Rodam com o executor de testes do próprio Node (`node --test`), sem
 * dependência nenhuma: a pasta `tutoriais/` não tem package.json, e o script
 * precisa continuar rodando com um `node` puro na máquina de quem grava os
 * vídeos. O backend chama este arquivo de dentro da suíte dele
 * (`helpCatalogo.test.ts`), e é assim que ele roda no CI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseRoteiro, scriptHash, serializar, acharFuncionalidade, ROTEIRO, SAIDAS } from './catalogo.mjs';

const MINIMO = `# Roteiros

texto solto que não é pasta

# Pasta 3: Inspetor

Gravação no celular.

## 3.1 Fazer uma vistoria completa
\`id: inspetor-vistoria-completa\` · celular

**Aba 1. Começar**
- Tela: tocar em "Iniciar vistoria".
- Narração: "  Toque em Iniciar vistoria.  "

**Aba 2. Escolher os andares**
- Tela: marcar andares.
- Narração: "Marque os andares." (confirmar a frase)

## 3.2 Histórico
\`id: inspetor-historico\` · computador · conta: Carlos

**Aba 1. Abrir**
- Tela: abrir.
- Narração: "Abra o histórico."
`;

test('lê pastas, funcionalidades e abas, com os metadados do mapa', () => {
  const catalogo = parseRoteiro(MINIMO);
  assert.equal(catalogo.pastas.length, 1);
  const [pasta] = catalogo.pastas;
  assert.equal(pasta.slug, 'inspetor');
  assert.equal(pasta.titulo, 'Inspetor');
  assert.equal(pasta.ordem, 1);
  assert.deepEqual(pasta.target_roles, ['INSPECTOR']);
  assert.equal(pasta.admin_only, false);

  const [vistoria, historico] = pasta.funcionalidades;
  assert.equal(vistoria.id, 'inspetor-vistoria-completa');
  assert.equal(vistoria.titulo, 'Fazer uma vistoria completa');
  assert.equal(vistoria.dispositivo, 'MOBILE');
  assert.equal(vistoria.ordem, 1);
  assert.deepEqual(vistoria.abas, [
    { ordem: 1, titulo: 'Começar', narracao: 'Toque em Iniciar vistoria.' },
    // A anotação depois da última aspa não entra na fala.
    { ordem: 2, titulo: 'Escolher os andares', narracao: 'Marque os andares.' },
  ]);
  assert.equal(historico.dispositivo, 'DESKTOP');
  assert.equal(historico.ordem, 2);
});

test('o hash é o SHA-256 do JSON { id, abas: [{ titulo, narracao }] }', () => {
  const func = { id: 'x', abas: [{ titulo: ' A ', narracao: ' fala ', tela: 'ignorada', ordem: 1 }] };
  const esperado = createHash('sha256')
    .update(JSON.stringify({ id: 'x', abas: [{ titulo: 'A', narracao: 'fala' }] }))
    .digest('hex');
  assert.equal(scriptHash(func), esperado);
  assert.match(scriptHash(func), /^[0-9a-f]{64}$/);
});

test('mudar só a Tela não muda o hash; mudar a narração muda', () => {
  const base = parseRoteiro(MINIMO).pastas[0].funcionalidades[0].script_hash;
  const outraTela = parseRoteiro(MINIMO.replace('tocar em "Iniciar vistoria".', 'outra ação.'));
  assert.equal(outraTela.pastas[0].funcionalidades[0].script_hash, base);

  const outraFala = parseRoteiro(MINIMO.replace('Toque em Iniciar vistoria.', 'Toque em Começar.'));
  assert.notEqual(outraFala.pastas[0].funcionalidades[0].script_hash, base);

  const outroTitulo = parseRoteiro(MINIMO.replace('**Aba 1. Começar**', '**Aba 1. Iniciar**'));
  assert.notEqual(outroTitulo.pastas[0].funcionalidades[0].script_hash, base);
});

test('recusa aba sem narração, id repetido e aba fora de sequência', () => {
  assert.throws(() => parseRoteiro(MINIMO.replace('- Narração: "Abra o histórico."', '')), /não tem narração/);
  assert.throws(
    () => parseRoteiro(MINIMO.replace('inspetor-historico', 'inspetor-vistoria-completa')),
    /já foi usado/
  );
  assert.throws(() => parseRoteiro(MINIMO.replace('**Aba 2.', '**Aba 3.')), /fora de sequência/);
  assert.throws(() => parseRoteiro(MINIMO.replace('· celular', '· tablet')), /desconhecido/);
  assert.throws(() => parseRoteiro(MINIMO.replace('# Pasta 3:', '# Pasta 9:')), /mapa PASTAS/);
});

test('acha a funcionalidade pelo par pasta/id', () => {
  const catalogo = parseRoteiro(MINIMO);
  assert.equal(acharFuncionalidade(catalogo, 'inspetor', 'inspetor-historico').titulo, 'Histórico');
  assert.equal(acharFuncionalidade(catalogo, 'gestor', 'inspetor-historico'), null);
});

test('o roteiro de verdade gera um catálogo válido, e os arquivos versionados estão em dia', () => {
  const catalogo = parseRoteiro(readFileSync(ROTEIRO, 'utf8'));
  const slugs = catalogo.pastas.map((p) => p.slug);
  assert.deepEqual(slugs, [
    'primeiros-passos',
    'gestor',
    'inspetor',
    'responsavel',
    'moderador',
    'visualizador',
  ]);
  for (const pasta of catalogo.pastas) {
    for (const func of pasta.funcionalidades) {
      assert.equal(func.script_hash, scriptHash(func), func.id);
      assert.ok(func.abas.length > 0, func.id);
    }
  }
  const conteudo = serializar(catalogo);
  for (const saida of SAIDAS) {
    assert.equal(readFileSync(saida, 'utf8').replace(/\r\n/g, '\n'), conteudo, `${saida} está velho`);
  }
});
