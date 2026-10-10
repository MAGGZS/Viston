#!/usr/bin/env node
/**
 * Gera o catálogo da central de ajuda a partir de `tutoriais/roteiros.md`.
 *
 * O roteiro é a fonte da verdade do conteúdo: o que a voz lê, o que vira
 * legenda e o que vira texto de cada aba. O catálogo é a mesma coisa em JSON,
 * que é o que o backend (seed e estado "Desatualizado") e a esteira de
 * gravação dos vídeos conseguem ler sem reimplementar o parser.
 *
 * Uso:
 *   node tutoriais/scripts/catalogo.mjs            gera os dois arquivos
 *   node tutoriais/scripts/catalogo.mjs --check    só confere; sai com 1 se
 *                                                  algum dos dois estiver velho
 *
 * Saída, byte a byte igual nos dois lugares:
 *   - `tutoriais/catalogo.json`: o versionado, o que a esteira de vídeo lê.
 *   - `backend/src/data/catalogo.json`: a cópia que vai para o build do
 *     backend. Fica dentro de `backend/` porque o Render roda o serviço com o
 *     diretório raiz em `backend/`, e o que mora fora dele não chega garantido
 *     ao build. O backend importa o JSON, e o `tsc` o copia para `dist/` junto
 *     com o código. Um teste do backend roda este script com `--check`, então
 *     esquecer de regenerar depois de mexer no roteiro quebra o CI.
 *
 * Quem calcula o hash de uma funcionalidade fora daqui (a esteira de vídeo do
 * Prompt 2) importa `scriptHash` deste arquivo. Duas implementações do hash
 * seriam a garantia de que um dia elas discordam, e o sintoma seria todo
 * vídeo novo nascer "Desatualizado" sem ninguém entender por quê.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
export const ROTEIRO = resolve(RAIZ, 'tutoriais', 'roteiros.md');
export const SAIDAS = [
  resolve(RAIZ, 'tutoriais', 'catalogo.json'),
  resolve(RAIZ, 'backend', 'src', 'data', 'catalogo.json'),
];

/**
 * O que o roteiro não diz sobre cada pasta, e a central precisa saber.
 *
 * A chave é o número da pasta no roteiro (`# Pasta 3: Inspetor`). O título
 * sai do roteiro; o resto mora aqui porque não é conteúdo narrado, é
 * apresentação e regra de acesso:
 *
 * - `slug`: o pedaço da URL (`/ajuda/inspetor`) e metade da chave `pasta/id`
 *   do pacote de vídeo. Mudar um slug depois de publicado quebra os links
 *   diretos e os pacotes já gerados; trate como permanente.
 * - `descricao`: a frase do cartão da pasta. O seed só a grava na criação; o
 *   admin pode reescrever pela tela.
 * - `icone`: nome de um ícone do lucide-react, no formato do componente
 *   (`HardHat`, não `hard-hat`).
 * - `target_roles`: para quem a pasta é "Seu cargo". Os valores são os que o
 *   backend calcula para a conta (ver `helpRepository.accountRoles`):
 *     `INSPECTOR`, `VIEWER`, `MODERADOR`, `RESPONSAVEL`: o papel da conta
 *       comum em pelo menos um prédio;
 *     `GESTOR`: conta de gestor;
 *     `ADMIN`: conta de suporte;
 *     `SEM_PREDIO`: conta comum sem nenhum vínculo ainda, que é exatamente
 *       quem precisa dos primeiros passos. Quem já trabalha em um prédio vê os
 *       primeiros passos em "Outros cargos", que é onde eles param de ser
 *       urgentes.
 * - `admin_only`: a pasta nem aparece para quem não é ADMIN. Hoje nenhuma
 *   pasta usa: o proprietário decidiu que o ADMIN não tem tutorial, e a pasta
 *   de administração saiu do roteiro. A regra continua no backend, genérica,
 *   para uma pasta futura que só faça sentido a quem abre as telas do admin.
 */
