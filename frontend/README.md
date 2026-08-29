# Viston — Frontend

Interface do sistema de vistoria predial. Next.js 16 (App Router) em JavaScript,
React 19, TanStack Query para dados de servidor, Zustand para o estado de
sessão, axios para as chamadas (com refresh automático de token) e Tailwind
CSS v4 para estilo. Formulários com react-hook-form + yup, ícones do
lucide-react, datas com date-fns.

O produto tem duas caras: o **mobile**, onde a vistoria é preenchida andar por
andar e o responsável atende os chamados dele, e o **desktop**, onde o gestor
administra prédios, colaboradores e chamados, o admin cuida de contas e
feedbacks, e o visualizador consulta relatórios.

## Rodando

```bash
npm install
npm run dev
```

Sobe em <http://localhost:3001> (a porta 3000 fica livre para outros serviços;
o backend roda na 4000).

A URL da API sai de `NEXT_PUBLIC_API_URL` (veja [`.env.example`](.env.example)).
Sem ela, [`app/lib/api.js`](app/lib/api.js) resolve só dois casos: `localhost`
aponta para `http://localhost:4000`, e o domínio de produção (reconhecido por
`NEXT_PUBLIC_VERCEL_ENV=production`, ou pelo host bater com `SITE_URL`) aponta
para a API no Render. **Qualquer outro host falha alto**, de propósito: antes,
"host que não é localhost" bastava para cair em produção, e toda
pré-visualização de branch na Vercel escrevia dados reais.

## Testes

```bash
npm test          # jest + testing-library + jest-axe
npm run test:watch
```

O que está coberto: os componentes compartilhados (caixa de diálogo com `role`,
nome e Escape; campo com erro em `aria-invalid` e `role="alert"`; droplist pelo
teclado; alternador), a marca, a sidebar, a guarda de rota, o formulário de um
andar, a modal e os filtros de chamado, o quadro de processamento, a tabela de
ocorrências, o histórico ampliado e seu alternador, o paginador e a paginação de
histórico e ocorrências, os gráficos do painel, a guarda de saída de formulário,
o rascunho da vistoria, o tema, a resolução da URL da API e o redirecionamento
da raiz por tipo de conta. `jest-axe` roda junto nos componentes compartilhados.

Tudo isso, mais o lint e o build, roda em cada push e em cada PR — ver
`.github/workflows/ci.yml`.

## Estrutura

```
app/
├── layout.js              # metadata global, fontes, providers, script do tema
├── page.js                # redireciona conforme o tipo de conta e o dispositivo
├── login/  register/      # rotas públicas (register/gestor cadastra gestor)
├── home/  inspecao/       # fluxo mobile da vistoria
├── historico/             # histórico e a consulta ampliada (historico/completo)
├── perfil/                # conta, aparência (tema claro/escuro) e feedback
├── responsavel/           # os chamados de quem atende
├── moderador/             # fila de chamados: novos, processamento, finalizados
├── gestor/                # área do gestor: prédios, colaboradores e chamados
├── desktop/               # painel do admin (contas, feedbacks) e visualização
├── components/            # UI compartilhada (ui/, mobile/kit.js) e as modais
├── hooks/                 # useApi (TanStack Query), prédio ativo, media query,
│                          # download da planilha, guarda de saída, debounce
├── lib/                   # api, providers, papéis, site, tema, datas, rascunho
└── store/                 # zustand: auth, toast, sidebar e alterações não salvas
```

## Papéis

São dois eixos, e o arquivo que decide os dois é
[`app/lib/roles.js`](app/lib/roles.js).

**O tipo da conta** separa o gestor do usuário comum — são tabelas diferentes no
backend, com cadastros diferentes:

| Tipo | O que é |
|------|---------|
| `MANAGER` | Gestor. Cadastra prédios e administra quem entra neles. Não vistoria |
| `USER` | Todo o resto. O que pode fazer vem do vínculo com cada prédio |
| `ADMIN` | Um `USER` com `role: 'ADMIN'` — conta de suporte, sem prédio próprio |

**O vínculo com o prédio** diz o que um usuário faz lá dentro:

| Papel | O que faz |
|-------|-----------|
| `INSPECTOR` | Realiza vistorias no prédio |
| `VIEWER` | Só consulta, e apenas pelo desktop |
| `MODERADOR` | Recebe os chamados abertos pelas vistorias, encaminha e fecha |
| `RESPONSAVEL` | Atende o chamado encaminhado e informa quando terminou |

Todo cadastro de usuário nasce sem vínculo: informa a chave de compartilhamento
do prédio, pede acesso e entra como `VIEWER` quando o gestor aprova — daí em
diante é o gestor que promove.

Os papéis são **por prédio**: a mesma conta pode ser inspetora de um e
visualizadora de outro. Quem tem mais de um vínculo escolhe de qual prédio a
tela está falando (ver `hooks/useActiveBuilding.js`) — a escolha fica guardada
no aparelho.

## Tema

Claro ou escuro, escolhido na tela de perfil. A preferência é do aparelho, não
da conta: mora no `localStorage` e nada disso chega ao servidor. O estado de
verdade é o atributo `data-theme` do `<html>`, escrito por um script em
`app/layout.js` antes da primeira pintura — ver
[`app/lib/tema.js`](app/lib/tema.js).

## SEO e metadata

Gerados por convenção de arquivo do App Router:

| Arquivo | Saída |
|---------|-------|
| [`app/icon.svg`](app/icon.svg), `app/favicon.ico` | favicon |
| `app/apple-icon.png` | ícone da tela de início no iOS |
| [`app/opengraph-image.js`](app/opengraph-image.js) | cartão de compartilhamento 1200×630 |
| [`app/manifest.js`](app/manifest.js) | `/manifest.webmanifest` (PWA instalável) |
| [`app/robots.js`](app/robots.js) | `/robots.txt` |
| [`app/sitemap.js`](app/sitemap.js) | `/sitemap.xml` |
| [`public/llms.txt`](public/llms.txt) | descrição do produto para agentes de IA |

Os valores compartilhados (URL pública, descrição, cores da marca, rotas
públicas e privadas) vivem em [`app/lib/site.js`](app/lib/site.js). Defina
`NEXT_PUBLIC_SITE_URL` no ambiente de produção — é dela que saem canonical,
Open Graph, sitemap e robots.

Só a home, o login e o cadastro (inclusive o de gestor) são indexáveis. As
telas internas ficam bloqueadas no `robots.txt` e marcadas com `noindex` no
layout de cada rota.

Os cabeçalhos de segurança do app — CSP inclusive — ficam em
[`next.config.mjs`](next.config.mjs): é no navegador que o token vive.

## Scripts

```bash
npm run dev     # desenvolvimento na porta 3001
npm run build   # build de produção
npm start       # serve o build
npm run lint    # ESLint (inclui as regras de acessibilidade)
```
