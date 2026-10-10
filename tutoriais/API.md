# Central de ajuda: contrato da API

Contrato das rotas da central de ajuda, para construir as telas de `/ajuda`
(usuário) e de `/desktop/admin/tutoriais` (admin) sem abrir o backend. Tudo
aqui está implementado em `backend/src/routes/help.routes.ts` e coberto por
`backend/src/__tests__/ajudaRotas.test.ts`.

## Mudanças de 2026-10-10 (tutorial visível sem vídeo)

O tutorial passou a valer sem vídeo: os passos em texto já ensinam, e o vídeo,
quando chegar, aparece no topo da mesma página. O que mudou no contrato:

- O seed cria as funcionalidades **publicadas** (`published: true`). O que o
  admin despublicou continua despublicado; o seed nunca publica de novo.
- `GET /help/folders`, `GET /help/folders/:slug`, `GET /help/features/:slug` e
  a busca passam a incluir funcionalidades publicadas sem vídeo. Nelas
  `video_url`, `captions_url`, `poster_url`, `urls_expire_at` e `duration_s`
  são `null`, e todo `start_s` é `null`. Não é erro: a tela mostra só as abas
  em texto, sem player.
- `POST /admin/help/features/:id/publish` não exige mais vídeo. O erro
  `409 SEM_VIDEO` deixou de existir.
- Admin: campo novo `video_state` (`SEM_VIDEO`, `EM_DIA`, `DESATUALIZADO`) em
  `AdminFeature` e em cada funcionalidade da árvore, para ser lido junto com
  `published`. O `state` antigo continua vindo, igual, só para a transição.
- `GET /admin/help/tree`: campos novos `total`, `published_counts` e
  `video_counts`. O `counts` antigo continua vindo, igual.
- `POST /help/features/:slug/feedback`: o teto agora é por conta, 20 por hora,
  com a mensagem `Muitas respostas em sequência. Tente de novo mais tarde.`
- Rota nova `POST /admin/help/features/publish-batch`: publica ou despublica
  vários tutoriais de uma vez (a seleção da árvore do admin). As rotas
  individuais `publish` e `unpublish` continuam.

## Convenções

- Base: a mesma da API (`NEXT_PUBLIC_API_URL`). Todas as rotas exigem
  `Authorization: Bearer <access token>`, de conta comum ou de gestor.
- Datas em ISO 8601 (UTC). Tempos de vídeo em segundos, número decimal
  (`start_s`, `duration_s`).
- Erro sempre neste formato (o mesmo do resto da API, lido por
  `frontend/app/lib/erros.js`):

```json
{ "error": { "code": "PACOTE_INVALIDO", "message": "O arquivo capa.jpg não é uma imagem JPEG.", "details": { "arquivo": "capa.jpg" } } }
```

  `details` só aparece quando há algo a acrescentar. Erro de validação do corpo
  ou da query é sempre:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Payload inválido", "details": [ { "path": "q", "message": "Digite ao menos 2 letras" } ] } }
