# Graph Report - Viston  (2026-08-08)

## Corpus Check
- 73 files · ~27,399 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 444 nodes · 828 edges · 19 communities (15 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0b7e7791`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useApi.js
- inspection.service.ts
- dependencies
- dependencies
- devDependencies
- user.routes.ts
- inspection.test.ts
- compilerOptions
- Viston Backend API
- layout.js
- register/page.js
- FloorForm.js
- frontend/README.md
- compilerOptions
- eslint.config.mjs
- next.config.mjs
- postcss.config.mjs

## God Nodes (most connected - your core abstractions)
1. `useAuthStore` - 20 edges
2. `useToastStore` - 19 edges
3. `compilerOptions` - 17 edges
4. `scripts` - 11 edges
5. `RouteGuard()` - 11 edges
6. `useMyBuildings()` - 11 edges
7. `NotFoundError` - 10 edges
8. `Button()` - 10 edges
9. `PerfilPage()` - 10 edges
10. `UnauthorizedError` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Toast()` --calls--> `useToastStore`  [EXTRACTED]
  frontend/app/components/Toast.js → frontend/app/store/toast.js
- `AdminUsersPage()` --calls--> `useCreateUser()`  [EXTRACTED]
  frontend/app/desktop/admin/page.js → frontend/app/hooks/useApi.js
- `InspectionCard()` --calls--> `useAuthStore`  [EXTRACTED]
  frontend/app/historico/page.js → frontend/app/store/auth.js
- `AuthProvider()` --calls--> `useAuthStore`  [EXTRACTED]
  frontend/app/lib/AuthProvider.js → frontend/app/store/auth.js
- `LoginPage()` --calls--> `useAuthStore`  [EXTRACTED]
  frontend/app/login/page.js → frontend/app/store/auth.js

## Import Cycles
- None detected.

## Communities (19 total, 4 thin omitted)

### Community 0 - "useApi.js"
Cohesion: 0.06
Nodes (81): AdminSidebar(), items, BottomNav(), items, CalendarHeatmap(), DAYS, getIntensity(), RouteGuard() (+73 more)

### Community 1 - "inspection.service.ts"
Cohesion: 0.07
Nodes (41): authController, buildingController, inspectionController, authenticate(), AuthenticatedRequest, authorize(), auditRepository, buildingRepository (+33 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (45): dependencies, bcrypt, cors, dotenv, exceljs, express, express-async-errors, jsonwebtoken (+37 more)

### Community 3 - "dependencies"
Cohesion: 0.05
Nodes (40): axios, date-fns, eslint, eslint-config-next, dependencies, axios, date-fns, @hookform/resolvers (+32 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (36): description, devDependencies, cross-env, jest, prisma, supertest, ts-jest, ts-node (+28 more)

### Community 5 - "user.routes.ts"
Cohesion: 0.11
Nodes (17): app, config, userController, prisma, supabase, errorHandler(), validate(), router (+9 more)

### Community 6 - "inspection.test.ts"
Cohesion: 0.12
Nodes (19): inspectionRepository, dataCell(), FullReport, generateInspectionExcel(), headerStyle(), STATUS_LABEL, buildFormPayload(), sleep() (+11 more)

### Community 7 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, declaration, declarationMap, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames, lib (+17 more)

### Community 8 - "Viston Backend API"
Cohesion: 0.12
Nodes (16): 1. Criar Web Service no Render, 1. Instalar dependências, 2. Configurar variáveis de ambiente, 2. Variáveis de ambiente no Render, 3. Checklist de troca para produção, 3. Rodar migrations e seed, 4. Iniciar servidor, Deploy no Render (+8 more)

### Community 9 - "layout.js"
Cohesion: 0.17
Nodes (9): ErrorLogModal(), formatDetail(), STYLES, Toast(), metadata, api, failedQueue, AuthProvider() (+1 more)

### Community 10 - "register/page.js"
Cohesion: 0.27
Nodes (8): useCreateUser(), useLogin(), LoginPage(), S, schema, RegisterPage(), S, schema

### Community 11 - "FloorForm.js"
Cohesion: 0.22
Nodes (5): FloorForm(), schema, STATUS_LABELS, STATUS_OPTIONS, Toggle()

### Community 12 - "frontend/README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

## Knowledge Gaps
- **160 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+155 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `devDependencies`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `useToastStore` connect `useApi.js` to `layout.js`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _160 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useApi.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05531135531135531 - nodes in this community are weakly interconnected._
- **Should `inspection.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07211538461538461 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._