export const PASTAS = {
  1: {
    slug: 'primeiros-passos',
    descricao: 'Criar a conta, entrar em um prédio e conhecer o seu perfil.',
    icone: 'Rocket',
    target_roles: ['SEM_PREDIO'],
    admin_only: false,
  },
  2: {
    slug: 'gestor',
    descricao: 'Cadastrar prédios, montar a equipe, aprovar pedidos e acompanhar a operação.',
    icone: 'Building2',
    target_roles: ['GESTOR'],
    admin_only: false,
  },
  3: {
    slug: 'inspetor',
    descricao: 'Fazer a vistoria andar por andar, retomar e consultar o histórico.',
    icone: 'ClipboardCheck',
    target_roles: ['INSPECTOR'],
    admin_only: false,
  },
  4: {
    slug: 'responsavel',
    descricao: 'Receber chamados, registrar o andamento e informar a conclusão.',
    icone: 'Wrench',
    target_roles: ['RESPONSAVEL'],
    admin_only: false,
  },
  5: {
    slug: 'moderador',
    descricao: 'Encaminhar e fechar chamados, e acompanhar os números do prédio.',
    icone: 'ShieldCheck',
    target_roles: ['MODERADOR'],
    admin_only: false,
  },
  6: {
    slug: 'visualizador',
    descricao: 'Acompanhar o calendário de vistorias, os relatórios e as planilhas.',
    icone: 'Eye',
    target_roles: ['VIEWER'],
    admin_only: false,
  },
};

const DISPOSITIVOS = { celular: 'MOBILE', computador: 'DESKTOP' };

/**
 * O hash do que a pessoa ouve numa funcionalidade.
 *
 * SHA-256, em hexadecimal minúsculo, do `JSON.stringify` (sem espaços) de
 * `{ id, abas: [{ titulo, narracao }] }`, nessa ordem de chaves, com as abas
 * na ordem do roteiro e os textos sem espaços nas pontas.
 *
 * A "Tela" de cada aba não entra: trocar só a ação gravada não muda a fala, e
 * não deveria marcar o vídeo como velho. Aceita tanto a funcionalidade do
 * catálogo (abas com `narracao`) quanto qualquer objeto com o mesmo formato.
 */
export function scriptHash(funcionalidade) {
  const conteudo = {
    id: String(funcionalidade.id).trim(),
    abas: funcionalidade.abas.map((aba) => ({
      titulo: String(aba.titulo).trim(),
      narracao: String(aba.narracao).trim(),
    })),
  };
  return createHash('sha256').update(JSON.stringify(conteudo), 'utf8').digest('hex');
}

function erro(linha, mensagem) {
  return new Error(`roteiros.md, linha ${linha}: ${mensagem}`);
}

/**
 * Lê o roteiro e devolve o catálogo.
 *
 * O parser é estrito de propósito: o roteiro é escrito à mão, e uma aba sem
 * narração ou um id repetido viraria um vídeo errado lá na frente, longe da
 * causa. Melhor parar aqui, com o número da linha.
 *
 * O formato esperado (o mesmo que o roteiro já usa):
 *   # Pasta N: Título
 *   ## N.M Título da funcionalidade
 *   `id: slug` · celular|computador · (resto ignorado)
 *   **Aba K. Título da aba**
 *   - Tela: ... (ignorada)
 *   - Narração: "texto" (texto depois da última aspa é anotação e é ignorado)
 */
