# Viston

Sistema de vistoria e manutenção predial. O inspetor percorre o prédio andar por andar pelo celular, registra as ocorrências encontradas e envia a vistoria concluída de uma só vez; o sistema consolida o relatório do dia, gera a planilha em Excel, alimenta o histórico e o mapa de calor, e transforma cada ocorrência em um chamado acompanhado até o fechamento.

---

## Como funciona

- **Prédios e vínculo**: cada prédio possui andares cadastrados, uma chave permanente de compartilhamento de 12 caracteres (`share_key`, sem caracteres ambíguos como `0/O/1/I/L`) e tokens temporários de 15 minutos para entrada rápida via QR Code, link direto ou código rotativo. Usuários pedem acesso ao prédio, entram como `VIEWER` após aprovação do gestor e só enxergam dados dos prédios aos quais estão vinculados.
- **Vistoria em requisição única**: a vistoria inteira é preenchida com rascunho local e enviada já concluída em uma única chamada (`POST /inspections`), protegida por `Idempotency-Key` contra toque duplo ou reenvio de rede. O status de cada andar é derivado da maior prioridade relatada nele (`ALTA` → `PROBLEMA`, `MEDIA` → `ATENCAO`, demais casos → `OK`). Também é possível registrar ocorrências avulsas fora do roteiro de vistoria.
- **Relatório do dia e planilha (`.xlsx`)**: a unidade do relatório consolidado é o **dia** no fuso do prédio (`America/Sao_Paulo`), e não a vistoria individual. Se três inspetores vistoriarem o mesmo prédio no mesmo dia, o sistema gera um único documento consolidado com os três nomes em *"Inspeção feita por"*. A planilha é montada em background via ExcelJS e guardada em bucket privado no Supabase Storage, acessível apenas por URL assinada de curta duração.
- **Fluxo de chamados**: cada ocorrência registrada nasce como um chamado `ABERTO`. O moderador do prédio encaminha o chamado a um responsável técnico (`ENCAMINHADO`), que confirma o recebimento (`EM_ANDAMENTO`), registra o passo a passo da execução na linha do tempo (`TicketUpdate`, com texto e fotos) ou sinaliza dependência externa (`AGUARDANDO_TERCEIRO`), e informa quando terminou (`AGUARDANDO_FECHAMENTO`). Informar conclusão não encerra o chamado: somente o moderador dá o fechamento definitivo (`CONCLUIDO`), podendo registrar nota de manutenção, custo em reais e exportar o relatório do período em Word (`.docx`) ou CSV.
- **Histórico e calendário**: as vistorias concluídas alimentam um mapa de calor mensal, semestral ou anual restrito aos prédios visíveis pela conta. O histórico lista cada vistoria individualmente, e abrir qualquer uma delas exibe o relatório consolidado daquele dia.
- **Planos, cobrança e titularidade**: toda conta de gestor nasce no plano **Livre** (1 prédio, 1 pessoa por papel operacional, 1 GB de fotos e 100 e-mails/mês, sem prazo de expiração) e pode assinar os planos **Essencial** ou **Pro** via Stripe — ou receber uma concessão administrativa (`PlanGrant`). Um prédio pode ter vários co-gestores (`BuildingManager`), mas tem um único dono pagante (`owner_manager_id`), com fluxo formal de transferência de titularidade (`BuildingOwnershipTransfer`, com prazo de 7 dias para aceite) e congelamento (`frozen_at`) caso limites ou prazos não sejam regularizados.

---

## Papéis e tipos de conta

O controle de acesso é dividido em dois eixos independentes:

### 1. Natureza da conta

Contas de gestor e contas de usuário comum vivem em tabelas separadas (`managers` e `users`) e possuem cadastros próprios:

| Conta | Onde vive | O que faz |
|---|---|---|
| **Gestor** (`MANAGER`) | `managers` | Cadastra prédios, aprova membros, define papéis, gerencia co-gestores e responde pela assinatura do plano. **Não realiza vistorias.** |
| **Usuário** (`USER`) | `users` (`role: NONE`) | Conta operacional. Nasce sem vínculo e recebe permissões prédio a prédio em `building_members`. |
| **Admin** (`ADMIN`) | `users` (`role: ADMIN`) | Conta de suporte da plataforma. Administra contas de usuários e gestores, concessões de planos (`PlanGrant`) e caixa de feedbacks. Não possui prédio. |

### 2. Papel dentro do prédio (`BuildingRole`)

Determina o que uma conta de usuário faz em um prédio específico. A mesma conta pode ter papéis diferentes em prédios diferentes:

| Papel | Interface principal | O que faz |
|---|---|---|
| `INSPECTOR` | Mobile | Percorre os andares, realiza vistorias e registra ocorrências. |
| `RESPONSAVEL` | Mobile | Recebe chamados encaminhados, atualiza o andamento com fotos/relatos e informa a conclusão do serviço. |
| `MODERADOR` | Desktop / Mobile | Tria chamados recém-abertos, encaminha aos responsáveis, acompanha estatísticas/custos e fecha chamados concluídos. |
| `VIEWER` | Desktop | Papel inicial de todo membro aprovado. Consulta relatórios, histórico e painéis do prédio. |

---

## Stack