```

- Erros comuns a todas as rotas:

| Status | `code` | `message` | Quando |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | `Token não fornecido` | sem cabeçalho `Authorization` |
| 401 | `UNAUTHORIZED` | `Token inválido ou expirado` | token vencido ou adulterado (o `useApi` já renova) |
| 403 | `FORBIDDEN` | `Acesso restrito a: ADMIN` | rota `/admin/help/...` com conta que não é ADMIN (inclusive gestor) |
| 429 | `TOO_MANY_REQUESTS` | `Muitas requisições. Aguarde um instante.` | teto geral por IP |
| 500 | `INTERNAL_ERROR` | `Erro interno do servidor` | defeito |

### Vocabulário

- **Pasta** (`folder`): um cargo. `slug` é o pedaço da URL (`/ajuda/inspetor`).
  Slugs atuais: `primeiros-passos`, `gestor`, `inspetor`, `responsavel`,
  `moderador`, `visualizador`.
- **Funcionalidade** (`feature`): um tutorial com um vídeo. `slug` é o `id` do
  roteiro (`inspetor-vistoria-completa`).
- **Aba** (`step`): um passo e um capítulo do vídeo. `order` começa em 1 e é o
  `N` de `?passo=N`. `start_s` é nulo enquanto não há vídeo.
- **Publicação** (`published`): se o tutorial aparece para as contas. Não
  depende de vídeo. Funcionalidade nova nasce publicada; quem tira do ar é o
  admin.
- **`device`**: `MOBILE` (gravado no celular) ou `DESKTOP` (no computador).
- **`icon`**: nome de componente do `lucide-react` (`Rocket`, `Building2`,
  `ClipboardCheck`, `Wrench`, `ShieldCheck`, `Eye`).
- **Situação do vídeo** (`video_state`, só no admin, calculada a cada
  leitura). Independe de `published`: a tela mostra as duas coisas lado a lado
  (por exemplo, um selo "No ar" / "Fora do ar" e outro do vídeo).

| `video_state` | Significa |
|---|---|
| `SEM_VIDEO` | nenhum vídeo enviado. Publicada, a página mostra só os passos em texto |
| `EM_DIA` | tem vídeo, gravado com o roteiro atual (`video_script_hash` igual ao `script_hash` do `catalogo.json`) |
| `DESATUALIZADO` | tem vídeo, mas o roteiro mudou depois da gravação, ou a funcionalidade saiu do roteiro. Continua no ar se `published`; pede um vídeo novo |

- **`state`** (legado, só no admin): o campo único de antes, mantido igual para
  a tela migrar sem quebrar. Não use em tela nova. Regra: `SEM_VIDEO` e
  `DESATUALIZADO` são os mesmos de `video_state` (e agora podem estar
  publicados); com `video_state: "EM_DIA"`, é `PUBLICADO` ou `RASCUNHO`
  conforme `published`.

| `published` | `video_state` | `state` (legado) |
|---|---|---|
| `true` / `false` | `SEM_VIDEO` | `SEM_VIDEO` |
| `true` | `EM_DIA` | `PUBLICADO` |
| `false` | `EM_DIA` | `RASCUNHO` |
| `true` / `false` | `DESATUALIZADO` | `DESATUALIZADO` |

### URLs assinadas

`video_url`, `captions_url` e `poster_url` apontam para o bucket privado
`tutoriais` e valem 4 horas a partir de quando foram assinadas.
`urls_expire_at` diz quando a primeira delas expira. O backend reaproveita a
mesma URL enquanto ela tiver pelo menos 1 hora de vida, então duas leituras
seguidas devolvem a mesma URL e o navegador usa o cache. Se a tela ficar aberta
além de `urls_expire_at` (o `<video>` passa a dar erro de rede), busque a
funcionalidade de novo e troque as URLs. As URLs aceitam `Range` (o `<video>`
com `preload="metadata"` só baixa o começo).

URL assinada não se revoga: um link já entregue vale até expirar (no máximo 4
horas depois de assinado), mesmo que o tutorial seja despublicado ou o vídeo
trocado nesse meio tempo. O que o `unpublish` faz é esquecer as URLs guardadas
do vídeo, da legenda e da capa, para que nenhuma resposta nova entregue de novo
o mesmo link (nem depois de publicar outra vez).

---

## Leitura (qualquer conta autenticada)

### `GET /help/folders`

As pastas que a conta enxerga, na ordem definida pelo admin.

- Pasta com `admin_only: true` só vem para ADMIN. Hoje nenhuma pasta usa: o
  ADMIN não tem tutorial sobre o próprio cargo (ele administra os vídeos de
  todos pelas rotas `/admin/help/...`).
- `mine: true` quando a pasta é do cargo da conta: gestor tem `gestor`; conta
  comum tem a pasta de cada papel que ela tem em
  algum prédio (`inspetor`, `visualizador`, `moderador`, `responsavel`), e
  `primeiros-passos` quando ainda não tem nenhum prédio. Agrupe por `mine`:
  `true` em "Seu cargo", `false` em "Outros cargos", mantendo a ordem dentro de
  cada grupo.
- `feature_count` é o número de tutoriais **publicados**, com ou sem vídeo.
  Pode ser 0 (o admin despublicou todos); esconder ou não é decisão da tela.

Resposta `200`:

```json
{
  "folders": [
    {
      "id": "3f2c0d4e-8a1b-4c5d-9e6f-0a1b2c3d4e5f",
      "slug": "primeiros-passos",
      "title": "Primeiros passos",
      "description": "Criar a conta, entrar em um prédio e conhecer o seu perfil.",
      "icon": "Rocket",
      "order": 1,
      "admin_only": false,
      "mine": true,
      "feature_count": 5
    }
  ]
}
```

### `GET /help/folders/:slug`

Uma pasta e as funcionalidades **publicadas** dela, em ordem.

Resposta `200`:

```json
{
  "folder": {
    "id": "3f2c0d4e-8a1b-4c5d-9e6f-0a1b2c3d4e5f",
    "slug": "inspetor",
    "title": "Inspetor",
    "description": "Fazer a vistoria andar por andar, retomar e consultar o histórico.",
    "icon": "ClipboardCheck",
    "order": 3,
    "admin_only": false,
    "mine": true,
    "feature_count": 1
  },
  "features": [
    {
      "id": "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d",
      "slug": "inspetor-vistoria-completa",
      "title": "Fazer uma vistoria completa",
      "summary": "A vistoria é feita andando pelo prédio, com o celular na mão.",
      "device": "MOBILE",
      "order": 1,
      "duration_s": 84.2,
      "poster_url": "https://<projeto>.supabase.co/storage/v1/object/sign/tutoriais/inspetor/inspetor-vistoria-completa/<envio>/capa.jpg?token=..."
    }
  ]
}
```

`summary`, `poster_url` e `duration_s` podem ser `null`. Tutorial publicado
sem vídeo vem na lista com `poster_url: null` e `duration_s: null`: o cartão
fica sem capa e sem duração (sugestão: um selo "Passo a passo em texto").

Erros: `404 NOT_FOUND` `Pasta não encontrada` quando o slug não existe, está
fora do formato, ou é a pasta do admin vista por quem não é ADMIN (a tela não
precisa distinguir: a pasta não existe para essa conta).

### `GET /help/features/:slug`

Uma funcionalidade **publicada**, as abas e as URLs do vídeo, da legenda e da
capa. É a Tela 3 do usuário.

Resposta `200`:

```json
{
  "feature": {
    "id": "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d",
    "slug": "inspetor-vistoria-completa",
    "title": "Fazer uma vistoria completa",
    "summary": "A vistoria é feita andando pelo prédio, com o celular na mão.",
    "device": "MOBILE",
    "duration_s": 84.2,
    "folder": { "slug": "inspetor", "title": "Inspetor" },
    "video_url": "https://<projeto>.supabase.co/storage/v1/object/sign/tutoriais/.../video.mp4?token=...",
    "captions_url": "https://<projeto>.supabase.co/storage/v1/object/sign/tutoriais/.../legenda.vtt?token=...",
    "poster_url": "https://<projeto>.supabase.co/storage/v1/object/sign/tutoriais/.../capa.jpg?token=...",
    "urls_expire_at": "2026-10-09T20:15:00.000Z",
    "steps": [
      { "id": "0b1c2d3e-...", "order": 1, "title": "Começar", "body": "A vistoria é feita andando pelo prédio...", "start_s": 0 },
      { "id": "1c2d3e4f-...", "order": 2, "title": "Escolher os andares", "body": "Marque os andares...", "start_s": 9.4 }
    ],
    "my_feedback": null
  }
}
```

- `steps` vem em ordem. Clicar na aba `N` leva o vídeo a `steps[N-1].start_s`.
  A aba ativa durante a reprodução é a última com `start_s <= currentTime`.
- **Sem vídeo** (tutorial publicado que ainda não ganhou vídeo): `video_url`,
  `captions_url`, `poster_url`, `urls_expire_at` e `duration_s` são `null`, e
  todo `start_s` é `null`. Resposta `200` normal, não é erro. A tela não monta
  o player; mostra as abas em texto, todas navegáveis por `?passo=N`. Quando o
  vídeo chegar, a mesma rota passa a trazer as URLs e os tempos, e o player
  aparece no topo.

Exemplo sem vídeo:

```json
{
  "feature": {
    "id": "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d",
    "slug": "inspetor-vistoria-completa",
    "title": "Fazer uma vistoria completa",
    "summary": "A vistoria é feita andando pelo prédio, com o celular na mão.",
    "device": "MOBILE",
    "duration_s": null,
    "folder": { "slug": "inspetor", "title": "Inspetor" },
    "video_url": null,
    "captions_url": null,
    "poster_url": null,
    "urls_expire_at": null,
    "steps": [
      { "id": "0b1c2d3e-...", "order": 1, "title": "Começar", "body": "A vistoria é feita andando pelo prédio...", "start_s": null }
    ],
    "my_feedback": null
  }
}
```

- `my_feedback` é `null` se a conta ainda não respondeu o "Isso ajudou?" deste
  tutorial, ou `{ "helpful": true, "created_at": "2026-10-09T12:00:00.000Z" }`.
- A legenda é WebVTT em português: `<track kind="captions" srclang="pt-BR" src={captions_url} default>`.
  Como a URL é de outro domínio, o `<video>` precisa de `crossOrigin="anonymous"`
  para o navegador carregar a `<track>` (o Supabase Storage responde com CORS
  aberto).

Erros: `404 NOT_FOUND` `Tutorial não encontrado` quando não existe, não está
publicado, está fora do formato, ou é da pasta do admin e a conta não é ADMIN.

### `GET /help/search?q=texto`

Busca nos títulos e textos das abas e nos títulos das funcionalidades
**publicadas** (com ou sem vídeo). Ignora caixa e acento (`predio` acha `prédio`). `%` e `_`
digitados são texto. A pasta do admin só entra para ADMIN. No máximo 20
resultados, em ordem de pasta, funcionalidade e aba.

Cada resultado é uma aba; o link é
`/ajuda/${folder_slug}/${feature_slug}?passo=${step_order}`.

Resposta `200`:

```json
{
  "results": [
    {
      "folder_slug": "primeiros-passos",
      "folder_title": "Primeiros passos",
      "feature_slug": "primeiros-passos-entrar-codigo",
      "feature_title": "Entrar em um prédio pelo código",
      "step_order": 2,
      "step_title": "Digitar e enviar",
      "snippet": "Digite o código exatamente como recebeu e toque em Buscar..."
    }
  ]
}
```

`snippet` é um trecho de até 160 caracteres do texto da aba, em volta do termo
quando ele está no texto, com `…` nas pontas cortadas. Nenhum resultado é
`{ "results": [] }`.

Erros: `400 VALIDATION_ERROR` com `details[0].path = "q"` e uma destas
mensagens: `Digite o que você procura` (sem `q`), `Digite ao menos 2 letras`,
`A busca deve ter no máximo 100 caracteres`.

### `POST /help/features/:slug/feedback`

O "Isso ajudou?". Uma resposta por conta e tutorial. Vira um feedback na caixa
do admin (`/desktop/admin/feedbacks`), com o tutorial na mensagem:
"Sim" sem comentário entra como mensagem (já lida); "Não", ou qualquer resposta
com comentário, entra como pendente.

Corpo:

```json
{ "helpful": false, "comment": "O vídeo passa rápido demais no passo 3." }
```

| Campo | Tipo | Regra |
|---|---|---|
| `helpful` | boolean | obrigatório |
| `comment` | string | opcional, até 2000 caracteres |

Resposta `201`:

```json
{ "feedback": { "id": "9d8c7b6a-...", "helpful": false, "created_at": "2026-10-09T12:00:00.000Z" } }
```

Erros:

| Status | `code` | `message` |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `Payload inválido` (`details`: `Responda sim ou não`, `O comentário deve ter no máximo 2000 caracteres`) |
| 404 | `NOT_FOUND` | `Tutorial não encontrado` |
| 409 | `JA_RESPONDIDO` | `Você já respondeu sobre este tutorial.` (também quando duas respostas da mesma conta chegam ao mesmo tempo: só uma grava) |
| 429 | `TOO_MANY_REQUESTS` | `Muitas respostas em sequência. Tente de novo mais tarde.` (20 por hora por conta, contadas à parte do resto da API) |

---

## Admin (somente ADMIN)

Todas exigem conta ADMIN ativa (conferida no banco a cada chamada) e respondem
`403 FORBIDDEN` `Acesso restrito a: ADMIN` para qualquer outra conta. Toda
escrita vai para a auditoria. `:id` é UUID; id fora do formato responde
`404 NOT_FOUND` `Registro não encontrado`.

### Objeto `AdminFeature`

Devolvido por várias rotas abaixo, sempre dentro de `{ "feature": ... }`.

```json
{
  "id": "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d",
  "slug": "inspetor-vistoria-completa",
  "title": "Fazer uma vistoria completa",
  "summary": "A vistoria é feita andando pelo prédio, com o celular na mão.",
  "device": "MOBILE",
  "order": 1,
  "published": false,
  "video_state": "EM_DIA",
  "state": "RASCUNHO",
  "in_catalog": true,
  "catalog_script_hash": "689b1f53...",
  "video_script_hash": "689b1f53...",
  "duration_s": 84.2,
  "video_uploaded_at": "2026-10-09T12:00:00.000Z",
  "video_uploaded_by": { "id": "aaaaaaaa-...", "name": "Suporte Viston" },
  "folder": { "id": "3f2c0d4e-...", "slug": "inspetor", "title": "Inspetor" },
  "video_url": "https://...video.mp4?token=...",
  "captions_url": "https://...legenda.vtt?token=...",
  "poster_url": "https://...capa.jpg?token=...",
  "urls_expire_at": "2026-10-09T16:00:00.000Z",
  "steps": [
    { "id": "0b1c2d3e-...", "order": 1, "title": "Começar", "body": "A vistoria é feita...", "start_s": 0 }
  ]
}
```

- Sem vídeo (`video_state: "SEM_VIDEO"`, publicada ou não): `video_url`,
  `captions_url`, `poster_url`, `urls_expire_at`, `duration_s`,
  `video_script_hash`, `video_uploaded_at` e `video_uploaded_by` são `null`, e
  todo `start_s` é `null`.
- `in_catalog: false` (e `catalog_script_hash: null`) quando a funcionalidade
  saiu do roteiro; ela continua no banco até o admin decidir.
- Para o aviso de **Desatualizado**: `video_state === "DESATUALIZADO"`. Texto
  sugerido: "O roteiro deste tutorial mudou depois da gravação. Gere o vídeo de
  novo e envie o pacote." O tutorial continua no ar enquanto `published`.
- Para o botão de publicar/despublicar: só `published`. Publicar não depende
  de vídeo.

### `GET /admin/help/tree`

A árvore inteira, inclusive o que não está publicado, com as contagens para o
topo da tela e os filtros.

- `total`: quantas funcionalidades há.
- `published_counts`: `{ "published": n, "unpublished": n }`, soma `total`.
- `video_counts`: `{ "SEM_VIDEO": n, "EM_DIA": n, "DESATUALIZADO": n }`, soma
  `total`. Os dois cortes são independentes. A tela usa os dois numa fileira
  só de filtro, um de cada vez: "Todos", os três de `video_counts` e, só
  quando `published_counts.unpublished > 0`, "Despublicados".
- `counts` (legado): a contagem pelo `state` antigo, igual a antes. Não use em
  tela nova.

Resposta `200`:

```json
{
  "total": 31,
  "published_counts": { "published": 30, "unpublished": 1 },
  "video_counts": { "SEM_VIDEO": 29, "EM_DIA": 2, "DESATUALIZADO": 0 },
  "counts": { "SEM_VIDEO": 29, "RASCUNHO": 1, "PUBLICADO": 1, "DESATUALIZADO": 0 },
  "folders": [
    {
      "id": "3f2c0d4e-...",
      "slug": "inspetor",
      "title": "Inspetor",
      "description": "Fazer a vistoria andar por andar, retomar e consultar o histórico.",
      "icon": "ClipboardCheck",
      "order": 3,
      "target_roles": ["INSPECTOR"],
      "admin_only": false,
      "features": [
        {
          "id": "6a7b8c9d-...",
          "slug": "inspetor-vistoria-completa",
          "title": "Fazer uma vistoria completa",
          "summary": "A vistoria é feita andando pelo prédio, com o celular na mão.",
          "device": "MOBILE",
          "order": 1,
          "published": true,
          "video_state": "SEM_VIDEO",
          "state": "SEM_VIDEO",
          "in_catalog": true,
          "step_count": 8,
          "duration_s": null,
          "video_uploaded_at": null
        }
      ]
    }
  ]
}
```

Pastas e funcionalidades vêm em ordem. Árvore vazia (`folders: []`) quer dizer
que o seed ainda não rodou: ofereça o botão de `POST /admin/help/sync`.

### `POST /admin/help/sync`

Roda o seed: leva o `catalogo.json` do deploy atual para o banco. Idempotente.
Cria o que falta (funcionalidades nascem publicadas, mesmo sem vídeo; o que o
admin despublicou continua despublicado), ajusta ícone,
`target_roles`, `admin_only`, dispositivo e número de abas, e nunca apaga vídeo
nem mexe em ordem, resumo, publicação ou tempos. Títulos e textos só são
reescritos com `textos: true` (usar depois de mudar a narração no roteiro; isso
desfaz ajustes manuais de título e texto).

Corpo (opcional): `{ "textos": true }`.

Resposta `200`:

```json
{
  "pastas": { "criadas": 0, "atualizadas": 0 },
  "funcionalidades": { "criadas": 1, "atualizadas": 0 },
  "abas": { "criadas": 5, "atualizadas": 0, "removidas": 0 }
}
```

Erros: `400 VALIDATION_ERROR` se o corpo tiver outro campo.

### `PATCH /admin/help/folders/:id`

Edita título e descrição da pasta. Corpo com pelo menos um dos dois:

```json
{ "title": "Inspetor", "description": "Fazer a vistoria andar por andar." }
```

| Campo | Regra |
|---|---|
| `title` | 1 a 120 caracteres |
| `description` | 1 a 300 caracteres |

Resposta `200`:

```json
{
  "folder": {
    "id": "3f2c0d4e-...", "slug": "inspetor", "title": "Inspetor",
    "description": "Fazer a vistoria andar por andar.", "icon": "ClipboardCheck",
    "order": 3, "target_roles": ["INSPECTOR"], "admin_only": false
  }
}
```

Erros: `400 VALIDATION_ERROR` (`Informe o que mudar`, `O título não pode ficar
vazio`, `O título deve ter no máximo 120 caracteres`, `A descrição não pode
ficar vazia`, `A descrição deve ter no máximo 300 caracteres`, ou campo fora do
contrato); `404 NOT_FOUND` `Pasta não encontrada`.

### `PATCH /admin/help/folders/order`

Reordena as pastas. `ids` com **todas** as pastas, cada uma uma vez, na ordem
nova.

```json
{ "ids": ["3f2c0d4e-...", "4a5b6c7d-...", "..."] }
```

Resposta `200`: a mesma de `GET /admin/help/tree`, já na ordem nova.

Erros: `400 VALIDATION_ERROR` `A nova ordem precisa listar todas as pastas,
cada uma uma vez.`, ou `Id inválido` / `Informe a nova ordem` no `details`.

### `PATCH /admin/help/folders/:id/features/order`

Reordena as funcionalidades de uma pasta. `ids` com todas as funcionalidades
dela.

```json
{ "ids": ["6a7b8c9d-...", "7b8c9d0e-..."] }
```

Resposta `200`: a mesma de `GET /admin/help/tree`.

Erros: `400 VALIDATION_ERROR` `A nova ordem precisa listar todas as
funcionalidades desta pasta, cada uma uma vez.`; `404 NOT_FOUND` `Pasta não
encontrada`.

### `GET /admin/help/features/:id`

A funcionalidade como o admin vê, com as abas e as URLs (mesmo sem estar
publicada). É a Tela 2 do admin e a pré-visualização.

Resposta `200`: `{ "feature": AdminFeature }`.

Erros: `404 NOT_FOUND` `Funcionalidade não encontrada`.

### `PATCH /admin/help/features/:id`

Edita título e resumo.

```json
{ "title": "Fazer uma vistoria completa", "summary": "Do primeiro ao último andar." }
```

| Campo | Regra |
|---|---|
| `title` | 1 a 120 caracteres |
| `summary` | até 300 caracteres; `""` ou `null` apaga |

Resposta `200`: `{ "feature": AdminFeature }`.

Erros: `400 VALIDATION_ERROR` (inclusive `published` ou outro campo no corpo:
publicar tem rota própria); `404 NOT_FOUND` `Funcionalidade não encontrada`.

### `PATCH /admin/help/steps/:id`

Ajuste fino de uma aba: título, texto e tempo de início. O botão "Usar o tempo
atual do vídeo" manda `{ "start_s": video.currentTime }` (arredondado no
servidor para milissegundos).

```json
{ "title": "Começar", "body": "A vistoria é feita andando pelo prédio.", "start_s": 12.5 }
```

| Campo | Regra |
|---|---|
| `title` | 1 a 120 caracteres |
| `body` | 1 a 2000 caracteres |
| `start_s` | número finito `>= 0` e menor que `duration_s`, ou `null` para apagar (`1e400` no JSON é infinito e dá `400`) |

Resposta `200`: `{ "feature": AdminFeature }` (a funcionalidade da aba, já
atualizada).

Erros:

| Status | `code` | `message` |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `Payload inválido` (`O tempo de início não pode ser negativo`, `O tempo de início precisa ser um número de segundos`, `Informe o que mudar`...) |
| 400 | `VALIDATION_ERROR` | `O tempo de início precisa ser menor que a duração do vídeo (84.2 s).` |
| 404 | `NOT_FOUND` | `Aba não encontrada` |
| 409 | `CONFLICT` | `Esta funcionalidade ainda não tem vídeo. Envie o vídeo antes de ajustar os tempos.` |

### Envio do vídeo: `upload-urls`, PUT direto e `commit`

O pacote gerado pela esteira (Prompt 2) é uma pasta com `video.mp4`,
`legenda.vtt`, `capa.jpg` e `passos.json`. Os arquivos **não** passam pelo
backend:

1. `POST /admin/help/features/:id/video/upload-urls` devolve uma URL de upload
   por arquivo, num diretório temporário novo.
2. A tela faz `PUT` de cada arquivo na URL dele, direto no Supabase (a barra de
   progresso vem daqui: use `XMLHttpRequest` com `upload.onprogress`, que o
   `fetch` não tem).
3. `POST /admin/help/features/:id/video/commit` com o `upload_id` confere tudo
   e põe no ar.

Antes do passo 1, a tela pode ler o `passos.json` escolhido e conferir
`pasta`/`id` contra a funcionalidade aberta, para avisar sem enviar 8 MB. O
servidor confere de novo no commit de qualquer jeito.

#### `POST /admin/help/features/:id/video/upload-urls`

Sem corpo. Resposta `201`:

```json
{
  "upload_id": "8e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b",
  "expires_in": 7200,
  "files": {
    "video.mp4": {
      "path": "tmp/6a7b8c9d-.../8e1f2a3b-.../video.mp4",
      "upload_url": "https://<projeto>.supabase.co/storage/v1/object/upload/sign/tutoriais/tmp/.../video.mp4?token=...",
      "token": "...",
      "content_type": "video/mp4",
      "max_bytes": 8388608
    },
    "legenda.vtt": { "path": "...", "upload_url": "...", "token": "...", "content_type": "text/vtt", "max_bytes": 524288 },
    "capa.jpg": { "path": "...", "upload_url": "...", "token": "...", "content_type": "image/jpeg", "max_bytes": 307200 },
    "passos.json": { "path": "...", "upload_url": "...", "token": "...", "content_type": "application/json", "max_bytes": 65536 }
  }
}
```

As URLs valem 2 horas (`expires_in`, em segundos) e cada uma só grava no seu
caminho. A cada pedido de URLs o servidor também apaga, em segundo plano, os
arquivos de envios abandonados em `tmp/` com mais de 24 horas (a resposta não
espera essa limpeza, e uma falha nela não vira erro). Confira `file.size <= max_bytes` antes de enviar: o servidor recusa no
commit, mas aí os 8 MB já subiram.

Erros: `404 NOT_FOUND` `Funcionalidade não encontrada`.

#### O `PUT` de cada arquivo (direto no Supabase, sem o token da API)

```
PUT <upload_url>
Content-Type: <content_type>
cache-control: max-age=31536000
x-upsert: false