export function parseRoteiro(markdown) {
  const linhas = markdown.replace(/\r\n?/g, '\n').split('\n');
  const pastas = [];
  const ids = new Set();
  let pasta = null;
  let func = null;
  let aba = null;

  const fecharAba = () => {
    if (aba && aba.narracao === undefined) {
      throw erro(aba.linha, `a aba "${aba.titulo}" não tem narração`);
    }
    aba = null;
  };
  const fecharFunc = () => {
    fecharAba();
    if (func) {
      if (!func.id) throw erro(func.linha, `a funcionalidade "${func.titulo}" não tem id`);
      if (func.abas.length === 0) throw erro(func.linha, `a funcionalidade "${func.id}" não tem abas`);
    }
    func = null;
  };

  linhas.forEach((texto, i) => {
    const n = i + 1;
    let m;

    if ((m = texto.match(/^# Pasta (\d+):\s*(.+?)\s*$/))) {
      fecharFunc();
      const numero = Number(m[1]);
      const meta = PASTAS[numero];
      if (!meta) throw erro(n, `a pasta ${numero} não tem metadados no mapa PASTAS do script`);
      pasta = { numero, titulo: m[2], funcionalidades: [] };
      pastas.push(pasta);
      return;
    }

    // Um título de nível 1 que não é pasta (ex.: o título do documento)
    // encerra qualquer pasta aberta.
    if (/^# /.test(texto)) {
      fecharFunc();
      pasta = null;
      return;
    }

    if ((m = texto.match(/^## (\d+)\.(\d+)\s+(.+?)\s*$/))) {
      fecharFunc();
      if (!pasta) throw erro(n, 'funcionalidade fora de uma pasta');
      if (Number(m[1]) !== pasta.numero) {
        throw erro(n, `a funcionalidade ${m[1]}.${m[2]} está dentro da pasta ${pasta.numero}`);
      }
      func = { linha: n, titulo: m[3], ordem: Number(m[2]), id: null, dispositivo: null, abas: [] };
      pasta.funcionalidades.push(func);
      return;
    }

    if (func && (m = texto.match(/^`id:\s*([a-z0-9-]+)`\s*·\s*([^·]+?)\s*(?:·|$)/))) {
      if (func.id) throw erro(n, `a funcionalidade "${func.titulo}" tem dois ids`);
      const dispositivo = DISPOSITIVOS[m[2].trim().toLowerCase()];
      if (!dispositivo) throw erro(n, `dispositivo "${m[2]}" desconhecido (use celular ou computador)`);
      if (ids.has(m[1])) throw erro(n, `o id "${m[1]}" já foi usado`);
      ids.add(m[1]);
      func.id = m[1];
      func.dispositivo = dispositivo;
      return;
    }

    if ((m = texto.match(/^\*\*Aba (\d+)\.\s*(.+?)\*\*\s*$/))) {
      if (!func) throw erro(n, 'aba fora de uma funcionalidade');
      fecharAba();
      const ordem = Number(m[1]);
      if (ordem !== func.abas.length + 1) {
        throw erro(n, `a aba ${ordem} de "${func.id}" está fora de sequência`);
      }
      aba = { linha: n, ordem, titulo: m[2].trim() };
      func.abas.push(aba);
      return;
    }

    if (aba && (m = texto.match(/^- Narração:\s*"(.*)"/))) {
      if (aba.narracao !== undefined) throw erro(n, `a aba "${aba.titulo}" tem duas narrações`);
      const narracao = m[1].trim();
      if (!narracao) throw erro(n, `a narração da aba "${aba.titulo}" está vazia`);
      aba.narracao = narracao;
    }
  });
  fecharFunc();

  if (pastas.length === 0) throw new Error('roteiros.md: nenhuma pasta encontrada');

  return {
    pastas: pastas.map((p, i) => {
      const meta = PASTAS[p.numero];
      return {
        slug: meta.slug,
        titulo: p.titulo,
        ordem: i + 1,
        descricao: meta.descricao,
        icone: meta.icone,
        target_roles: meta.target_roles,
        admin_only: meta.admin_only,
        funcionalidades: p.funcionalidades.map((f, j) => {
          const abas = f.abas.map((a) => ({ ordem: a.ordem, titulo: a.titulo, narracao: a.narracao }));
          return {
            id: f.id,
            titulo: f.titulo,
            dispositivo: f.dispositivo,
            ordem: j + 1,
            script_hash: scriptHash({ id: f.id, abas }),
            abas,
          };
        }),
      };
    }),
  };
}

/** O catálogo como vai para o disco: duas casas de recuo e quebra de linha no fim. */
export function serializar(catalogo) {
  return `${JSON.stringify(catalogo, null, 2)}\n`;
}

/** Acha uma funcionalidade pelo par pasta/id. `null` quando não existe. */
export function acharFuncionalidade(catalogo, pasta, id) {
  const p = catalogo.pastas.find((x) => x.slug === pasta);
  return p?.funcionalidades.find((f) => f.id === id) ?? null;
}

function main(argv) {
  const conferir = argv.includes('--check');
  const conteudo = serializar(parseRoteiro(readFileSync(ROTEIRO, 'utf8')));

  if (conferir) {
    const velhos = SAIDAS.filter((saida) => {
      try {
        return readFileSync(saida, 'utf8').replace(/\r\n/g, '\n') !== conteudo;
      } catch {
        return true;
      }
    });
    if (velhos.length > 0) {
      console.error(
        `Catálogo desatualizado em relação ao roteiro: ${velhos.join(', ')}.\n` +
          'Rode `node tutoriais/scripts/catalogo.mjs` e versione o resultado.'
      );
      process.exit(1);
    }
    console.log('Catálogo em dia com o roteiro.');
    return;
  }

  for (const saida of SAIDAS) {
    mkdirSync(dirname(saida), { recursive: true });
    writeFileSync(saida, conteudo, 'utf8');
  }
  const total = JSON.parse(conteudo).pastas.reduce((s, p) => s + p.funcionalidades.length, 0);
  console.log(`Catálogo gerado: ${total} funcionalidades em ${SAIDAS.length} arquivos.`);
}

// Roda só quando chamado direto, e não quando importado pela esteira de vídeo.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
