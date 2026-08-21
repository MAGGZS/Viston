# Viston Backend API

Backend do sistema de gestão de vistorias prediais **Viston**.

## Stack

- **Node.js + Express + TypeScript**
- **PostgreSQL** via **Supabase** (ORM: Prisma)
- **Supabase Storage** (fotos + Excel)
- **ExcelJS** (geração de planilhas)
- **JWT** (access + refresh token) + **bcrypt**
- **Zod** (validação de payloads)
- Deploy: **Render**

---

## Setup Local

### Pré-requisitos

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para banco local) **ou** Docker com Postgres
- npm

### 1. Instalar dependências

```bash
cd backend
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` com seus valores. Para rodar localmente com Supabase CLI:

```bash
# Iniciar Supabase local (banco + storage emulado)
supabase start

# O comando acima exibe as URLs e chaves locais — copie para .env.local
```

Se preferir Postgres via Docker:

```bash
docker run -d \
  --name viston-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:15

# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
# DIRECT_URL="postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
```

### 3. Rodar migrations e seed

**Se o banco já tem o schema aplicado (via SQL direto)** — faça o baseline antes:

```bash
# Gerar cliente Prisma
npm run prisma:generate

# Marcar a migration inicial como já aplicada (sem recriar nada no banco)
npx prisma migrate resolve --applied 20260803000000_init

# Popular banco com dados de teste
npm run seed
```

**Se o banco está vazio** (fresh install):

```bash
npm run prisma:generate
npm run prisma:migrate   # aplica a migration e cria todas as tabelas
npm run seed
```

Credenciais criadas pelo seed:

| Papel no prédio | E-mail                | Senha           |
|-----------------|-----------------------|-----------------|
| — (ADMIN)       | admin@viston.com      | Admin@123       |
| INSPECTOR       | carlos@viston.com     | Inspector@123   |
| INSPECTOR       | ana@viston.com        | Inspector@123   |
| VIEWER          | viewer@viston.com     | Viewer@123      |

### 4. Iniciar servidor

```bash
npm run dev
# API disponível em http://localhost:3000
# Health check: GET http://localhost:3000/health
```

---

## Testes

```bash
# Todos os testes
npm test

# Com cobertura
npm run test:coverage

# Watch mode
npm run test:watch
```

Cobertura mínima implementada:
- Envio da vistoria completa em uma única chamada (POST /inspections)
- Autorização por vínculo com o prédio (papel em `building_members`)
- Isolamento por prédio, exercitando o app Express de verdade via supertest
  (`__tests__/authorization.test.ts`)
- Soft delete e anonimização de usuários
- Validação das ocorrências de manutenção por andar (Zod schema)
- Geração de Excel (ExcelJS)
- Caixa de feedback: autoria na coluna certa (usuário ou gestor), destino do
  feedback e restrição das rotas de leitura ao ADMIN
  (`__tests__/feedback.test.ts`)
- Ciclo de vida da sessão: geração de token, saída, troca de senha e exclusão
  de conta (`__tests__/session.test.ts`)
- Validação de data no filtro e conferência dos bytes da foto de perfil
  (`__tests__/hardening.test.ts`)

Tudo isso roda em cada push e em cada PR — ver `.github/workflows/ci.yml`, que
faz `tsc --noEmit` + `npm test` no backend e `eslint` + `next build` no frontend.

---

## Segurança

**Papéis e vínculo.** São dois eixos, e só um deles autoriza prédio.

`users.role` diz o que a conta é no sistema, e tem dois valores: `ADMIN` (conta
de suporte, enxerga tudo, administra contas) e `NONE` (todas as outras). É só
isso que o JWT carrega.

`building_members.role` diz o que a pessoa é **dentro de um prédio** —
`GESTOR`, `INSPECTOR` ou `VIEWER` — e é a única fonte de autorização do produto.
A mesma conta pode ser gestora de um prédio e visualizadora de outro, então o
papel é resolvido por requisição, em `middlewares/buildingAccess.ts`.

Fora o ADMIN, todo acesso a dados de um prédio passa por
`requireBuildingMember`: sem vínculo, rota de prédio devolve `403` e relatório
devolve `404` — o relatório de outro prédio se comporta como inexistente. As
listagens (`GET /inspections`, `GET /calendar`) são filtradas pelos prédios do
usuário.

