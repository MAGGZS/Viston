# Viston — Sistema de Vistoria Predial

Stack: Next.js (frontend) + Express (backend) + PostgreSQL via Supabase + Prisma ORM

---

## Estrutura do Projeto

```
viston/
├── backend/    # API REST (Express + Prisma)
└── frontend/   # Web App (Next.js + Tailwind)
```

---

## Pré-requisitos

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para banco local)

---

## 1. Ambiente Local

### 1.1 Banco de dados local (Supabase CLI)

```bash
# Instalar Supabase CLI (se não tiver)
npm install -g supabase

# Iniciar instância local (Postgres + Storage)
supabase start
```

Após o `supabase start`, copie a `service_role key` exibida no terminal e cole em `backend/.env.local`.

### 1.2 Backend

```bash
cd backend
npm install

# Aplicar migrations e gerar client Prisma
npx prisma migrate dev --name init

# Popular banco com dados de exemplo
npm run db:seed

# Iniciar servidor (porta 3001)
npm run dev
```

### 1.3 Frontend

```bash
cd frontend
npm install

# Iniciar Next.js (porta 3000)
npm run dev
```

Acesse: http://localhost:3000

### 1.4 Credenciais de teste

| Perfil    | E-mail                | Senha         |
|-----------|-----------------------|---------------|
| ADMIN     | admin@viston.com      | admin123      |
| INSPECTOR | joao@viston.com       | inspector123  |
| INSPECTOR | maria@viston.com      | inspector123  |
| VIEWER    | viewer@viston.com     | viewer123     |

---

## 2. Testes

```bash
cd backend
npm test
```

Os testes rodam 100% localmente com mocks — sem dependência de URLs externas.

---

## 3. Deploy para Produção

### 3.1 Supabase (banco + storage)

1. Crie um projeto em https://supabase.com
2. Crie os buckets `photos` e `reports` em **Storage** (acesso público)
3. Anote: `Project URL`, `service_role key`, `connection string` (pooling e direct)
4. Aplique as migrations no banco hospedado:
   ```bash
   cd backend
   # Defina DIRECT_URL com a connection string direta (não pooling)
   npx prisma migrate deploy
   npm run db:seed
   ```

### 3.2 Backend (Render)

1. Crie um **Web Service** no Render apontando para `/backend`
2. Build command: `npm install && npx prisma generate`
3. Start command: `node src/server.js`
4. Configure as variáveis de ambiente:

| Variável                  | Valor                                              |
|---------------------------|----------------------------------------------------|
| `DATABASE_URL`            | Connection string **pooling** do Supabase          |
| `DIRECT_URL`              | Connection string **direta** do Supabase           |
| `SUPABASE_URL`            | `https://<project-ref>.supabase.co`                |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key do Supabase                     |
| `JWT_SECRET`              | String aleatória forte (ex: `openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET`      | Outra string aleatória forte                       |
| `PORT`                    | `3001`                                             |
| `FRONTEND_URL`            | `https://<seu-app>.vercel.app`                     |

### 3.3 Frontend (Vercel)

1. Importe o repositório na Vercel, defina **Root Directory** como `frontend`
2. Configure a variável de ambiente:

| Variável               | Valor                                        |
|------------------------|----------------------------------------------|
| `NEXT_PUBLIC_API_URL`  | `https://<seu-backend>.onrender.com/api`     |

3. Deploy automático a cada push na branch `main`

---

## 4. Checklist de Troca Local → Produção

- [ ] `backend/.env.local` → substituir por variáveis no painel do Render
- [ ] `frontend/.env.local` → substituir `NEXT_PUBLIC_API_URL` pela URL do Render na Vercel
- [ ] Buckets `photos` e `reports` criados no Supabase Storage
- [ ] Migrations aplicadas no banco hospedado (`prisma migrate deploy`)
- [ ] Seed executado no banco hospedado (`npm run db:seed`)
- [ ] CORS no backend apontando para o domínio da Vercel (`FRONTEND_URL`)

---

## 5. Variáveis de Ambiente — Resumo

### backend/.env.local (desenvolvimento)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:postgres@localhost:54322/postgres
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<local-key-from-supabase-start>
JWT_SECRET=local-dev-jwt-secret
JWT_REFRESH_SECRET=local-dev-refresh-secret
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### frontend/.env.local (desenvolvimento)
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

---

## 6. Funcionalidades

### Mobile (operacional)
- Login com e-mail + senha
- Home com heatmap mensal de atividade
- Fluxo de inspeção: seleção de andares → forms por andar → geração de relatório
- Histórico de relatórios com download de PDF e Excel
- Perfil: editar dados, alterar senha, excluir conta (soft delete)

### Desktop (visualização)
- Calendário com toggle mensal / semestral / anual
- Histórico com filtros avançados

### Admin (desktop)
- Gerenciamento de usuários (criar, editar role, ativar/desativar)
- Histórico completo com filtros por inspetor e período
- Calendário de atividade com drill-down por dia

### Relatórios
- PDF gerado com Puppeteer (capa + checklist por andar + fotos)
- Excel gerado com ExcelJS (aba resumo + aba por andar)
- Arquivos armazenados no Supabase Storage
