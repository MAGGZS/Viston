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

| Role      | E-mail                | Senha           |
|-----------|-----------------------|-----------------|
| ADMIN     | admin@viston.com      | Admin@123       |
| INSPECTOR | carlos@viston.com     | Inspector@123   |
| INSPECTOR | ana@viston.com        | Inspector@123   |
| VIEWER    | viewer@viston.com     | Viewer@123      |

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
- RBAC (roles e permissões)
- Soft delete e anonimização de usuários
- Validação das ocorrências de manutenção por andar (Zod schema)
- Geração de Excel (ExcelJS)

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
│   ├── authorize.ts          # RBAC por role
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
| `FRONTEND_URL` | `http://localhost:5173` | URL da Vercel (ex: `https://viston.vercel.app`) |
| `NODE_ENV` | `development` | `production` |

> Nenhuma alteração de código é necessária — apenas substituição das variáveis de ambiente.

> **Região do Render:** o `render.yaml` usa `frankfurt` por ser a região mais próxima do Supabase em `sa-east-1` (São Paulo). Se `frankfurt` não estiver disponível no seu plano, troque para `oregon` — funciona, mas adiciona ~150ms de latência por query.

---

## Endpoints Resumidos

```
POST   /auth/login
POST   /auth/refresh

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