<bytes do arquivo>
```

- Não mande `Authorization`: a assinatura está na própria URL.
- `Content-Type` tem que ser exatamente o `content_type` que veio em
  `upload-urls` (parâmetros como `; charset=utf-8` são aceitos). É com esse
  tipo que o Supabase grava e depois serve o arquivo, e o commit recusa o
  arquivo gravado com outro tipo.
- `cache-control` é opcional e recomendado: o caminho definitivo é único por
  envio (nunca é sobrescrito), então o navegador pode guardar o arquivo por um
  ano sem risco de mostrar vídeo velho.
- Sucesso: `200` com `{ "Key": "tutoriais/tmp/..." }`. Falha do Supabase (URL
  vencida, arquivo acima do limite do bucket): `4xx` com
  `{ "statusCode": "...", "error": "...", "message": "..." }`. Nesse caso, peça
  URLs novas e envie de novo.

#### `POST /admin/help/features/:id/video/commit`

```json
{ "upload_id": "8e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b" }
```

O que o servidor confere, nesta ordem, e para no primeiro problema:

0. O `upload_id` não é o do vídeo que já está no ar (commit repetido do mesmo
   envio dá `409 UPLOAD_JA_CONFIRMADO`, sem apagar nada).
1. Os quatro arquivos existem no diretório do envio, cada um cabe no limite
   (vídeo 8 MB, capa 300 KB, legenda 512 KB, passos 64 KB) e foi gravado com
   o `Content-Type` do contrato (`video/mp4`, `text/vtt`, `image/jpeg`,
   `application/json`).
2. `passos.json` é JSON no formato do contrato; abas em ordem 1, 2, 3...;
   `inicio_s` que não voltam e que cabem em `duracao_s`. Tetos: números
   finitos, `duracao_s` até 600, até 50 abas, `titulo` até 120 caracteres,
   `texto` até 2000, `pasta` e `id` até 100.
3. `passos.json` é desta funcionalidade (`pasta` e `id` iguais ao `slug` da
   pasta e da funcionalidade).
4. O número de abas do pacote é igual ao da funcionalidade.
5. `video.mp4` é MP4 de verdade (pelos bytes), com vídeo H.264 e áudio AAC.
6. `capa.jpg` é JPEG de verdade.
7. `legenda.vtt` é WebVTT válido em UTF-8, com pelo menos uma fala.

Passou tudo: os arquivos vão para o caminho definitivo, caminhos, duração,
`video_script_hash` (o `script_hash` do `passos.json`) e os `start_s` de cada
aba (os `inicio_s` do `passos.json`, na ordem) são gravados numa transação, e só
então os arquivos do vídeo anterior são apagados. **Título e texto das abas não
mudam** no commit. A publicação também não muda: substituir o vídeo de um
tutorial publicado o mantém publicado, já com o vídeo novo.

Falhou qualquer coisa: os arquivos enviados são apagados, e o vídeo anterior,
as abas e o banco ficam exatamente como estavam. Para tentar de novo, peça
URLs novas. A exceção é um `500` depois da gravação no banco (a conexão caiu
na volta da transação): o servidor relê a funcionalidade e, se ela já aponta
para o vídeo novo, mantém os arquivos novos. Diante de um `500`, recarregue a
funcionalidade (`GET /admin/help/features/:id`) antes de reenviar: o vídeo
novo pode já estar no ar.

Toda recusa fica na auditoria (`commit_recusado` com o `code` e o
`upload_id`).

Resposta `200`: `{ "feature": AdminFeature }`, já com o vídeo novo.

Erros (todos com `details.arquivo` dizendo qual arquivo marcar na tela):

| Status | `code` | `message` (exemplos) | `details` |
|---|---|---|---|
| 400 | `PACOTE_INCOMPLETO` | `Falta o arquivo legenda.vtt no pacote enviado.` | `{ "arquivo": "legenda.vtt" }` |
| 400 | `PACOTE_INVALIDO` | `O arquivo video.mp4 tem 9,1 MB, acima do limite de 8 MB.` | `{ "arquivo": "video.mp4" }` |
| 400 | `PACOTE_INVALIDO` | `O arquivo capa.jpg foi enviado como "text/html", e precisa ser image/jpeg. Envie o pacote de novo pela tela.` (ou `"sem tipo"`) | `{ "arquivo": "capa.jpg" }` |
| 400 | `PACOTE_INVALIDO` | `O arquivo video.mp4 não é um vídeo MP4.` / `O vídeo precisa estar em H.264. Gere o pacote de novo.` / `O áudio do vídeo precisa estar em AAC. Gere o pacote de novo.` | `{ "arquivo": "video.mp4" }` |
| 400 | `PACOTE_INVALIDO` | `O arquivo capa.jpg não é uma imagem JPEG.` | `{ "arquivo": "capa.jpg" }` |
| 400 | `PACOTE_INVALIDO` | `A legenda não é WebVTT: a primeira linha precisa ser WEBVTT.` / `A legenda não tem nenhuma fala.` / `A legenda não está em UTF-8.` | `{ "arquivo": "legenda.vtt" }` |
| 400 | `PACOTE_INVALIDO` | `O arquivo passos.json não é um JSON válido.` / `O passos.json está fora do formato (abas.0.inicio_s): ...` / `A aba 3 começa antes da aba 2.` | `{ "arquivo": "passos.json" }` |
| 400 | `PACOTE_DE_OUTRA_FUNCIONALIDADE` | `Este pacote é da funcionalidade "Histórico e relatório do dia", na pasta Inspetor, e não de "Fazer uma vistoria completa" (Inspetor). Abra "Histórico e relatório do dia" e envie o pacote por lá.` | `{ "arquivo": "passos.json", "pasta": "inspetor", "id": "inspetor-historico", "titulo": "Histórico e relatório do dia", "feature_id": "<uuid>" }` |
| 400 | `PACOTE_DE_OUTRA_FUNCIONALIDADE` | `Este pacote é de "x/y", que não existe na central. A funcionalidade escolhida é "inspetor/inspetor-vistoria-completa".` | `{ "arquivo": "passos.json", "pasta": "x", "id": "y", "titulo": null, "feature_id": null }` |
| 400 | `ABAS_DIFERENTES` | `O pacote tem 7 abas e "Fazer uma vistoria completa" tem 8. O roteiro mudou depois da gravação? Gere o pacote de novo.` | `{ "arquivo": "passos.json", "no_pacote": 7, "na_funcionalidade": 8 }` |
| 400 | `VALIDATION_ERROR` | `Payload inválido` (`upload_id inválido`) | |
| 404 | `NOT_FOUND` | `Funcionalidade não encontrada` | |
| 409 | `CONFLICT` | `Outro envio para esta funcionalidade terminou primeiro. Recarregue a tela e confira.` | |
| 409 | `UPLOAD_JA_CONFIRMADO` | `Este envio já foi confirmado e é o vídeo atual desta funcionalidade. Para trocar o vídeo, peça novas URLs de envio.` | |

Com `PACOTE_DE_OUTRA_FUNCIONALIDADE` e `feature_id` preenchido, a tela pode
oferecer o link para `/desktop/admin/tutoriais/<feature_id>`.

### `POST /admin/help/features/:id/publish` e `/unpublish`

Sem corpo. Publicar **não** exige vídeo: tutorial publicado sem vídeo aparece
para as contas só com os passos em texto. As duas são idempotentes (publicar o
que já está publicado não faz nada e responde `200`). Despublicar esquece as URLs
assinadas guardadas (ver "URLs assinadas"); links já entregues valem até
expirar.

Resposta `200`: `{ "feature": AdminFeature }`.

Erros: `404 NOT_FOUND` `Funcionalidade não encontrada`. (O antigo
`409 SEM_VIDEO` do publish não existe mais.)

### `POST /admin/help/features/publish-batch`

Publica ou despublica vários tutoriais de uma vez. É o que a seleção da árvore
do admin usa; a tela da funcionalidade continua com `publish` e `unpublish`.

Corpo (estrito: campo a mais é `400`):

```json
{ "ids": ["<uuid>", "<uuid>"], "published": false }
```

- `ids`: de 1 a 100 UUIDs de funcionalidade, sem repetição.
- `published`: `true` publica, `false` despublica.

Um UPDATE só no banco. Quem já estava no estado pedido fica como está, sem
erro, e não entra na contagem. Despublicar esquece as URLs assinadas guardadas
dos três arquivos de cada um, como o `unpublish` individual. A auditoria
registra uma linha só, com os `ids`, o valor pedido e quantos mudaram.

Resposta `200`:

```json
{ "updated": 2 }
```

`updated` é quantos mudaram de fato. Depois dela, releia a árvore
(`GET /admin/help/tree`) para as contagens e os selos.

Erros:

- `400 VALIDATION_ERROR`: lista vazia, mais de 100, id que não é UUID, id
  repetido, `published` ausente ou que não é booleano, campo a mais.
- `404 NOT_FOUND` `Algum dos tutoriais escolhidos não existe mais. Recarregue a
  tela e escolha de novo.`, com `details.ids` listando os que não existem.
  Nada é gravado: o lote é tudo ou nada.

---

## O que não está aqui

- Apagar pasta, funcionalidade ou vídeo: não há rota. O roteiro é a fonte do
  que existe; o que sai dele aparece com `in_catalog: false`.
- Mudar `icon`, `target_roles` ou `admin_only` pela tela: vêm do mapa `PASTAS`
  de `tutoriais/scripts/catalogo.mjs` e entram pelo seed.