`buildings.created_by` continua existindo, mas só como histórico de quem
cadastrou: não autoriza nada, e some (`SET NULL`) quando a conta some.

**Nunca sem gestor.** Um prédio pode ter vários gestores; o que ele não pode é
ficar sem nenhum. Rebaixar, remover ou deixar sair o último gestor devolve
`409`, e apagar a conta que é a única gestora de algum prédio também. Para
transferir a gestão, promova o outro primeiro.

**Cadastro.** `POST /users` é aberto, mas o schema é `strict` e não tem campo
`role`: a conta nasce sem vínculo nenhum. O papel dela aparece dentro de um
prédio — criando um (vira gestora dele) ou sendo aprovada num pela chave de
compartilhamento (entra como visualizadora). O middleware `validate` reescreve
`req.body` com o resultado do parse, então nenhum campo fora do contrato chega
ao service.

**Feedback.** Mandar (`POST /feedbacks`) é de qualquer conta autenticada, das
duas naturezas; ler a caixa, decidir o destino e descartar é só do ADMIN. O
`status` não entra no corpo do envio — o feedback nasce `PENDENTE` e quem o
move é o admin, para `TAREFA` ou `MENSAGEM`. Descartar apaga a linha: não existe
status de descarte. `GET /feedbacks/me` devolve só o que a própria conta mandou,
e devolve sem `status`: para quem escreveu, o feedback foi recebido — a aba em
que o admin o colocou é trabalho dele, e o descartado some por já não ter linha.

**RLS.** Todas as tabelas do schema `public` têm row level security ligada e
nenhuma policy: a API PostgREST do Supabase, que é pública, não devolve linha
alguma para `anon` nem para `authenticated`. Isso inclui `_prisma_migrations`,
que não nasce do `schema.prisma` e por isso tinha ficado de fora — escrever
nela faz o próximo `migrate deploy` pular uma migration de verdade. O backend
não é afetado — o Prisma conecta como `postgres`, que tem `BYPASSRLS`.

**Gatilhos.** As funções de gatilho têm `search_path` preso (`public, pg_temp`).
Sem isso, os nomes de tabela que elas citam são resolvidos pela lista de quem
disparou o gatilho, e uma tabela homônima em outro schema faria a regra ser
conferida no lugar errado.

**Chave de compartilhamento.** 12 caracteres de um alfabeto de 31 símbolos
(~59 bits). Só aparece em respostas para ADMIN; as demais rotas devolvem o
prédio pelos campos públicos (`id`, `name`, `description`).

**Sessão.** O access token dura 15 minutos e não consulta o banco. O refresh
token dura 7 dias e carrega `tv`, a geração das sessões da conta
(`users.token_version` / `managers.token_version`): sair (`POST /auth/logout`),
trocar a senha e excluir a conta incrementam a coluna, e todo refresh token
emitido antes disso para de valer na hora. Token antigo, sem `tv`, vale como
geração 0 — a migration não desloga ninguém.

**Senhas.** bcrypt com custo 12 (OWASP). Hash gravado com custo menor continua
válido e é refeito no primeiro login que der certo, sem pedir nada ao usuário.

**Envio duplicado.** `POST /inspections` aceita o cabeçalho `Idempotency-Key`.
O app gera a chave quando a vistoria começa, guarda junto do rascunho e a manda
no envio: toque duplo ou retry de rede devolvem o relatório que já existe, em
vez de criar um segundo. O caminho não é um índice único em
(prédio, inspetor, dia) — duas vistorias do mesmo prédio no mesmo dia pelo mesmo
inspetor são legítimas, e a planilha do dia existe justamente para juntá-las.

**Planilha fora da resposta.** `submit` responde assim que grava o relatório; a
planilha do dia é montada em seguida (`setImmediate`). Numa vistoria de vinte
andares ela levava segundos, e o inspetor ficava com a tela parada em 4G. Se o
processo morrer no meio — no plano gratuito do Render a instância dorme —, o
relatório fica sem planilha e `POST /inspections/:id/excel` a refaz; o app já
chama essa rota sozinho quando o download não acha o arquivo.

