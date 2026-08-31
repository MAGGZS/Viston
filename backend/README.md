# Viston Backend API

Backend do sistema de gestão de vistorias prediais **Viston**.

## Stack

- **Node.js 22+ + Express + TypeScript**
- **PostgreSQL** via **Supabase** (ORM: Prisma, com adapter `pg`)
- **Supabase Storage** (fotos de perfil + planilhas)
- **ExcelJS** (planilha do relatório do dia) e **docx** (relatório de chamados
  do período, em Word)
- **JWT** (access + refresh token) + **bcrypt**
- **Zod** (validação de payloads)
- **helmet**, **express-rate-limit** e **pino** (cabeçalhos, limites e log)
- Deploy: **Render** (ver [`render.yaml`](render.yaml))

---

## Setup Local

### Pré-requisitos

- Node.js 22+ — é o piso do `engines`, e o cliente do Supabase usa o WebSocket
  nativo do Node, que só existe a partir dessa versão
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

`.env.local` é lido em desenvolvimento e `.env` em produção — ver `src/config.ts`
e `prisma.config.ts`. Não há fallback para o `.env.example`: faltando
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` ou
`JWT_REFRESH_SECRET` (e `FRONTEND_URL` em produção), o processo não sobe.

Para rodar localmente com o Supabase CLI:

```bash
# Banco + storage emulado
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

`DATABASE_URL` é a conexão da API (pooling em produção) e `DIRECT_URL` é a que o
Prisma usa para migrations e introspecção — o PgBouncer não aceita os comandos
DDL do `migrate`.

### 3. Preparar o banco

**Banco vazio** (instalação nova):

```bash
npm run prisma:generate
npm run prisma:migrate   # aplica as migrations e cria todas as tabelas
```

**Banco que já tem o schema aplicado** (via SQL direto) — faça o baseline antes:

```bash
npm run prisma:generate
npx prisma migrate resolve --applied 20260803000000_init
```

Não existe seed: as contas são criadas pelos cadastros públicos
(`POST /users` e `POST /managers`), e o gestor vira gestor do prédio que
cadastrar.

### 4. Iniciar servidor