### Frontend ([`frontend/`](frontend/))
- **Next.js 16** (App Router, JavaScript) + **React 19**
- **TanStack Query v5** (estado de servidor e cache) + **Zustand v5** (sessão, sidebar, toasts e guarda de alterações não salvas)
- **Axios** com interceptors para renovação silenciosa de access token
- **React Hook Form** + **Yup** para formulários e validação
- **Tailwind CSS v4**, **Lucide React**, **date-fns** e **qrcode.react**
- **Jest**, **Testing Library** e **jest-axe** para testes unitários, de integração e de acessibilidade

### Backend ([`backend/`](backend/))
- **Node.js 22+** + **Express 4** + **TypeScript**
- **PostgreSQL** via **Supabase** com **Prisma 7** (`@prisma/adapter-pg`) e Row Level Security (RLS) ativa em todas as tabelas públicas
- **Supabase Storage** (bucket público para fotos/avatares e bucket privado com URL assinada para planilhas `.xlsx`)
- **ExcelJS** (planilha diária de vistorias) e **docx** (relatório de chamados do período em Word)
- **Autenticação**: JWT (`access_token` de 15 min + `refresh_token` de 7 dias com invalidação imediata por `token_version`), senhas com **bcrypt** (custo 12) e confirmação de e-mail / recuperação de senha por código OTP de 6 dígitos (`sha256` + `timingSafeEqual`) enviado via API HTTPS da **Brevo**
- **Stripe** para checkout, portal do cliente e webhooks idempotentes (`stripe_events`)
- **Zod** (validação estrita de payloads), **helmet**, **express-rate-limit** e **pino** / **pino-http** (logs estruturados com redação de dados sensíveis)
- **Jest** + **Supertest** para testes automatizados

---

## Estrutura do repositório

```text
.
├── backend/                  # API Express + TypeScript + Prisma
│   ├── src/                  # Controllers, services, repositories, routes, middlewares e testes
│   ├── prisma/               # schema.prisma e migrations SQL versionadas
│   ├── docs/openapi.yaml     # Especificação OpenAPI 3.0
│   ├── render.yaml           # Configuração de deploy no Render
│   └── README.md             # Documentação detalhada do backend, segurança e endpoints
├── frontend/                 # Aplicação Next.js 16 (App Router)
│   ├── app/                  # Rotas, componentes, hooks, stores Zustand e testes
│   ├── public/               # Ícones PWA, assets e llms.txt
│   └── README.md             # Documentação detalhada do frontend, rotas e SEO
└── .github/workflows/
    ├── ci.yml                # Tipos + testes no backend; lint + testes + build no frontend
    ├── planos.yml            # Ciclo diário de planos e transferências (POST /jobs/planos)
    └── keepalive.yml         # Ping periódico em /health para evitar cold start no Render
```

---

## Configurando e rodando localmente

### Pré-requisitos

- **Node.js 22+** (exigido pelo `engines` nos dois pacotes e pelo WebSocket nativo usado pelo cliente do Supabase)
- **npm**
- **PostgreSQL** local (via [Supabase CLI](https://supabase.com/docs/guides/cli) com `supabase start` ou via Docker)
- Chave de API da **Brevo** (`BREVO_API_KEY` e `EMAIL_FROM`) para envio de códigos de confirmação e recuperação de senha

### 1. Backend (`http://localhost:4000`)

```bash
cd backend
npm install
cp .env.example .env.local
```

Preencha as variáveis obrigatórias em `backend/.env.local` (`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `BREVO_API_KEY` e `EMAIL_FROM`). Em seguida, gere o cliente Prisma, aplique as migrations e suba o servidor:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

A API responderá em `http://localhost:4000` (verifique com `GET http://localhost:4000/health`). Para instruções completas de banco com Supabase CLI, Docker ou baseline de banco existente, consulte [`backend/README.md`](backend/README.md).

### 2. Frontend (`http://localhost:3001`)

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

O app subirá em `http://localhost:3001`. Em `localhost`, o frontend aponta automaticamente para `http://localhost:4000` sem exigir arquivo `.env` (veja [`frontend/.env.example`](frontend/.env.example) caso queira sobrescrever `NEXT_PUBLIC_API_URL`). Mais detalhes em [`frontend/README.md`](frontend/README.md).

---

## Testes e verificação

As suítes de teste do backend e do frontend rodam de forma isolada, sem depender de conexão com banco de dados externo:

```bash
# Backend: checagem de tipos e suíte Jest + Supertest
cd backend
npx tsc --noEmit
npm test

# Frontend: ESLint (incluindo jsx-a11y), suíte Jest + Testing Library + jest-axe e build
cd ../frontend
npm run lint
npm test
npm run build
```

Todas essas etapas são executadas automaticamente em cada Pull Request e push na `main` pelo workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Deploy e fluxo de branches

- **Produção**: a branch `main` publica automaticamente — a **Vercel** serve o frontend e o **Render** constrói a API e aplica `prisma migrate deploy` (conforme [`backend/render.yaml`](backend/render.yaml)).
- **Preview e revisão**: o desenvolvimento é feito em branches a partir da `main` atualizada e submetido via Pull Request. Qualquer branch fora da `main` gera ambiente de preview na Vercel para validação antes do merge.
- **Documentação complementar**:
  - [`backend/README.md`](backend/README.md) — variáveis de ambiente de produção, arquitetura de segurança, rate limits e lista de endpoints.
  - [`frontend/README.md`](frontend/README.md) — organização das rotas do App Router, papéis no cliente, tema e metadados/PWA.
  - [`frontend/public/llms.txt`](frontend/public/llms.txt) — resumo executivo das regras de negócio do produto.