**Planilhas.** O bucket `SUPABASE_BUCKET_EXCEL` é **privado**. A coluna
`inspection_reports.excel_path` guarda o caminho do objeto, não a URL, e
`GET /inspections/:id/excel` confere o vínculo com o prédio antes de assinar uma
URL de 5 minutos. Nenhuma listagem devolve o caminho — só `has_excel`. O bucket
de fotos segue público de propósito: o avatar aparece em `<img>` em dezenas de
telas, e URL assinada expiraria com a imagem já na página.

**Limites.** 300 req/min por IP no geral; 20 tentativas por 15 min em `/auth/*`
(sucesso não conta), chaveadas por **IP + e-mail** — só por IP, um escritório
inteiro atrás de um NAT dividia a mesma cota e um ataque distribuído tinha uma
cota por máquina; 60/h no cadastro, no `lookup` de chave e no pedido de acesso.

**Log.** `pino` com id por requisição (`pino-http`). `console.error` solto no
painel do Render não dizia de qual chamada cada linha era — e quando aparece um
500, o que interessa é o que veio antes dele na mesma requisição. `redact`
esconde `Authorization`, senha, hash e os tokens: log é o lugar clássico onde
essas coisas vazam, porque ninguém espera que vazem ali. `LOG_LEVEL` sobrescreve
o nível (padrão: `info` em produção, `debug` fora).

Falta o passo seguinte, que depende de uma conta externa: um coletor de erros
(Sentry ou equivalente) pendurado no ramo 500 do `errorHandler`. Hoje um 500 em
produção só aparece se alguém olhar o log do Render.

**Saúde.** `/health` é liveness — o processo está de pé. `/health/ready` é
readiness: faz `SELECT 1` e responde 503 se o banco não atender. São separados
de propósito: checar o banco no liveness faria uma queda do Postgres virar um
ciclo de reinícios que não conserta nada.

**Cabeçalhos.** `helmet` com CSP `default-src 'none'` (a API só devolve JSON),
`frame-ancestors 'none'`, `Referrer-Policy: no-referrer` e `x-powered-by`
desligado. `trust proxy` em 1 para o rate limit enxergar o IP real no Render.
O frontend tem CSP própria em `next.config.mjs` — é lá que o token vive.

---

## Documentação da API

O arquivo `docs/openapi.yaml` contém a especificação OpenAPI 3.0 completa.

Para visualizar interativamente:

```bash
# Opção 1: Swagger UI via npx
npx @redocly/cli preview-docs docs/openapi.yaml

# Opção 2: Importar no Insomnia/Postman
# File > Import > docs/openapi.yaml
```

---

## Estrutura do Projeto

```
src/
├── app.ts                    # Express app (middlewares + rotas)
├── server.ts                 # Entry point
├── config.ts                 # Variáveis de ambiente
├── lib/
│   ├── prisma.ts             # Cliente Prisma singleton
│   └── supabase.ts           # Cliente Supabase singleton
├── controllers/              # Recebem req/res, delegam para services
│   ├── auth.controller.ts
│   ├── user.controller.ts
│   └── inspection.controller.ts
├── services/                 # Lógica de negócio
│   ├── auth.service.ts
│   ├── user.service.ts
│   ├── inspection.service.ts
│   ├── excel.service.ts
│   └── storage.service.ts
├── repositories/             # Acesso ao banco (Prisma)
│   ├── user.repository.ts
│   ├── inspection.repository.ts
│   └── building.repository.ts
├── routes/                   # Definição de rotas + RBAC
│   ├── auth.routes.ts
│   ├── user.routes.ts
│   └── inspection.routes.ts
├── middlewares/
│   ├── authenticate.ts       # JWT verification
│   ├── authorize.ts          # guarda de rota do ADMIN
│   ├── buildingAccess.ts     # Vínculo com o prédio (isolamento entre prédios)
│   ├── rateLimit.ts          # Limites por IP (geral, auth, rotas sensíveis)
│   ├── validate.ts           # Zod schema validation
│   └── errorHandler.ts       # Global error handler
├── validators/
│   ├── auth.validator.ts     # Schemas de auth/users
│   └── inspection.validator.ts # Schema da vistoria (ocorrências) + filtros
├── utils/
│   ├── errors.ts             # Classes de erro padronizadas
│   ├── jwt.ts                # Sign/verify tokens
│   └── response.ts           # Helpers de resposta HTTP
├── prisma/
│   └── seed.ts               # Seed de dados de teste
└── __tests__/
    ├── inspection.test.ts
    ├── user.test.ts
    └── excel-sync.test.ts
prisma/
└── schema.prisma             # Schema do banco
docs/
└── openapi.yaml              # Documentação OpenAPI 3.0
```

