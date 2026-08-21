# Viston — Frontend

Interface do sistema de vistoria predial. Next.js (App Router) em JavaScript,
React 19, TanStack Query para dados de servidor, Zustand para sessão e Tailwind
CSS v4 para estilo.

O produto tem duas caras: o **mobile**, onde a vistoria é preenchida andar por
andar, e o **desktop**, onde o administrador gerencia prédios, membros e
solicitações de acesso, e o visualizador consulta relatórios.

## Rodando

```bash
npm install
npm run dev
```

Sobe em <http://localhost:3001> (a porta 3000 fica livre para outros serviços).

A URL da API sai de `NEXT_PUBLIC_API_URL` (veja [`.env.example`](.env.example)).
Sem ela, [`app/lib/api.js`](app/lib/api.js) resolve só dois casos: `localhost`
aponta para `http://localhost:4000`, e o domínio de produção aponta para a API
de produção. **Qualquer outro host falha alto**, de propósito: antes, "host que
não é localhost" bastava para cair em produção, e toda pré-visualização de
branch na Vercel escrevia dados reais.

## Testes

```bash
npm test          # jest + testing-library + jest-axe
npm run test:watch
```

O que está coberto: a caixa de diálogo (`role`, nome, Escape), o campo com erro
(`aria-invalid`, `role="alert"`), o droplist pelo teclado, a guarda de rota, o
formulário de um andar, o rascunho da vistoria, a resolução da URL da API e o
redirecionamento por papel. `jest-axe` roda junto nos componentes compartilhados.

Tudo isso, mais o lint e o build, roda em cada push e em cada PR — ver
`.github/workflows/ci.yml`.

## Estrutura

```
app/
├── layout.js              # metadata global, fontes, providers
├── page.js                # redireciona conforme papel e dispositivo
├── login/  register/      # rotas públicas
├── home/  inspecao/       # fluxo mobile
├── historico/  perfil/
├── desktop/               # painel admin e tela de visualização
├── components/            # UI compartilhada (ui/, mobile/kit.js)
├── hooks/                 # useApi (TanStack Query), useMediaQuery, prédio ativo
├── lib/                   # api, providers, site, helpers de data e chave
└── store/                 # zustand: auth e toast
```

## Papéis

| Papel | O que faz |
|-------|-----------|
| `ADMIN` | Gerencia prédios, andares, membros e solicitações; vê todos os prédios |
| `INSPECTOR` | Realiza vistorias nos prédios em que está vinculado |
| `VIEWER` | Só consulta, e apenas pelo desktop |
| `MODERADOR` | Recebe os chamados abertos pelas vistorias, encaminha e fecha |
| `RESPONSAVEL` | Atende o chamado encaminhado e informa quando terminou |

Todo cadastro novo nasce sem vínculo e precisa ser aprovado em um prédio (pela
chave de compartilhamento) antes de ter utilidade.

Os papéis são **por prédio**: a mesma conta pode ser inspetora de um e
visualizadora de outro. Quem tem mais de um vínculo escolhe de qual prédio a
tela está falando (ver `hooks/useActiveBuilding.js`) — a escolha fica guardada
no aparelho.

## SEO e metadata

Gerados por convenção de arquivo do App Router:

| Arquivo | Saída |
|---------|-------|
| [`app/icon.svg`](app/icon.svg), `app/favicon.ico` | favicon |
| [`app/apple-icon.js`](app/apple-icon.js) | ícone da tela de início no iOS |
| [`app/opengraph-image.js`](app/opengraph-image.js) | cartão de compartilhamento 1200×630 |
| [`app/manifest.js`](app/manifest.js) | `/manifest.webmanifest` (PWA instalável) |
| [`app/robots.js`](app/robots.js) | `/robots.txt` |
| [`app/sitemap.js`](app/sitemap.js) | `/sitemap.xml` |
| [`public/llms.txt`](public/llms.txt) | descrição do produto para agentes de IA |

Os valores compartilhados (URL pública, descrição, cores da marca, rotas
públicas e privadas) vivem em [`app/lib/site.js`](app/lib/site.js). Defina
`NEXT_PUBLIC_SITE_URL` no ambiente de produção — é dela que saem canonical,
Open Graph, sitemap e robots.

Só a home, o login e o cadastro são indexáveis. As telas internas ficam
bloqueadas no `robots.txt` e marcadas com `noindex` no layout de cada rota.

## Scripts

```bash
npm run dev     # desenvolvimento na porta 3001
npm run build   # build de produção
npm start       # serve o build
npm run lint    # ESLint
```