```bash
npm run dev
# API disponível em http://localhost:4000  (PORT no .env.local)
# Health check: GET http://localhost:4000/health
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

As suítes trocam os repositórios por mock e não abrem conexão com o banco. O que
está coberto:

- Envio da vistoria completa em uma única chamada, descarte, relatório do dia,
  listagem e isolamento por prédio (`inspection.test.ts`)
- Autorização ponta a ponta, exercitando o app Express de verdade via supertest:
  autenticação, cadastro público, criação e gestão do prédio, papel dentro do
  prédio, gestores, "gestor não vistoria" e a edição de usuários pelo admin
  (`authorization.test.ts`)
- Ciclo do chamado: encaminhar, cancelar o envio, receber, informar conclusão,
  fechar, atualizar, contadores, gráficos e relatório do período
  (`ticket.test.ts`)
- Cadastro, soft delete e anonimização de usuários, troca de senha
  (`user.test.ts`)
- Ciclo de vida da sessão: refresh, saída, eventos que derrubam a sessão e login
  (`session.test.ts`)
- Caixa de feedback: autoria na coluna certa (usuário ou gestor), destino do
  feedback e restrição das rotas de leitura ao ADMIN (`feedback.test.ts`)
- Geração da planilha do dia (`excel-sync.test.ts`)
- Validação de data no filtro e conferência dos bytes da foto de perfil
  (`hardening.test.ts`)
- Ordenação de andares (`floorOrder.test.ts`) e o dia no fuso do prédio, com o
  mapa de calor (`timezone.test.ts`)

Tudo isso roda em cada push e em cada PR — ver `.github/workflows/ci.yml`, que
faz `tsc --noEmit` + `npm test` no backend e `eslint` + `npm test` + `next build`
no frontend.

---

## Segurança

**Papéis e vínculo.** São dois eixos, e nenhum deles é uma coluna só.

`users.role` diz o que a conta é no sistema, e tem dois valores: `ADMIN` (conta
de suporte, enxerga tudo, administra contas) e `NONE` (todas as outras). É só
isso que o JWT carrega de papel global.

**Gestor é outro tipo de conta**, não um usuário marcado: mora em `managers`,
com cadastro próprio (`POST /managers`), e o vínculo dele com o prédio está em
`building_managers`. Por isso ele não vistoria — `inspection_reports.inspector_id`
aponta para `users`, e ele não está lá.

`building_members.role` diz o que um **usuário** é dentro de um prédio —
`INSPECTOR`, `VIEWER`, `MODERADOR` ou `RESPONSAVEL`. A mesma conta pode ser
inspetora de um prédio e visualizadora de outro, então o papel é resolvido por
requisição, em `middlewares/buildingAccess.ts` (que consulta as duas tabelas e
guarda a resposta numa `WeakMap` com o tempo de vida da requisição).

Fora o ADMIN, todo acesso a dados de um prédio passa por `requireBuildingMember`
ou `requireBuildingManager`: sem vínculo, rota de prédio devolve `403` e
relatório devolve `404` — o relatório de outro prédio se comporta como
inexistente. As listagens (`GET /inspections`, `GET /calendar`) são filtradas
pelos prédios do usuário.

`buildings.created_by` continua existindo, mas só como histórico de qual gestor
cadastrou: não autoriza nada, e some (`SET NULL`) quando a conta some.

**Nunca sem gestor.** Um prédio pode ter vários gestores; o que ele não pode é
ficar sem nenhum. Remover o gestor — inclusive a si mesmo — quando ele é o único
devolve `409`, e apagar a conta que é a única gestora de algum prédio também.
Para transferir a gestão, adicione o outro primeiro: dois é um estado válido.

**Cadastro.** `POST /users` e `POST /managers` são abertos, e o schema é
`strict` e não tem campo `role`. A conta de usuário nasce sem vínculo nenhum: o
papel dela aparece dentro de um prédio, quando o pedido feito pela chave de
compartilhamento é aprovado — e a aprovação sempre entra como `VIEWER`, com o
gestor promovendo depois. O middleware `validate` reescreve `req.body` com o
resultado do parse, então nenhum campo fora do contrato chega ao service.

A conta também nasce **sem acesso**: `email_verified_at` nulo, e o login para
num `403 EMAIL_NAO_CONFIRMADO` depois de conferir a senha — depois, e não antes,
senão o formulário de login viraria um verificador de quais e-mails existem. Não
há exceção por papel nem por tabela: o ADMIN e o gestor passam pela mesma linha.

Os dois cadastros respondem **sempre a mesma coisa**, com `200` e uma frase
única: e-mail novo, e-mail que já tem conta, e-mail preso na outra tabela, e o
campo-armadilha `website` preenchido por robô. Nem o status distingue os casos —
`201` seria a resposta honesta de um deles, e por isso mesmo não serve. Falha de
envio e teto de reenvio são engolidos aqui pela mesma razão: os dois só disparam
quando houve tentativa de envio, e só se tenta enviar quando a conta é nova ou
não confirmada.

**Confirmação e recuperação de senha.** Código de 6 dígitos por e-mail, guardado
como `sha256` em `email_tokens` — o valor legível existe dentro da mensagem e em
lugar nenhum daqui. Vale 10 minutos, morre no uso, morre quando outro é emitido,
e aguenta 5 chutes antes de fechar. É esse teto, e não o prazo, que torna a
força bruta inviável contra um milhão de combinações; a comparação é
`timingSafeEqual`, para o tempo de resposta não dizer onde os hashes divergem.
A mesma tabela serve aos dois fins, separada por `purpose`.

Redefinir a senha incrementa `token_version`: sem isso a troca seria teatro, e
o refresh token que já estava na mão de quem invadiu seguiria valendo sete dias.

**Envio.** Brevo, pela API HTTPS (`lib/mailer.ts`). Não é SMTP porque o Render
bloqueia saída SMTP — 465 e 587 foram testadas em produção e as duas deram
`ETIMEDOUT`. Não é um provedor que exija domínio verificado porque o projeto não
tem domínio; a Brevo verifica um *endereço*. O envio mora atrás de duas funções,
então trocar de provedor não toca em mais nada.

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
(~59 bits), sem os ambíguos (`0/O/1/I/L`). A busca por chave é `POST`
(`/buildings/lookup`) para a chave não ir na querystring, que é registrada em
log de acesso e no histórico do navegador.

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
cota por máquina; 60/h nos cadastros, no `lookup` de chave, no pedido de acesso
e no envio de feedback.

**Log.** `pino` com id por requisição (`pino-http`). `console.error` solto no
painel do Render não dizia de qual chamada cada linha era — e quando aparece um
500, o que interessa é o que veio antes dele na mesma requisição. `redact`
esconde `Authorization`, senha, hash, os tokens e a foto em data URL: log é o
lugar clássico onde essas coisas vazam, porque ninguém espera que vazem ali.
`LOG_LEVEL` sobrescreve o nível (padrão: `info` em produção, `debug` fora).

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

O arquivo `docs/openapi.yaml` traz a especificação OpenAPI 3.0 de auth, contas
de usuário, feedbacks, vistorias, chamados e calendário. As rotas de conta de
gestor (`/managers`) e de administração do prédio (CRUD, membros, gestores e
solicitações de acesso) ainda não estão nele — para essas, a referência são os
arquivos em `src/routes/`.

Para visualizar interativamente:

```bash
# Opção 1: preview via npx
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
│   ├── prisma.ts             # Cliente Prisma singleton (adapter pg)
│   ├── supabase.ts           # Cliente Supabase singleton
│   └── logger.ts             # pino (com redact)
├── controllers/              # Recebem req/res, delegam para services
│   ├── auth.controller.ts        manager.controller.ts
│   ├── user.controller.ts        feedback.controller.ts
│   ├── building.controller.ts    ticket.controller.ts
│   └── inspection.controller.ts
├── services/                 # Lógica de negócio
│   ├── auth.service.ts           manager.service.ts
│   ├── user.service.ts           feedback.service.ts
│   ├── inspection.service.ts     ticket.service.ts
│   ├── excel.service.ts          ticketReport.ts   # relatório .docx
│   └── storage.service.ts
├── repositories/             # Acesso ao banco (Prisma)
│   ├── user.repository.ts        manager.repository.ts
│   ├── building.repository.ts    feedback.repository.ts
│   └── inspection.repository.ts  ticket.repository.ts
├── routes/                   # Definição de rotas + guardas
│   ├── auth.routes.ts            manager.routes.ts
│   ├── user.routes.ts            feedback.routes.ts
│   ├── building.routes.ts        ticket.routes.ts
│   └── inspection.routes.ts
├── middlewares/
│   ├── authenticate.ts       # JWT (usuário ou gestor)
│   ├── authorize.ts          # guarda de rota do ADMIN
│   ├── buildingAccess.ts     # Vínculo com o prédio (isolamento entre prédios)
│   ├── rateLimit.ts          # Limites por IP (geral, auth, rotas sensíveis)
│   ├── validate.ts           # Zod schema validation
│   └── errorHandler.ts       # Global error handler
├── validators/               # auth, inspection, ticket, feedback
├── utils/                    # errors, jwt, response, password, shareKey,
│                             # floorOrder, timezone, image, inspectors,
│                             # maintenanceOptions, reportShape
└── __tests__/                # jest + supertest
prisma/
├── schema.prisma             # Schema do banco
└── migrations/               # Migrations versionadas
docs/
└── openapi.yaml              # Documentação OpenAPI 3.0 (parcial — ver acima)
render.yaml                   # Serviço, região e variáveis do Render
```

---

## Deploy no Render

O [`render.yaml`](render.yaml) já descreve o serviço. Se for configurar à mão:

- **Build Command:** `npm ci --include=dev && npm run build && npm run prisma:migrate:deploy`
  (`--include=dev` é obrigatório: com `NODE_ENV=production` o npm pula as
  devDependencies, e é lá que moram `typescript` e os `@types/*`. `npm run build`
  já roda `prisma generate`.)
- **Start Command:** `npm start`
- **Node Version:** 22

### Variáveis de ambiente no Render

Configure todas as variáveis do `.env.example` com os valores de produção:

| Variável | Local | Produção |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:54322/...` | URL pooling Supabase (`?pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | mesma que DATABASE_URL local | URL direta Supabase (porta 5432, sem pooling — para migrations) |
| `SUPABASE_URL` | `http://localhost:54321` | `https://[PROJECT_REF].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave local do `supabase start` | service_role key do painel Supabase |
| `SUPABASE_BUCKET_EXCEL` | `viston-excel` | `viston-excel` (bucket **privado**) |
| `SUPABASE_BUCKET_PHOTOS` | `viston-photos` | `viston-photos` |
| `JWT_SECRET` | qualquer string | string aleatória 64+ chars |
| `JWT_REFRESH_SECRET` | qualquer string | string aleatória 64+ chars (diferente do JWT_SECRET) |
| `PORT` | `4000` | definida pelo Render |
| `FRONTEND_URL` | `http://localhost:3001` | URL da Vercel — **obrigatória em produção**: sem ela o boot falha, em vez de o CORS barrar tudo em silêncio. Aceita várias origens separadas por vírgula |
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

> **Keep-alive.** No plano gratuito a instância dorme depois de ~15 minutos sem
> tráfego. `.github/workflows/keepalive.yml` chama `/health` a cada dez minutos
> para o primeiro login da manhã não esperar o cold start; num plano pago o
> workflow pode sair.

---

## Endpoints

Todas as rotas exigem `Authorization: Bearer`, exceto os dois cadastros
públicos, o login, o refresh e os health checks.

```
GET    /health                                   (liveness)
GET    /health/ready                             (readiness — SELECT 1)

POST   /auth/login                               (403 EMAIL_NAO_CONFIRMADO se pendente)
POST   /auth/refresh
POST   /auth/logout                              (encerra as sessões da conta)
GET    /auth/me

POST   /auth/confirmar                           ({ email, code } — libera a conta)
POST   /auth/reenviar                            ({ email, password } — outro código)
POST   /auth/senha/esqueci                       ({ email } — resposta única)
POST   /auth/senha/verificar                     ({ email, code } — confere sem gastar)
POST   /auth/senha/redefinir                     ({ email, code, new_password })

POST   /users                                    (cadastro público — nasce sem vínculo)
GET    /users/me      PATCH /users/me
PATCH  /users/me/password
PATCH  /users/me/avatar    DELETE /users/me/avatar
DELETE /users/me
GET    /users         PATCH /users/:id     DELETE /users/:id      (ADMIN)

POST   /managers                                 (cadastro público de gestor)
GET    /managers/me   PATCH /managers/me
PATCH  /managers/me/password
PATCH  /managers/me/avatar DELETE /managers/me/avatar
DELETE /managers/me
GET    /managers      DELETE /managers/:id                        (ADMIN)

GET    /buildings                                (ADMIN)
GET    /buildings/stats                          (ADMIN)
GET    /buildings/managed                        (os prédios que a conta administra)
GET    /buildings/me                             (os prédios em que tem vínculo)
POST   /buildings/lookup                         (busca pela chave de compartilhamento)
POST   /buildings                                (quem cria vira gestor dele)
PATCH  /buildings/:id     DELETE /buildings/:id                   (gestor)
GET    /buildings/:id/floors                                      (membro)
POST   /buildings/:id/floors   DELETE /buildings/:id/floors/:floorId   (gestor)
GET    /buildings/:id/dashboard   GET /buildings/:id/history      (membro)
POST   /buildings/:id/managers    DELETE /buildings/:id/managers/:managerId  (gestor)
GET    /buildings/:id/members                                     (gestor)
PATCH  /buildings/:id/members/:userId   DELETE /buildings/:id/members/:userId (gestor)
DELETE /buildings/:id/members/me                 (sair do prédio)
POST   /buildings/access-requests                (pedido pela chave)
GET    /buildings/:id/access-requests                             (gestor)
PATCH  /buildings/:id/access-requests/:requestId                  (gestor)

POST   /inspections                              (vistoria completa; Idempotency-Key)
GET    /inspections                              (filtros: page, limit, status,
                                                  inspector_id, floor_id, q,
                                                  date_from, date_to)
GET    /inspections/:id
GET    /inspections/:id/day                      (relatório do dia)
DELETE /inspections/:id                          (gestor do prédio)
GET    /inspections/:id/excel                    (URL assinada, 5 min)
POST   /inspections/:id/excel                    (refaz a planilha)

GET    /calendar?month=&year=
GET    /calendar?range=semestral|anual

GET    /buildings/:id/tickets                                     (membro)
GET    /buildings/:id/responsibles                                (membro)
GET    /buildings/:id/tickets/stats                               (moderador)
GET    /buildings/:id/tickets/summary                             (moderador)
GET    /buildings/:id/tickets/report                              (moderador — .docx)
GET    /tickets/me                               (os chamados do responsável)
POST   /tickets/:id/forward      POST /tickets/:id/unforward
POST   /tickets/:id/receive      POST /tickets/:id/done
POST   /tickets/:id/close                        (só o moderador fecha)
PATCH  /tickets/:id

POST   /feedbacks                GET  /feedbacks/me
GET    /feedbacks   PATCH /feedbacks/:id   DELETE /feedbacks/:id   (ADMIN)
```