---

## Deploy no Render

### 1. Criar Web Service no Render

- **Build Command:** `npm install && npm run prisma:generate && npm run build && npm run prisma:migrate:deploy`
- **Start Command:** `npm start`
- **Node Version:** 18

### 2. Variáveis de ambiente no Render

Configure todas as variáveis do `.env.example` com os valores de produção. Ver checklist abaixo.

### 3. Checklist de troca para produção

| Variável | Local | Produção |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:54322/...` | URL pooling Supabase (`?pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | mesma que DATABASE_URL local | URL direta Supabase (porta 5432, sem pooling — para migrations) |
| `SUPABASE_URL` | `http://localhost:54321` | `https://[PROJECT_REF].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave local do `supabase start` | service_role key do painel Supabase |
| `JWT_SECRET` | qualquer string | string aleatória 64+ chars |
| `JWT_REFRESH_SECRET` | qualquer string | string aleatória 64+ chars (diferente do JWT_SECRET) |
| `FRONTEND_URL` | `http://localhost:5173` | URL da Vercel (ex: `https://viston.vercel.app`) — **obrigatória em produção**: sem ela o boot falha, em vez de o CORS barrar tudo em silêncio |
| `NODE_ENV` | `development` | `production` |
| `LOG_LEVEL` | opcional (`debug`) | opcional (`info`) |

Do lado da Vercel, `NEXT_PUBLIC_API_URL` passa a valer para todo host que não
seja o domínio de produção. Sem ela, cada pré-visualização de branch batia na
API de produção e escrevia dados reais.

> Nenhuma alteração de código é necessária — apenas substituição das variáveis de ambiente.

> **Bucket das planilhas.** `SUPABASE_BUCKET_EXCEL` precisa estar marcado como
> **privado** no painel do Supabase (Storage → o bucket → Make private). A API
> assina a URL na hora do download; enquanto o bucket for público, qualquer link
> que alguém já tenha guardado continua abrindo sem autenticação. Os arquivos
> não precisam ser movidos — o caminho dentro do bucket é o mesmo.

**Backup.** O Supabase faz backup automático do Postgres conforme o plano —
diário no gratuito, com retenção de 7 dias, e point-in-time nos planos pagos.
A restauração é feita pelo painel (Database → Backups) e substitui o banco
inteiro, não linhas soltas. O que **não** está coberto: os buckets do Storage
(planilhas e fotos), que não entram no backup do banco. Para uma cópia dos dois,
`supabase db dump` mais uma cópia dos buckets, guardados fora do Supabase.

> **Região do Render:** o `render.yaml` usa `frankfurt` por ser a região mais próxima do Supabase em `sa-east-1` (São Paulo). Se `frankfurt` não estiver disponível no seu plano, troque para `oregon` — funciona, mas adiciona ~150ms de latência por query.

---

## Endpoints Resumidos

```
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout                        (autenticado — encerra as sessões da conta)
GET    /auth/me                            (autenticado)

POST   /users                              (ADMIN)
GET    /users                              (ADMIN)
PATCH  /users/:id                          (ADMIN)
GET    /users/me
PATCH  /users/me
PATCH  /users/me/password
DELETE /users/me

GET    /buildings/:id/floors

POST   /inspections                        (vistoria completa, já concluída)
GET    /inspections
GET    /inspections/:id
GET    /inspections/:id/excel

GET    /calendar?month=&year=
GET    /calendar?range=semestral|anual
```

Ver `docs/openapi.yaml` para contrato completo com schemas de request/response.
