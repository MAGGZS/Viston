# Viston — Sistema de Vistoria Predial

Stack: Next.js 14 · NestJS · Prisma · PostgreSQL (Supabase) · Tailwind CSS

---

## Estrutura do Projeto

```
viston/
├── backend/          # API NestJS
├── frontend/         # App Next.js
└── docker-compose.yml
```

---

## 1. Setup Local (Desenvolvimento)

### Pré-requisitos
- Node.js 20+
- Docker Desktop (para o Postgres local)

### 1.1 Banco de dados local

```bash
docker compose up -d
```

Isso sobe um Postgres na porta `5432`.

> **Alternativa sem Docker:** use o Supabase CLI (`supabase start`) para ter Postgres + Storage local compatível com produção.

### 1.2 Backend

```bash
cd backend
cp .env.example .env.local
npm install
npx prisma migrate dev --name init
npm run seed
npm run start:dev
```

API disponível em: `http://localhost:3001/api`  
Swagger: `http://localhost:3001/api/docs`

### 1.3 Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

App disponível em: `http://localhost:3000`

### 1.4 Credenciais do seed

| Role      | E-mail                      | Senha          |
|-----------|-----------------------------|----------------|
| ADMIN     | admin@viston.com            | Admin@123      |
| INSPECTOR | joao.silva@viston.com       | Inspector@123  |
| INSPECTOR | maria.santos@viston.com     | Inspector@123  |
| VIEWER    | viewer@viston.com           | Viewer@123     |

---

## 2. Variáveis de Ambiente

### Backend (`backend/.env.local`)

| Variável                  | Local                                      | Produção (Render)                              |
|---------------------------|--------------------------------------------|------------------------------------------------|
| `DATABASE_URL`            | `postgresql://postgres:postgres@localhost:5432/viston` | URL pooling do Supabase (porta 6543)  |
| `DIRECT_URL`              | igual ao DATABASE_URL local                | URL direta do Supabase (porta 5432)            |
| `SUPABASE_URL`            | `http://localhost:54321` (Supabase CLI)    | `https://<ref>.supabase.co`                    |
| `SUPABASE_SERVICE_ROLE_KEY` | chave local do Supabase CLI             | chave service_role do projeto Supabase         |
| `JWT_SECRET`              | qualquer string local                      | string aleatória segura (32+ chars)            |
| `JWT_REFRESH_SECRET`      | qualquer string local                      | string aleatória segura (32+ chars)            |
| `FRONTEND_URL`            | `http://localhost:3000`                    | `https://viston.vercel.app`                    |
| `PORT`                    | `3001`                                     | definido automaticamente pelo Render           |

### Frontend (`frontend/.env.local`)

| Variável               | Local                          | Produção (Vercel)                          |
|------------------------|--------------------------------|--------------------------------------------|
| `NEXT_PUBLIC_API_URL`  | `http://localhost:3001/api`    | `https://viston-api.onrender.com/api`      |

---

## 3. Checklist de Deploy para Produção

### 3.1 Supabase (banco + storage)

- [ ] Criar projeto em [supabase.com](https://supabase.com)
- [ ] Copiar `DATABASE_URL` (pooling, porta 6543) e `DIRECT_URL` (porta 5432) do painel
- [ ] Criar bucket `viston` em Storage → marcar como **público**
- [ ] Copiar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do painel (Settings → API)

### 3.2 Render (backend)

- [ ] Criar Web Service apontando para a pasta `backend/`
- [ ] Build command: `npm install && npx prisma generate && npm run build`
- [ ] Start command: `npm run start`
- [ ] Configurar todas as variáveis de ambiente do backend no painel do Render
- [ ] Após o primeiro deploy, rodar as migrations:
  ```bash
  # Via Render Shell ou localmente com DIRECT_URL de produção:
  npx prisma migrate deploy
  npm run seed
  ```

### 3.3 Vercel (frontend)

- [ ] Importar o repositório na Vercel, apontando para a pasta `frontend/`
- [ ] Configurar variável de ambiente:
  - `NEXT_PUBLIC_API_URL` = URL pública do serviço no Render (ex: `https://viston-api.onrender.com/api`)
- [ ] Deploy automático a cada push na branch principal

### 3.4 Troca de ambiente local → produção

A migração é **apenas troca de variáveis de ambiente** — nenhuma linha de código muda:

1. No Render: substitua `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`
2. Na Vercel: substitua `NEXT_PUBLIC_API_URL`
3. Rode `npx prisma migrate deploy` no ambiente de produção
4. Rode `npm run seed` para criar o usuário admin inicial

---

## 4. Testes

```bash
cd backend
npm test              # testes unitários
npm run test:cov      # com cobertura
```

Cobertura mínima garantida para:
- `AuthService` (login, refresh, usuário deletado)
- `InspectionsService` (start, finish, RBAC, andares faltando)

---

## 5. Arquitetura de Acesso por Role

| Funcionalidade              | ADMIN | INSPECTOR | VIEWER |
|-----------------------------|:-----:|:---------:|:------:|
| Fazer inspeção (mobile)     | ✅    | ✅        | ❌     |
| Ver histórico               | ✅    | ✅ (próprio) | ✅   |
| Ver calendário              | ✅    | ✅        | ✅     |
| Painel admin (sidebar)      | ✅    | ❌        | ❌     |
| Criar/gerenciar usuários    | ✅    | ❌        | ❌     |
| Editar perfil próprio       | ✅    | ✅        | ✅     |
