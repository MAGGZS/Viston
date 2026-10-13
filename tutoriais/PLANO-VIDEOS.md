# Plano de produção dos vídeos tutoriais

Plano executável para produzir os 28 vídeos da central de ajuda: gravação real da interface com Playwright, narração por IA com ElevenLabs e acabamento de movimento com HyperFrames. Este documento é só planejamento: nada aqui foi gravado, narrado nem renderizado.

Fontes lidas: `tutoriais/roteiros.md`, `tutoriais/catalogo.json`, `tutoriais/scripts/catalogo.mjs`, `tutoriais/API.md`, `tutoriais/exemplo/`, `prompts/prompt-2-gravacao-videos-viston.md`, `prompts/roteiros-tutoriais-viston.md`, os SKILL.md e as references de `hyperframes`, `general-video`, `hyperframes-core`, `hyperframes-keyframes`, `hyperframes-animation`, `hyperframes-creative`, `media-use`, `embedded-captions`, `remotion-best-practices` e `remotion-captions`, e o código do frontend (rótulos, rotas, tema, cores).

---

## 0. Decisões principais, em uma tela

| Assunto | Decisão |
|---|---|
| Forma do vídeo | Começa direto na Aba 1, na tela do app, com a voz. Sem vinheta, logo, abertura ou encerramento. Único adorno de abertura de passo: um chip discreto com o número e o título da aba. |
| Quem grava | Playwright, um teste por funcionalidade, lendo as abas do `catalogo.json`. O Playwright **não desenha** anel nem ponto de toque: ele só grava a tela e anota onde e quando cada ação aconteceu (`bruto/marcas.json`). |
| Quem anima | HyperFrames: zoom suave na área da ação, anel dourado `#F5C518`, ponto de toque, chip da aba e transição curta entre abas. Nada de legenda no vídeo. Tudo em uma composição gerada a partir de um modelo único, com os dados de cada vídeo. |
| Remotion | **Não entra na esteira.** Não agrega nada que o HyperFrames já não faça aqui (ver seção 2.3). Fica registrado como alternativa, sem uso. |
| Narração | ElevenLabs, uma voz para todos, pt-BR. Na esteira, API direta com `ELEVENLABS_API_KEY` e cache por hash. O MCP conectado (`creative_generate_speech`) serve para ouvir e escolher a voz e também pode gerar a narração; a esteira só precisa do áudio e da duração dele. |
| Sincronia | Narração primeiro, gravação depois: cada aba da gravação dura no mínimo o áudio dela mais uma folga. `inicio_s` sai das marcas da gravação, já corrigidas pelo deslocamento medido. |
| Legenda | Só o `legenda.vtt` do pacote, por frase (linhas de até 42 caracteres, no máximo 2 linhas por bloco), no tempo de cada aba, gerado do texto da narração e da duração do áudio de cada aba. Quem mostra é o player da ajuda, que já liga a `<track>` por padrão. Nada queimado no vídeo (D1, resolvida). |
| Armazenamento | `tutoriais/videos/<NN-pasta>/<id>/` no lugar de `tutoriais/saida/`. Pacote final na raiz da pasta; `bruto/`, `audio/` e `composicao/` dentro dela. Mídia pesada fora do git. |
| Vídeo feito à mão | Solta um `.mp4` em `bruto/`; a esteira pula a gravação e faz narração, movimento e pacote. |
| Pilotos | `primeiros-passos-entrar-codigo` (celular) e `gestor-equipe` (computador). |

---

## 1. O vídeo que sai da esteira

### 1.1 Estrutura de cada vídeo

- Quadro 0 já é a tela do app, na primeira ação da Aba 1, com a voz começando em até 0,4 s.
- Cada aba é um trecho contínuo da gravação. Ao entrar numa aba nova:
  1. o chip da aba entra (0,25 s), canto superior esquerdo, e sai depois de 2,5 s;
  2. a câmera faz uma transição curta (0,35 s a 0,5 s) do enquadramento anterior para o novo;
  3. a voz da aba começa;
  4. perto do momento da ação, a câmera aproxima da área (punch-in suave), o anel dourado contorna o elemento e o ponto de toque aparece no instante do toque;
  5. depois da ação, a câmera volta ao quadro inteiro para a pessoa ver o resultado.
- Último quadro: a tela final da última aba, parada por 0,6 s. Sem cartão de encerramento.

### 1.2 Identidade visual dos overlays

Tirada de `frontend/app/globals.css` e `frontend/app/layout.js`:

| Token | Valor | Uso no overlay |
|---|---|---|
| `--color-accent` | `#F5C518` | anel, ponto de toque, número do chip |
| `--color-accent-soft` | `rgba(245, 197, 24, 0.13)` | brilho externo do anel |
| `--color-page` | `#0B0B0B` | fundo das pílulas (com 80% de opacidade) |
| `--color-ink` | `rgba(255, 255, 255, 0.96)` | texto do chip |
| `--radius-control` | `16px` | raio das pílulas |
| Fonte | Poppins 500/600 (`frontend/app/fonts/poppins-latin-*.woff2`) | chip |

As fontes entram na composição por `@font-face` apontando para cópias locais dos `.woff2` (o lint do HyperFrames recusa `font-family` sem `@font-face`, regra `font_family_without_font_face`).

Elementos:

- **Anel dourado**: retângulo arredondado de 3 px em `#F5C518`, 6 px maior que o alvo de cada lado, com o raio do próprio alvo; entra com escala de 1,15 para 1,0 em 0,3 s (`power3.out`), pulsa uma vez e some 0,4 s depois da ação.
- **Ponto de toque** (celular): círculo de 28 px em `#F5C518` com 35% de opacidade e uma onda que expande até 64 px e some em 0,45 s, centrado no ponto exato do toque.
- **Cursor** (computador): mesma onda do toque, sem seta. A seta animada seria uma invenção sobre o que o Playwright fez; a onda marca o clique sem fingir movimento de mouse. Ver decisão pendente D7.
- **Chip da aba**: pílula `#0B0B0B` a 80%, texto Poppins 600 14 px (celular) ou 16 px (computador): "2 · Escolher os andares", número em dourado.
- **Legenda**: não é overlay. O vídeo sai sem legenda; o texto vem do `legenda.vtt`, exibido pelo player (seção 7).

### 1.3 Tamanhos de saída

| Dispositivo | Viewport gravado | Gravação | Saída | Motivo |
|---|---|---|---|---|
| Celular | 390 x 844, `isMobile`, `hasTouch`, `deviceScaleFactor: 2` | 780 x 1688 | 780 x 1688, 30 fps | O contrato pede largura nativa; gravar em 2x dá folga para o punch-in sem borrar. |
| Computador | 1440 x 900 | 1440 x 900 | 1280 x 800, 30 fps | 1280 x 800 é a classe 720p do C4 na proporção 16:10 do viewport. O player da ajuda não fixa proporção (`.ajuda-palco` em `globals.css`), então não precisa forçar 16:9. |

Orçamento de 8 MB: o vídeo mais longo estimado é o `inspetor-vistoria-completa`, por volta de 75 s. 8 MB em 75 s dá cerca de 0,85 Mbit/s no total; com AAC a 96 kbit/s sobra uns 0,75 Mbit/s para o vídeo, folgado para tela de app (fundo liso, pouco movimento).

---

## 2. Arquitetura da esteira

### 2.1 Etapas

| # | Etapa | Ferramenta | Entra | Sai |
|---|---|---|---|---|
| E0 | Conferência do roteiro | `catalogo.mjs --check` + checagem de rótulos (`tutoriais:verificar`) | `roteiros.md` | catálogo em dia; lista de roteiros quebrados |
| E1 | Dados de demonstração | `backend/prisma/seed-demo.ts` (a criar) + função `restaurar(id)` | elenco do roteiro | banco de demonstração no estado que a funcionalidade precisa |
| E2 | Narração | `tutoriais/esteira/narrar.mjs` (ElevenLabs, API direta) | abas do catálogo | `audio/aba-NN.mp3` + `audio/narracao.json` |
| E3 | Gravação | Playwright (`tutoriais/playwright.config.mjs`, um teste por `id`) | catálogo + durações da E2 | `bruto/gravacao.webm` + `bruto/marcas.json` |
| E3b | Vídeo feito à mão (alternativa à E3) | o usuário | `.mp4` em `bruto/` | `bruto/marcas.json` preenchido à mão a partir de um modelo |
| E4 | Composição | `tutoriais/esteira/compor.mjs` gera o projeto HyperFrames a partir de `tutoriais/esteira/modelo/` | `marcas.json`, áudios | `composicao/index.html` + `composicao/dados.json` + mídia ligada |
| E5 | Render | `npx hyperframes check` e `npx hyperframes render` | `composicao/` | `composicao/render.mp4` |
| E6 | Empacotamento | ffmpeg + `empacotar.mjs` | render, `narracao.json`, catálogo | `video.mp4`, `legenda.vtt`, `capa.jpg`, `passos.json` na raiz da pasta |
| E7 | Validação | `validar.mjs` (as mesmas regras do commit em `API.md`) | pacote | aprovado ou erro com o motivo; linha no `tutoriais/videos/RESUMO.md` |

Fluxo por funcionalidade: `E1 restaurar -> E2 narrar -> E3 gravar -> E4 compor -> E5 render -> E6 empacotar -> E7 validar`. Com um vídeo feito à mão: `E2 -> E3b -> E4 -> E5 -> E6 -> E7`.

### 2.2 Por que a narração vem antes da gravação

O helper `aba()` do C3 precisa saber quanto a voz da aba dura para segurar a tela o tempo certo. Gerar o áudio primeiro (e de graça a partir da segunda vez, pelo cache) faz a gravação já sair no ritmo da voz, sem esticar nem cortar vídeo depois. É também o que deixa `inicio_s` exato: ele é medido na gravação, não estimado.

### 2.3 HyperFrames ou Remotion, ponto a ponto

| Ponto | Escolha | Por quê |
|---|---|---|
| Footage da gravação como clip | HyperFrames | `<video class="clip" muted data-start data-duration data-media-start>` (`hyperframes-core/references/variables-and-media.md`). Pular espera de rede é um corte seco com dois clipes do mesmo arquivo e `data-media-start` diferente (receita "Hard cut" de `creator-editing-recipes.md`). |
| Zoom e punch-in | HyperFrames | Receita "Zoom / punch" e "Pan / Ken Burns": anima `scale` e `xPercent`/`yPercent` num wrapper interno, nunca no clip temporizado. Uma "escada de poses" por aba (`hyperframes-keyframes`), timeline única pausada e seek-safe. |
| Anel, toque, chip | HyperFrames | DOM e GSAP comuns, em coordenadas pré-calculadas. Mudar o estilo do anel depois não exige regravar nada, porque o anel não está queimado na gravação. |
| Áudio por faixa | HyperFrames | Um `<audio id="voz-NN">` por aba, com `data-start` = `inicio_s` + atraso da voz. Todo `<audio>` precisa de `id`, senão o render sai mudo (`media_missing_id`). |
| Render em lote | HyperFrames | `npx hyperframes render --batch linhas.json --output "{saida}"` (`hyperframes-cli/references/compare-and-batch.md`). Cada vídeo também sai com um render simples na própria pasta. |
| Revisão visual | HyperFrames | `npx hyperframes preview` abre o Studio: dá para arrastar um zoom ou corrigir um tempo de aba sem regravar. |
| Legenda VTT (`legenda.vtt`) | Script Node | Gerada do texto e do `inicio_s` de cada aba; é texto, não precisa de framework. |
| Remotion | Não usado | Remotion traria React, um segundo renderizador e uma licença comercial (empresa com mais de 3 pessoas paga licença) para fazer o mesmo que o HyperFrames já faz. Se um dia o HyperFrames falhar no Windows, a mesma composição dá para portar; hoje não há motivo. |
| `embedded-captions` | Não usado | É para vídeo de pessoa falando (recorta o sujeito e põe legenda atrás dele). Gravação de tela não tem sujeito, e o vídeo sai sem legenda queimada. |

### 2.4 Quem faz o quê

| Papel | Responsabilidade |
|---|---|
| Esteira (scripts em `tutoriais/esteira/`) | E1 a E7, idempotente, uma funcionalidade por vez. |
| Playwright | Navegar, agir, esperar a interface assentar, anotar marcas e alvos. |
| ElevenLabs | Voz. |
| HyperFrames | Movimento, mixagem e encode do render. Sem legenda. |
| ffmpeg (já instalado: `C:\Users\magdi\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe`, versão 9.0.2) | Medir duração, detectar o quadro de sincronia, ajustar compressão ao teto de 8 MB, tirar a capa. |
| Proprietário | Escolher a voz, decidir as pendências da seção 15, revisar os dois pilotos, enviar os pacotes pela tela de Tutoriais. |

---

## 3. Tempo e sincronia

### 3.1 O helper `aba()`

```js
// tutoriais/esteira/aba.mjs (esboço)
export async function aba(page, ctx, { ordem, titulo, narracao }, acao) {
  const voz = ctx.narracao[ordem];               // vem da E2: { arquivo, duracao_s }
  const inicio = ctx.relogio();                  // segundos desde o início do vídeo
  ctx.marcas.abas.push({ ordem, titulo, inicio_bruto_s: inicio, voz_atraso_s: ATRASO_VOZ });

  await page.waitForTimeout(ATRASO_ACAO * 1000); // a voz apresenta antes da mão agir
  await acao(async function alvo(locator, tipo = 'toque') {
    const caixa = await locator.boundingBox();   // coordenadas no viewport
    ctx.marcas.alvos.push({ aba: ordem, t_bruto_s: ctx.relogio(), tipo, caixa });
  });
  await assentar(page);                          // networkidle + animações CSS concluídas

  const fim_minimo = inicio + ATRASO_VOZ + voz.duracao_s + FOLGA_FIM;
  const falta = fim_minimo - ctx.relogio();
  if (falta > 0) await page.waitForTimeout(falta * 1000);
}
```

Constantes iniciais (ajustar no piloto): `ATRASO_VOZ = 0,35 s`, `ATRASO_ACAO = 0,8 s` (sem tempos por palavra, o atraso é fixo; o piloto diz se alguma aba precisa de outro valor), `FOLGA_FIM = 0,7 s`.

`assentar(page)` espera `networkidle`, depois `document.getAnimations().every(a => a.playState !== 'running')`, com teto de 3 s.

Cada ação chama `alvo(locator)` antes de clicar ou tocar, para o anel e o ponto saberem onde ir. Para ações com vários alvos na mesma aba (ex.: 3.1 Aba 4 preenche quatro campos), cada um vira um alvo, e a câmera segue numa escada de poses.

### 3.2 Relógio e deslocamento

O vídeo do Playwright começa quando a página é criada, mas o primeiro quadro tem um atraso de alguns décimos. Para não depender disso:

1. Logo depois do login (que fica fora do vídeo final), o teste injeta por 200 ms um quadrado `#F5C518` de 40 x 40 px num canto e grava `t_sincronia` no relógio.
2. Na E4, `ffmpeg -vf "crop=40:40:0:0,signalstats"` acha o primeiro quadro em que o canto fica dourado.
3. `deslocamento = quadro_detectado_s - t_sincronia`. Todas as marcas são somadas a esse deslocamento.

### 3.3 De onde sai `inicio_s`

- O vídeo final começa no `inicio_bruto_s` da Aba 1 (o login e o quadrado de sincronia ficam antes e são cortados por `data-media-start`).
- `inicio_s(aba k) = inicio_bruto_s(k) + deslocamento - inicio_bruto_s(1) - cortes_anteriores(k)`, onde `cortes_anteriores` soma os trechos de espera removidos antes da aba k (ver 3.4).
- Logo `inicio_s(1) = 0`, sempre crescente, e `duracao_s` é o fim da última aba mais 0,6 s de quadro parado. O validador confere as regras do commit: abas em ordem, `inicio_s` que não volta, tudo dentro de `duracao_s`, `duracao_s` até 600.

### 3.4 Esperas longas

Se uma ação demora mais que a voz (gerar planilha, enviar vistoria, gerar `.docx`), o helper marca um trecho de espera (`{ de_s, ate_s }`) quando ele passa de 1,2 s com a voz já terminada. A composição remove o trecho com corte seco (dois clipes do mesmo arquivo) e cobre o corte com 0,25 s de dissolução. Nada de acelerar a gravação: a receita de velocidade existe (`data-playback-rate`), mas acelerar tela de app parece defeito.

### 3.5 Legenda no tempo do vídeo

A legenda existe só no `legenda.vtt`. Cada aba ocupa a janela de `inicio_s(aba) + ATRASO_VOZ` até esse ponto mais a duração do áudio da aba (medida com ffprobe). O texto da narração é quebrado por frase, em linhas de até 42 caracteres e no máximo duas linhas por bloco, como pede o C4; quando uma aba tem mais de um bloco, a janela da aba é repartida entre eles na proporção dos caracteres de cada um.

---

## 4. Narração

### 4.1 MCP ou API direta

| Caminho | Uso no plano |
|---|---|
| MCP ElevenLabs conectado (`creative_list_voices`, `creative_generate_speech`) | **Escolha de voz, testes de ouvido e, se for mais prático, a própria narração.** Ele gera em "flows" no canvas da ElevenLabs, com 4 variações por padrão, e devolve uma URL; basta baixar o áudio escolhido para o cache e medir a duração com ffprobe, já que a legenda não precisa de tempos por palavra. Nesta tarefa ele foi usado apenas para listar vozes e estimar custo com `estimate_only` (sem gerar nem cobrar; a estimativa criou um flow vazio na conta, que pode ser apagado). |
| API direta com `ELEVENLABS_API_KEY` | **Caminho padrão da esteira automática.** O endpoint comum `POST /v1/text-to-speech/{voice_id}` basta: devolve o áudio, e a esteira só precisa da duração dele (ffprobe) para segurar a tela e montar o VTT. Sem legenda palavra a palavra, o endpoint com alinhamento por caractere e qualquer passo de reconhecimento de fala deixam de ser necessários. |

A chave fica só em variável de ambiente da máquina que roda a esteira (hoje **não está definida**: `ELEVENLABS_API_KEY ausente`). Nunca no repositório, no frontend ou em log.

### 4.2 Voz

Uma voz para os 28 vídeos, em `ELEVENLABS_VOICE_ID`. Candidatas pt-BR da biblioteca, filtradas por uso educativo (ouvir as amostras antes de decidir, ver D3):

| Voz | `voice_id` | Perfil |
|---|---|---|
| Henrique, Clear and Knowledgeable | `3ULAAai0IVN00DTWA6vF` | masculina, meia-idade, pausada, feita para tutorial. **Sugestão principal.** |
| Juliana, Bright and Encouraging | `nczLZ6GvJGozyc3FlLte` | feminina, jovem, clara e acolhedora. **Sugestão feminina.** |
| Rodrigo Souzax, Educational Friendly | `Vm1VBAu4pGGsuP0SSKrz` | masculina, calma, para tutoriais |
| Luciana Cadar | `fUAUU80st9SqdYx319Zk` | feminina, tom de professora, entonação moderada |
| Cristian, Warm and Friendly | `abaIlsBKdPrtlWNar7Ea` | masculina, conversa, cita tutoriais de tecnologia |

**Escolhida pelo proprietário (D3, 2026-10-13): Juliana** (`nczLZ6GvJGozyc3FlLte`).

Observação de elenco: a moderadora do prédio de demonstração se chama Juliana Alves. Se a voz escolhida for a "Juliana", não há conflito (o nome da voz não aparece no vídeo), mas vale saber.

Modelo: `eleven_multilingual_v2` (melhor prosódia em português). Alternativa mais barata e rápida: `eleven_flash_v2_5` (metade dos créditos). Configuração de voz fixa e versionada em `tutoriais/esteira/voz.json` (`stability`, `similarity_boost`, `style`, `speed`), porque ela entra no hash do cache.

Ritmo: o roteiro foi estimado a 2,6 palavras por segundo (156 por minuto). Se a voz escolhida for mais lenta, os vídeos crescem na mesma proporção; o piloto mede isso.

### 4.3 Pronúncia

- "Viston" não tem acento e não tem alias: a voz lê "Viston" exatamente como está escrito, igual à legenda e ao `passos.json` (decisão do proprietário, 2026-10-13).
- "QR Code": como se fala é decisão do proprietário (D4). O padrão do mercado no Brasil é "quiú-ar code".
- "Excel" e "Word" saem bem sem ajuste. Não há outras siglas nas narrações atuais.
- Se um dia entrar um dicionário ou uma tabela de trocas (por exemplo para "QR Code"), ele entra no hash do cache: mudar a pronúncia regera só o que usa a palavra.

### 4.4 Cache

- Pasta: `tutoriais/.cache-voz/` (fora do git), como pede o C2.
- Chave: `sha256(texto_enviado + voice_id + model_id + voz.json + versao_do_dicionario)`.
- Arquivos: `<chave>.mp3` e `<chave>.json` (`duracao_s` medida com ffprobe).
- `narrar()` copia do cache para `videos/.../audio/aba-NN.mp3` (a composição do HyperFrames precisa da mídia dentro do projeto).
- Mudar uma narração no roteiro muda o `script_hash` da funcionalidade e a chave só daquela aba: as outras abas não pagam de novo.

### 4.5 Termos de uso

A ElevenLabs só concede uso comercial nos planos pagos (do Starter para cima); no plano gratuito exige atribuição e não permite uso comercial. Vozes da biblioteca têm, além disso, as condições do autor da voz (algumas pedem aviso ou limitam uso). Antes de gerar o lote: confirmar o plano da conta e ler a ficha da voz escolhida, e registrar a confirmação no `RESUMO.md` (o C2 exige esse registro).

---

## 5. Gravação

### 5.1 Configuração

`tutoriais/playwright.config.mjs`:

- projeto `celular`: `viewport 390x844`, `isMobile: true`, `hasTouch: true`, `deviceScaleFactor: 2`, `recordVideo: { size: { width: 780, height: 1688 } }`;
- projeto `computador`: `viewport 1440x900`, `recordVideo: { size: { width: 1440, height: 900 } }`;
- `workers: 1` (as gravações disputam o mesmo banco de demonstração);
- `colorScheme: 'dark'` **e** `localStorage['viston:tema'] = 'dark'` via `addInitScript`. O tema é forçável: `frontend/app/lib/theme.js` lê `viston:tema` antes da primeira pintura (`THEME_SCRIPT`), com `system` como padrão; gravar `dark` ali tira a dependência do sistema. A única exceção é a 1.4 Aba 4, que troca o tema pela própria tela.
- `baseURL` do frontend de demonstração; `locale: 'pt-BR'`, `timezoneId: 'America/Sao_Paulo'` (datas e "dias úteis" saem iguais em todo render).

### 5.2 Seletores

Por papel e rótulo (`getByRole`, `getByLabel`, `getByText`), lidos da tabela da seção 11. Onde não houver nome acessível (ex.: o "X" das etiquetas de andar em `BuildingFormModals.js:28`, o botão "+" ao lado do campo de andar), adicionar `data-testid` em commit separado, como pede o prompt 2.

### 5.3 Qualidade do vídeo do Playwright

O gravador nativo do Playwright usa VP8 com taxa baixa, e o punch-in amplia o borrão. Plano em dois níveis:

1. gravar em 2x (já previsto no celular) e limitar o zoom a 1,6x no celular e 1,8x no computador;
2. se o piloto mostrar texto borrado no zoom, trocar o gravador por captura via CDP (`Page.startScreencast` em JPEG qualidade 90, quadros com timestamp) e montar o `bruto/gravacao.mp4` com ffmpeg a 30 fps. Mesmo `marcas.json`, mesmo resto da esteira.

### 5.4 O que fica fora do vídeo

Login, restauração de estado e o quadrado de sincronia acontecem antes da Aba 1 e são cortados. Cenas fora do app (abrir o e-mail, escanear o QR Code) navegam direto para a URL equivalente, com a voz explicando o gesto, como manda o C3.

---

## 6. Composição HyperFrames

### 6.1 Modelo único, dados por vídeo

`tutoriais/esteira/modelo/` contém um projeto HyperFrames de referência (`hyperframes.json`, `index.html`, `estilos.css`, fontes Poppins). `compor.mjs` copia o modelo para `videos/.../composicao/`, liga `bruto/` e `audio/` como mídia e escreve `dados.json` (dispositivo, tamanho, abas, alvos, cortes). O `index.html` lê `dados.json` no carregamento e monta a timeline (permitido: a timeline é registrada só depois de montada; leitura de arquivo local na carga não é rede em tempo de render). Se o lint reclamar da leitura, `compor.mjs` embute os dados num `<script>` do próprio `index.html`.

Antes de escrever o modelo: `npx hyperframes skills update general-video`, `npx hyperframes usage --json` e uma busca no catálogo de blocos (`npx hyperframes catalog --query "click ripple"`, `"blur dissolve"`) para reaproveitar o que já existir em vez de desenhar à mão, como manda o `general-video`.

### 6.2 Camadas (tracks)

| Track | Conteúdo |
|---|---|
| 0 | `<video class="clip" muted>` do bruto, um clipe por trecho (corte seco onde há espera removida), dentro de `.camera` (wrapper sem `data-start`, que é o que recebe o zoom). |
| 1 | Anéis e pontos de toque, dentro de `.camera` para acompanhar o zoom. |
| 2 | Chip da aba (fora da câmera: não aumenta com o zoom). |
| 3 | `<audio id="voz-01">`... um por aba. Sem trilha musical (ver D6). |

Regras do `hyperframes-core` que pesam aqui: não pôr `data-start` no wrapper e no `<video>` ao mesmo tempo (`video_nested_in_timed_element`); não animar o `.clip` com `autoAlpha` ou `visibility`; nada de `crossorigin` em `<video>`/`<audio>`; uma timeline GSAP pausada em `window.__timelines[<id>]`.

### 6.3 Zoom seek-safe

Para cada alvo, `compor.mjs` calcula uma pose a partir da caixa do alvo:

- escala `s = min(ZOOM_MAX, 0,55 * largura_do_quadro / largura_da_caixa_com_margem)`, nunca abaixo de 1,25 (zoom de 1,1 parece tremido, não intencional);
- translação que centraliza a caixa, limitada para nunca mostrar fora da tela (`x` entre `(1 - s) * W` e 0);
- entrada 0,6 s antes da ação (`power2.inOut`, 0,55 s), segura até 0,5 s depois, volta a 1,0 em 0,6 s. Alvos seguidos na mesma aba (formulário) viram uma escada de poses sem voltar a 1,0 entre eles.

Tudo com `tl.to(".camera", {...}, tempo_absoluto)`, nada de `getBoundingClientRect()` em tempo de animação.

### 6.4 Transição entre abas

A gravação é contínua, então a troca de aba é de câmera, não de cena: a câmera sai da pose da aba anterior para 1,0 (ou direto para a primeira pose da aba nova, se ela começar em até 1 s) em 0,4 s, e o chip troca. Onde houver corte de espera, dissolução de 0,25 s (bloco do catálogo se houver; senão opacidade entre os dois clipes, receita "Crossfade").

### 6.5 Render

- Iteração: `npx hyperframes render --quality draft`.
- Final: `npx hyperframes render --quality looks --fps 30 --output composicao/render.mp4`.
- Lote: `npx hyperframes render --batch tutoriais/videos/lote.json --output "{saida}" --batch-concurrency 1`.
- Depois do render, ler a segunda linha do resumo (caminho de captura e GPU), como pede o `hyperframes-core`.
- Antes de cada render: `npx hyperframes check` com zero achados.

---

## 7. Empacotamento e validação

`empacotar.mjs`, por funcionalidade:

1. **`video.mp4`**: re-encode do render com `ffmpeg -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart`. Se passar de 8 MB, sobe o CRF de 2 em 2 até 32; se ainda passar, faz dois passes com taxa alvo calculada pela duração. Só desiste depois disso, como manda o C4.
2. **`legenda.vtt`**: WebVTT UTF-8, por frase, de `inicio_s` de cada aba mais o atraso da voz até o fim do áudio da aba (seção 3.5); linhas de até 42 caracteres, até duas por bloco. É a única legenda: o player a liga por padrão.
3. **`capa.jpg`**: quadro do meio da primeira aba, sem chip (render de um quadro só da composição com essa camada oculta, ou um quadro do bruto), `-q:v 4`; se passar de 300 KB, reduz qualidade.
4. **`passos.json`**: `pasta` = slug do catálogo, `id`, `script_hash` importado de `catalogo.mjs` (`scriptHash`), `duracao_s`, `abas[{ordem, titulo, texto, inicio_s}]` com `texto` = narração.

`validar.mjs` repete as regras do commit (`API.md`, `POST /admin/help/features/:id/video/commit`): limites de 8 MB, 300 KB, 512 KB e 64 KB; MP4 com H.264 e AAC pelos bytes (ffprobe); JPEG de verdade; VTT começando por `WEBVTT` com ao menos uma fala; número de abas igual ao do catálogo; `script_hash` igual ao atual. Assim a recusa aparece aqui, antes de subir 8 MB.

---

## 8. Armazenamento

### 8.1 Árvore

```
tutoriais/
  videos/
    RESUMO.md                         gerado: duração, tamanho e hash de cada pacote
    lote.json                         gerado: linhas do render em lote
    03-inspetor/
      inspetor-vistoria-completa/
        video.mp4                     pacote final (o que o admin envia)
        legenda.vtt
        capa.jpg
        passos.json
        estado.json                   gerado: etapas concluídas, hashes usados, origem (playwright|manual)
        bruto/
          gravacao.webm               Playwright (ou qualquer .mp4/.mov/.webm solto à mão)
          marcas.json                 abas, alvos, cortes, deslocamento, viewport
          marcas.modelo.json          só quando o bruto é manual: modelo para preencher
        audio/
          aba-01.mp3 ... aba-08.mp3
          narracao.json               duração e chave de cache de cada aba
        composicao/
          hyperframes.json, index.html, dados.json, estilos.css, fontes/
          render.mp4                  saída do HyperFrames antes do re-encode
  .cache-voz/                         cache global da narração
  esteira/                            scripts e modelo da composição (versionado)
  playwright.config.mjs
  testes/<id>.spec.mjs                um teste por funcionalidade
```

### 8.2 `.gitignore`

Acrescentar na raiz:

```
# Esteira de vídeos: mídia pesada e gerados
tutoriais/.cache-voz/
tutoriais/videos/**/bruto/
tutoriais/videos/**/audio/
tutoriais/videos/**/composicao/
tutoriais/videos/**/video.mp4
tutoriais/videos/**/capa.jpg
tutoriais/videos/**/estado.json
tutoriais/videos/lote.json
test-results/
playwright-report/
```

Versionados: os `.gitkeep`, `passos.json` e `legenda.vtt` (texto pequeno; o diff mostra quando um tempo mudou) e o `RESUMO.md`. `tutoriais/exemplo/` continua versionado como está (116 KB). Os 28 pacotes somariam até 224 MB e não devem ir para o git.

### 8.3 Vídeo adicionado à mão

1. O usuário solta o arquivo em `tutoriais/videos/<NN-pasta>/<id>/bruto/` (qualquer nome terminado em `.mp4`, `.mov` ou `.webm`).
2. `npm run tutoriais -- --so <id>` percebe que `bruto/` tem vídeo e não tem `marcas.json`. Ela narra (E2) e escreve `bruto/marcas.modelo.json`, com `inicio_bruto_s` de cada aba sugerido pela soma das durações da voz e a lista de alvos vazia, e para com a instrução de preencher.
3. O usuário ajusta os segundos de início de cada aba (e, se quiser zoom, um alvo por aba com `t_bruto_s` e a caixa em pixels do vídeo) e renomeia para `marcas.json`. Atalho: abrir `npx hyperframes preview` na `composicao/` com zoom desligado e arrastar os limites no Studio.
4. A esteira roda E4 a E7. Sem alvos, a aba sai sem zoom e sem anel, só com chip e voz (a legenda segue no `legenda.vtt`). O som do vídeo manual entra mudo, a não ser que `marcas.json` diga `"manter_som": true`.
5. Se um trecho manual for mais curto que a voz da aba, a composição segura o último quadro (receita "Freeze / hold": ffmpeg extrai o quadro e ele vira um clipe de imagem).
6. `estado.json` registra `origem: "manual"`, e `tutoriais:desatualizados` nunca regrava por cima de um bruto manual: só renarra e remonta.

### 8.4 O que muda trocando `tutoriais/saida/` por `tutoriais/videos/`

- O pacote fica na raiz da pasta da funcionalidade, não numa árvore paralela; os intermediários ficam ao lado dele.
- O nome da pasta do cargo ganha o número (`03-inspetor`), mas o `pasta` do `passos.json` continua sendo o slug do catálogo (`inspetor`), que é o que o commit confere. O número vem da `ordem` da pasta no catálogo.
- `RESUMO.md` passa para `tutoriais/videos/RESUMO.md`.
- O `.gitignore` precisa ser por padrão de arquivo (seção 8.2), não por diretório inteiro, porque `passos.json` e `legenda.vtt` ficam junto da mídia.
- A tela do admin envia a pasta da funcionalidade inteira; ela já procura os quatro arquivos pelo nome, então as subpastas não atrapalham. Confirmar no `EnvioDoPacote` que ele ignora subpastas (D9).

---

## 9. Comandos

Um `package.json` em `tutoriais/` (hoje não há `package.json` na raiz do repositório) com:

| Comando | Faz |
|---|---|
| `npm run tutoriais` | Restaura o banco, narra, grava, compõe, renderiza, empacota e valida as 28. |
| `npm run tutoriais -- --so <id>` | Uma funcionalidade. |
| `npm run tutoriais -- --pasta <slug>` | Uma pasta. |
| `npm run tutoriais -- --so <id> --desde compor` | Pula narração e gravação (reaproveita o que existe). Útil para mexer só no movimento. |
| `npm run tutoriais:desatualizados` | Só as funcionalidades cujo `script_hash` atual difere do `passos.json` gerado. |
| `npm run tutoriais:verificar` | Roda todos os testes Playwright sem gravar nem narrar (`aba()` não espera a voz), para achar roteiro quebrado por mudança de interface. |
| `npm run tutoriais:vozes` | Gera só a narração de todas as abas, para ouvir antes de gravar. |

Dependências: `@playwright/test` (com `npx playwright install chromium`) e a CLI do HyperFrames por `npx hyperframes` (baixada na primeira execução; conferir com `npx hyperframes doctor`).

---

## 10. Fichas por funcionalidade

Duração estimada = soma das narrações a 2,6 palavras por segundo, mais 1,2 s de folga por aba (atraso da voz e fim). As abas com digitação ou espera podem passar disso.

Legenda das colunas: **Narr.** é a estimativa da voz da aba; **Zoom / destaque** é o alvo da câmera e do anel.

### Pasta 1: Primeiros passos (celular)

#### 1.1 `primeiros-passos-criar-conta` · celular · conta: nenhuma, depois uma do seed · cerca de 56 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Abrir o cadastro | 6,5 s | "Criar conta" no rodapé de `/login` |
| 2. Escolher o cadastro certo | 12,7 s | aviso cruzado do topo de `/register` ("Vai cadastrar e administrar prédios?") |
| 3. Preencher os dados | 10,0 s | escada: "Nome", "E-mail", "Senha", "Confirmar senha", botão de criar |
| 4. Confirmar o e-mail | 9,6 s | campo do código e "Confirmar" da tela "Confirme seu e-mail" (só mostrar) |
| 5. Primeiro acesso | 10,8 s | cartão "Nenhum prédio ainda" de `/home` |

Seed: conta comum confirmada e sem vínculo (para a Aba 5). Riscos: o cadastro da Aba 3 manda e-mail de verdade pelo Brevo (`BREVO_API_KEY` é obrigatória em `backend/src/config.ts:73`) para um endereço `@viston.demo` inexistente, o que gera devolução e queima reputação do remetente: precisa de modo de e-mail desligado no ambiente de demonstração (D2). A Aba 3 tem campo "Confirmar senha", que a narração não cita (aceitável). O e-mail de cadastro precisa ser único a cada gravação (sufixo com data) ou removido na restauração.

#### 1.2 `primeiros-passos-entrar-qr-link` · celular · conta: Lucas, sem pedido pendente · cerca de 51 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. O que é o QR Code e o link | 10,4 s | cartão "Nenhum prédio ainda" |
| 2. Abrir o link | 9,2 s | nome do prédio em `/conectar?token=...` |
| 3. Pedir acesso | 5,0 s | "Solicitar Acesso ao Prédio", depois "Solicitação Enviada!" |
| 4. Esperar a aprovação | 11,2 s | texto de "Solicitação Enviada!" e "Acessar Início" no `/conectar` |
| 5. Se o link expirou | 8,8 s | "Convite expirado" em `/conectar?expirado=true` ou token vencido |

Seed: Lucas sem pedido; convite válido (token gerado pela API do gestor na restauração) e um vencido. Risco: **a tela inicial não mostra pedido pendente** (`home/page.js:143-152` só mostra "Nenhum prédio ainda" e o formulário). Resolvido em D10: a Aba 4 fica na confirmação do `/conectar`, com a narração ajustada.

#### 1.3 `primeiros-passos-entrar-codigo` · celular · conta: Lucas, sem pedido · cerca de 32 s · **piloto**

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Onde digitar o código | 9,6 s | campo do código no cartão "Nenhum prédio ainda" (placeholder "ABCD-EFGH-JKMN") |
| 2. Digitar e enviar | 13,1 s | escada: campo, "Buscar", nome do prédio, "Conectar-se" |
| 3. Acompanhar o pedido | 6,2 s | "Solicitação enviada!" do `JoinBuildingForm` |

Seed: Lucas sem pedido; código do Edifício Demonstração conhecido. Risco baixo; a Aba 3 só funciona na mesma sessão (o aviso é estado local do formulário), o que a gravação contínua garante.

#### 1.4 `primeiros-passos-perfil` · celular · conta: Carlos · cerca de 36 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Abrir o perfil | 3,5 s | "Perfil" na barra inferior |
| 2. Nome e e-mail | 5,8 s | linha "Identificação", campos "Nome" e "E-mail" |
| 3. Trocar a senha | 3,8 s | "Alterar senha", campos "Senha atual" e "Nova senha" |
| 4. Tema claro ou escuro | 9,2 s | linha "Tema", opções "Automático", "Escuro" e "Claro" |
| 5. Excluir a conta | 7,3 s | "Excluir conta" em "Zona de risco", confirmação, cancelar |

Seed: Carlos. Riscos: **o e-mail é só leitura** (`perfil/page.js:567-576`), e a narração já diz isso (D11, resolvida). A Aba 1 tem só 3,5 s de voz: o helper segura a tela até a ação terminar. A Aba 4 troca o tema de verdade; restaurar `viston:tema` no fim. A narração agora cita a opção "Automático".

#### 1.5 `primeiros-passos-usar-ajuda` · celular · conta: Carlos · cerca de 25 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Abrir a ajuda | 4,2 s | linha "Ajuda e tutoriais" do Perfil |
| 2. As pastas | 10,4 s | grupo "Seu cargo" no topo de `/ajuda` |
| 3. As abas de cada tutorial | 6,9 s | um passo do tutorial; o vídeo pula |

Seed: a central de ajuda sincronizada no banco de demonstração e **pelo menos um tutorial com vídeo publicado** nesse banco. Risco: dependência circular; produzir por último, depois de publicar no ambiente de demonstração um dos pilotos.

### Pasta 2: Gestor (computador, conta Rafael)

#### 2.1 `gestor-criar-conta-predio` · computador · conta: nenhuma, depois gestor novo do seed · cerca de 30 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. O cadastro de gestor | 13,1 s | aviso cruzado de `/register/gestor` ("Recebeu um código, link ou QR Code de um prédio?") |
| 2. Criar a conta | 4,6 s | formulário, depois "Confirme seu e-mail" |
| 3. Cadastrar o prédio | 8,8 s | "Criar prédio", modal "Novo prédio": "Nome", "Descrição (opcional)", campo de andares, "Criar prédio" |

Seed: gestor confirmado sem prédio. Riscos: o mesmo e-mail real da 1.1 (D2). O modal exige ao menos um andar para habilitar "Criar prédio" (`BuildingFormModals.js:113`); a narração agora diz isso, e a ação digita um andar. A Aba 2 tem 4,6 s de voz para preencher e enviar: vai durar mais que a voz.

#### 2.2 `gestor-andares` · computador · cerca de 29 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Ver os andares | 10,8 s | etiquetas de andar no modal "Editar prédio" |
| 2. Adicionar um andar | 7,7 s | campo de andar e botão "+"; a etiqueta "2º Subsolo"; "Salvar" |
| 3. Remover um andar | 7,3 s | "X" de uma etiqueta; "Cancelar" e o aviso de alterações não salvas |

Seed: Edifício Demonstração com andares 6º ao 5º subsolo. Riscos sérios: **não existe seção de andares na página do prédio**; os andares só aparecem no modal "Editar prédio" do cartão em `/gestor`. **Subsolo não é número negativo**: é texto como "2º Subsolo" (`lib/floorOrder.js:2-9`). **Remover não pede confirmação e não mostra mensagem**; a remoção vale ao "Salvar" e **apaga em cascata as vistorias daquele andar** (`backend/prisma/schema.prisma:524`, `onDelete: Cascade`). A gravação nunca pode clicar "Salvar" na Aba 3. Narrações das Abas 1 a 3 corrigidas (D12, resolvida).

#### 2.3 `gestor-compartilhar` · computador · cerca de 51 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. As três formas | 9,2 s | "Compartilhar ID" na página do prédio |
| 2. QR Code | 8,8 s | QR Code e o tempo restante |
| 3. Link | 5,8 s | "Copiar link de convite" |
| 4. Código do prédio | 8,1 s | bloco "Código do prédio" e "Copiar" |
| 5. Se o código vazou | 12,7 s | "Gerar novo código", confirmação, "Gerar novo código" de novo, código novo |

Seed: prédio com código conhecido. Riscos: a Aba 5 troca o código de verdade; a restauração precisa voltar o código do seed (a 1.3 depende dele). O contador do QR Code corre em tempo real; ok.

#### 2.4 `gestor-aprovar-pedidos` · computador · cerca de 37 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Ver os pedidos | 6,9 s | "Solicitações" com contador em Colaboradores; pedido do Lucas |
| 2. Os papéis | 14,2 s | "Aprovar"; a lista de papéis com descrição |
| 3. Aprovar | 5,4 s | "Inspetor", "Aprovar como inspetor"; Lucas em "Vínculos do prédio" |
| 4. Rejeitar | 5,8 s | "Rejeitar" (X) de um segundo pedido; aviso "Solicitação rejeitada" |

Seed: Lucas com pedido pendente e uma segunda conta com pedido (a Aba 4 precisa de alguém na lista depois que Lucas foi aprovado). Riscos: o botão é **"Rejeitar"**, não "Recusar", e **rejeita direto, sem confirmação** (`colaboradores/page.js:196-212`): não dá para "cancelar". Decidido em D13: a gravação rejeita de verdade o pedido do Pedro Rocha (segunda conta do elenco) e a restauração o recria.

#### 2.5 `gestor-equipe` · computador · cerca de 27 s · **piloto**

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. A lista de membros | 5,0 s | seção "Vínculos do prédio" |
| 2. Mudar o papel | 9,2 s | seletor "Papel de Beatriz Costa neste prédio": Visualizador para Moderador, e de volta |
| 3. Remover alguém | 9,2 s | "Remover vínculo", modal "Remover colaborador", "Cancelar" |

Seed: equipe completa do elenco. Risco: a lista não tem data de entrada (só nome, e-mail, papel e botão); a narração não cita data, então só a "Tela" do roteiro muda. Bom piloto: interações reais, nenhuma destrutiva.

#### 2.6 `gestor-cogestores-transferencia` · computador · cerca de 38 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Adicionar um co-gestor | 8,1 s | seção "Gestão", campo "E-mail da conta de gestor", "Adicionar" |
| 2. Dono e co-gestor | 6,5 s | seção "Dono do prédio" |
| 3. Transferir o prédio | 7,7 s | "Passar o prédio", modal com os 7 dias, "Cancelar" |
| 4. Prédio inativo | 10,4 s | faixa "Este prédio está inativo desde..." na conta Paula |

Seed: Helena gestora sem vínculo com o prédio; Paula com prédio de `frozen_at` preenchido. Riscos: a Aba 4 troca de conta no meio do vídeo (logout e login fora do quadro, com corte e dissolução). Narração e título da aba agora dizem "inativo", como a faixa; a gravação não clica no link "Planos e cobrança" da faixa. O texto da faixa tem um travessão na interface (`GestorShell.js:83`); não é narração, mas aparece no vídeo.

#### 2.7 `gestor-acompanhar-operacao` · computador · cerca de 29 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Os chamados do prédio | 6,2 s | "Novos chamados" na barra lateral do gestor |
| 2. O painel analítico | 10,0 s | "Análise"; abas "Processos", "Prédio", "Desempenho" |
| 3. Gestor não vistoria | 9,2 s | cartão do prédio em "Seus prédios", com as ações sem vistoria |

Seed: chamados em vários estados. Risco: a Aba 3 precisa mostrar uma ausência. Não há "Iniciar vistoria" em lugar nenhum para o gestor (ele nem tem início nem barra inferior). Tela adotada no roteiro: o painel "Seus prédios" inteiro, com zoom no cartão do prédio mostrando as ações (Abrir, Compartilhar chave, Editar prédio, Excluir prédio), sem vistoria.

### Pasta 3: Inspetor (celular, conta Carlos)

#### 3.1 `inspetor-vistoria-completa` · celular · cerca de 74 s (o mais longo)

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Começar | 7,3 s | cartão "Nova vistoria" |
| 2. Escolher os andares | 9,6 s | lista "Andares": 6º, 5º, 4º, 1º subsolo; avançar |
| 3. Andar sem problema | 7,7 s | "Nada a relatar neste andar", "Próximo andar" |
| 4. Registrar uma ocorrência | 11,5 s | escada: "Tipo de manutenção", "Categoria", "Prioridade", "Descrição" |
| 5. Mais de uma ocorrência no andar | 6,9 s | "Adicionar ocorrência"; "Prioridade" Alta |
| 6. Se faltou algo | 6,2 s | mensagens de erro ("Descreva a ocorrência") |
| 7. Voltar a um andar | 5,0 s | "Voltar"; andar preenchido |
| 8. Enviar | 10,4 s | "Enviar vistoria"; "Vistoria enviada" |

Seed: andares com os nomes certos; nenhum rascunho no `localStorage`. Riscos: muitas ações por aba; a Aba 4 vai passar da voz. A Aba 7 tem a armadilha do aviso "Este andar tem ocorrências preenchidas e ainda não enviadas. Voltar agora as perde" (`inspecao/page.js:531-535`): voltar do andar 5 depois de avançar não perde nada, mas se a gravação voltar com o andar atual preenchido, o aviso aparece. Planejar a Aba 7 a partir de um andar sem preenchimento. A Aba 8 cria chamados que outras gravações não esperam: restaurar depois.

#### 3.2 `inspetor-prioridade-situacao` · celular · cerca de 32 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. As três situações | 9,6 s | marcas OK, Atenção e Problema no histórico |
| 2. Como é calculado | 10,8 s | relatório aberto, situação de cada andar |
| 3. Por que isso importa | 8,1 s | dia com Problema no calendário do histórico |

Seed: vistorias com andares nas três situações, uma delas com Problema no subsolo. Risco baixo, só leitura.

#### 3.3 `inspetor-retomar-vistoria` · celular · cerca de 45 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. O que fica salvo | 13,5 s | dois andares concluídos; a página fecha |
| 2. Retomar | 9,2 s | modal "Vistoria interrompida", "Continuar vistoria" |
| 3. Se a internet cair no envio | 11,9 s | erro do envio (`page.route` bloqueando), reenvio, "Vistoria enviada" |
| 4. Descartar | 5,4 s | "Descartar e começar de novo" |

Seed: nenhum rascunho no início. A narração já usa "Continuar vistoria" (D14, resolvida); "Descartar e começar de novo" não pede confirmação. "Fechar a aba" num teste é recarregar ou abrir página nova no mesmo contexto (o rascunho mora no `localStorage`); o corte entre fechar e abrir precisa de dissolução. A Aba 4 precisa de um rascunho de novo: recriar com mais dois andares fora do quadro, com corte. O vencimento de um dia confere com `lib/draft.js:28`. A garantia de não duplicar vem do `Idempotency-Key` (`inspecao/page.js:373`).

#### 3.4 `inspetor-historico` · celular · cerca de 32 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Abrir o histórico | 6,2 s | "Histórico" na barra inferior |
| 2. Vistorias e ocorrências | 8,8 s | alternador "Vistorias" / "Ocorrências" |
| 3. Abrir o relatório do dia | 13,1 s | aviso do topo do relatório do dia (nomes de quem vistoriou) |

Seed: um dia com duas vistorias de Carlos e Ana; ocorrências em aberto, encaminhada, em andamento e concluída. Risco baixo.

### Pasta 4: Responsável (celular, conta Marcos)

#### 4.1 `responsavel-receber-chamado` · celular · cerca de 27 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. O aviso de chamado novo | 5,4 s | "1 para receber" no topo de `/responsavel` |
| 2. Ver o chamado | 6,2 s | escada: andar, prioridade, "Prazo", "Do moderador" |
| 3. Receber | 11,9 s | "Receber chamado"; o chamado vai para "Em andamento" |

Seed: exatamente um chamado encaminhado a Marcos, com nota do moderador e prazo. Risco: "1 para receber" depende de haver um só; a restauração garante.

#### 4.2 `responsavel-trabalhar-chamado` · celular · cerca de 39 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Sua fila | 8,5 s | filas "A receber", "Em andamento", "Concluídos" |
| 2. Registrar o andamento | 7,3 s | "O que foi feito agora?", "Fotos", "Registrar" |
| 3. Aguardando responsável | 9,6 s | fila "A receber": etiqueta "Encaminhado", fio do prazo e botão "Receber" do cartão |
| 4. O prazo | 9,2 s | "3 dias úteis para o prazo" no cartão; "Atrasado há 2 dias úteis" no chamado atrasado |

Seed: chamados de Marcos em andamento, um atrasado; foto de exemplo própria para o seletor de arquivos. A Aba 3 precisa de um chamado encaminhado a Marcos e ainda não recebido (D19). Os dias úteis dependem da data do render: o seed calcula prazos relativos a "hoje" e a gravação fixa o relógio (`page.clock`), senão o texto muda de um dia para o outro.

#### 4.3 `responsavel-informar-conclusao` · celular · cerca de 34 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. O relatório do serviço | 5,8 s | "Relatório do serviço (se necessário)" |
| 2. Informar conclusão | 7,7 s | "Informar conclusão", confirmação "Informar conclusão?" |
| 3. Aguardando o fechamento | 7,3 s | "Aguardando o moderador fechar" no cartão |
| 4. Desfazer | 8,1 s | "Cancelar conclusão"; texto preservado |

Seed: um chamado de Marcos em andamento. Risco baixo; muda estado, restaurar depois.

#### 4.4 `responsavel-ocorrencia-avulsa` · celular · cerca de 36 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Quando usar | 5,4 s | botão redondo "Registrar ocorrência" (+) no topo de `/responsavel` |
| 2. Preencher | 6,5 s | escada: "Andar / Local", "Tipo de manutenção", "Prioridade", "Categoria", "Descrição do problema" |
| 3. Anexar fotos | 11,9 s | "Anexar fotos"; miniaturas; "Adicionar mais fotos (2/4)" |
| 4. Registrar | 6,9 s | "Registrar ocorrência"; aviso de sucesso |

Seed: duas imagens próprias (geradas, sem direitos de terceiros) em `tutoriais/esteira/fotos/`. Risco: o seletor de arquivos é nativo; a gravação usa `setInputFiles` e a voz explica o gesto. A redução das fotos confere (`lib/imagem.js`).

### Pasta 5: Moderador (computador, conta Juliana)

#### 5.1 `moderador-painel` · computador · cerca de 21 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Os contadores | 5,8 s | cartões "Em aberto", "Encaminhados", "Em andamento", "Concluídos" e "Fora do prazo" |
| 2. A barra lateral | 5,8 s | "Painel", "Análise", "Novos chamados", "Processamento", "Finalizados" |
| 3. O histórico do painel | 5,8 s | cartão do histórico: "Vistorias", "Ocorrências", uma linha aberta |

Seed: chamados em todos os estados. A narração já usa "Em aberto", "Fora do prazo" e "Novos chamados". Não há calendário na área do moderador; a Aba 3 virou o histórico do painel (D15, resolvida).

#### 5.2 `moderador-encaminhar` · computador · cerca de 37 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. A fila de novos | 4,6 s | "Novos chamados" |
| 2. Abrir o chamado | 5,4 s | chamado de prioridade alta |
| 3. Encaminhar | 5,4 s | "Encaminhar para" (Marcos Lima), "Encaminhar" |
| 4. Deixar uma nota | 7,7 s | corte para chamado em andamento; "Notas para o responsável", "Salvar nota" |
| 5. Cancelar o envio | 8,1 s | "Cancelar envio" |

Seed: chamado aberto de prioridade alta sem responsável. Risco: **"Notas para o responsável" só aparece com o chamado em andamento** (`ChamadoModal.js:282-287`). Logo depois de encaminhar, o chamado está "encaminhado" e a caixa mostra "Cancelar envio", não a nota. Resolvido em D16: a Aba 4 grava, com corte, um chamado já em andamento, e a Aba 5 volta ao encaminhado.

#### 5.3 `moderador-acompanhar-fechar` · computador · cerca de 51 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Em andamento | 6,5 s | "Processamento"; chamado com a linha do tempo do responsável |
| 2. Aguardando responsável | 7,7 s | coluna "Encaminhados" do "Processamento"; aviso de aguardando o recebimento; "Cancelar envio" |
| 3. Trocar o responsável | 9,6 s | "Reenviar para", "Reenviar"; desfazer |
| 4. Concluídos pelo responsável | 8,5 s | chamado aguardando fechamento, com o relatório do serviço |
| 5. Finalizar | 12,7 s | "Finalizar", modal "Finalizar chamado", "Houve gasto nesta manutenção", valor |

Seed: um chamado em andamento com relatos e fotos, um encaminhado e ainda não recebido, um aguardando fechamento, um segundo responsável no prédio (para reenviar). Risco: no estado encaminhado o modal só oferece "Cancelar envio"; "Reenviar para" aparece só com o chamado em andamento ou concluído pelo responsável (`components/ChamadoModal.js:276-289`). "Desfazer" o reenvio não existe como um botão: seria reenviar de volta, e o anterior perde o recebimento. Adotado no roteiro: a Aba 3 vai até a escolha e não confirma. A Aba 2 mostra a coluna "Encaminhados" (D19, resolvida).

#### 5.4 `moderador-painel-analitico` · computador · cerca de 41 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Os filtros | 6,5 s | filtros do topo (período e andar) |
| 2. Processos | 8,8 s | aba "Processos" |
| 3. Prédio | 13,8 s | aba "Prédio"; clique numa barra de andar e o filtro muda |
| 4. Desempenho | 6,5 s | aba "Desempenho" |

Seed: meses de chamados finalizados com gasto informado, vários responsáveis. Risco: gráficos animam na entrada; `assentar()` precisa esperar as animações antes do zoom.

#### 5.5 `moderador-relatorio-docx` · computador · cerca de 22 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Escolher o período | 3,8 s | "Gerar relatório" em "Finalizados"; modal "Gerar relatório", "Período" |
| 2. Gerar e baixar | 4,2 s | "Gerar .docx"; download |
| 3. O que o documento traz | 10,4 s | primeira página do relatório convertido para PDF |

Seed: chamados finalizados com relatório e gasto. Risco: a Aba 3 pede o documento aberto. O navegador não abre `.docx`. Opção: converter o arquivo baixado para PDF (LibreOffice sem tela) e abrir num quadro, ou mostrar só o aviso do modal. Decidido em D17: converter para PDF e mostrar a primeira página.

### Pasta 6: Visualizador (conta Beatriz)

#### 6.1 `visualizador-calendario` · computador · cerca de 20 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Visão mensal | 6,2 s | calendário de `/historico`, modo "Mensal" |
| 2. Semestral e anual | 6,5 s | "Semestral", "Anual" |
| 3. Seus prédios | 3,5 s | seletor de prédio do topo |

Seed: vistorias espalhadas por vários meses, com dias de intensidades diferentes. Riscos: o "Painel" do visualizador hoje é a **agenda** (`PainelSupervisor.js:287`), não o calendário de calor; o calendário com "Mensal/Semestral/Anual" está em `/historico` (item "Histórico" da barra lateral). **O seletor de prédio só aparece com mais de um vínculo** (`historico/page.js:452`), e Beatriz tem um. Decidido em D18: Beatriz ganha um segundo prédio no seed, como visualizadora.

#### 6.2 `visualizador-relatorio-planilha` · computador · cerca de 27 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. Abrir o dia | 3,1 s | dia com duas vistorias no calendário |
| 2. Ler o relatório | 8,8 s | aviso do topo e situação de cada andar |
| 3. Baixar a planilha | 11,2 s | "Gerar planilha" ou "Baixar planilha" |

Seed: o mesmo dia com duas vistorias da 3.4; um dia sem planilha gerada. Risco: a geração da planilha pode demorar; vira um corte de espera.

#### 6.3 `visualizador-so-computador` · celular · conta: Beatriz · cerca de 19 s

| Aba | Narr. | Zoom / destaque |
|---|---|---|
| 1. O aviso | 8,1 s | "Acesso apenas pelo computador" |
| 2. O que fazer | 8,5 s | frase "Abra o Viston no computador ou peça ao gestor para mudar seu papel." |

Seed: Beatriz só visualizadora. Risco nenhum; é o vídeo mais simples. Detalhe: o aviso tem o botão "Ver tutorial", que leva a este mesmo vídeo.

### Resumo das durações

28 vídeos, 2.255 palavras, 12.542 caracteres de narração. Voz: cerca de 14,5 min. Vídeo com folgas: cerca de 18,5 min no total. Doze vídeos ficam abaixo dos 40 s que o roteiro pede como alvo mínimo (o mais curto, 6.3, perto de 19 s). Isso não quebra o contrato; é só o roteiro sendo enxuto.

---

## 11. Tabela de rótulos

Situação em 2026-10-13: todos os itens **difere** e **não encontrado** abaixo foram corrigidos no `roteiros.md` (D10 a D19, D21). A tabela fica como registro do levantamento; os `script_hash` que mudaram foram os de 1.2, 1.4, 2.1, 2.2, 2.4, 2.6, 2.7, 3.1, 3.3, 4.2, 5.1, 5.2, 5.3, 5.5 e 6.1.

Legenda: **ok** = o roteiro bate com o código; **difere** = o rótulo real é outro ou o comportamento muda a narração; **não encontrado** = não existe na interface.

| Funcionalidade | Aba | Rótulo do roteiro | Rótulo real (arquivo:linha) | Situação |
|---|---|---|---|---|
| 1.1 | 1 | "Criar conta" | "Criar conta" (`frontend/app/login/page.js:162`) | ok |
| 1.1 | 4 | "Confirmar" | "Confirmar" (`components/ConfirmarCodigo.js:92`), título "Confirme seu e-mail" (`register/page.js:121`) | ok |
| 1.2 | 3 | "Solicitar Acesso ao Prédio", "Solicitação Enviada!" | iguais (`conectar/page.js:515`, `:313`) | ok |
| 1.2 | 4 | pedido pendente na tela inicial | a tela inicial só mostra "Nenhum prédio ainda" e o formulário (`home/page.js:143-152`) | não encontrado |
| 1.2 | 5 | mensagem de expirado | "Convite expirado" (`conectar/page.js:213`) | ok |
| 1.3 | 1 | "Nenhum prédio ainda" | igual (`home/page.js:146`) | ok |
| 1.3 | 2 | "Buscar", "Conectar-se" | iguais (`components/JoinBuildingForm.js:73`, `:83`) | ok |
| 1.4 | 2 | edição de nome e e-mail | caixa "Identificação"; **e-mail só leitura** (`perfil/page.js:989`, `:567-576`) | difere |
| 1.4 | 3 | troca de senha | "Alterar senha", "Senha atual", "Nova senha", "Confirmar nova senha" (`perfil/page.js:1007`, `:616-623`) | ok |
| 1.4 | 4 | "Tema" | "Tema" com "Automático", "Escuro", "Claro" (`perfil/page.js:1015`, `components/SeletorDeTema.js:137-151`) | ok (há opção a mais) |
| 1.4 | 5 | exclusão | "Excluir conta" (`perfil/page.js:1034`, modal `:1093`) | ok |
| 1.5 | 1 | "Ajuda e tutoriais" | igual (`perfil/page.js:1023`) | ok |
| 1.5 | 2 | "Seu cargo" | igual (`ajuda/page.js:180`) | ok |
| 2.1 | 1 | aviso cruzado | "Recebeu um código, link ou QR Code de um prédio?" / "Crie uma conta comum." (`register/gestor/page.js:139-140`) | ok |
| 2.1 | 3 | criar prédio, campos **(confirmar)** | "Criar prédio"; modal "Novo prédio" com "Nome", "Descrição (opcional)" e andares obrigatórios (`gestor/page.js:58`, `components/BuildingFormModals.js:106-114`) | difere (andar obrigatório) |
| 2.2 | 1 | seção de andares no prédio | só no modal "Editar prédio" do cartão (`gestor/page.js:100`, `BuildingFormModals.js:200`) | não encontrado na página do prédio |
| 2.2 | 2 | adicionar andar **(confirmar campos)** | campo livre "Ex: 1, 2, Cobertura, Subsolo... (Enter para adicionar)" + "+" (`BuildingFormModals.js:41-46`); subsolo é "2º Subsolo", não negativo (`lib/floorOrder.js:2-9`) | difere |
| 2.2 | 3 | remover com confirmação **(confirmar comportamento)** | "X" na etiqueta, sem confirmação, vale ao "Salvar", mínimo 1 andar (`BuildingFormModals.js:172-175`); apaga em cascata o histórico do andar (`backend/prisma/schema.prisma:524`) | difere |
| 2.3 | 1 | área de compartilhamento | "Compartilhar ID" (`gestor/predios/[id]/page.js:212`) ou "Compartilhar chave" (`gestor/page.js:99`) | ok |
| 2.3 | 3 | copiar o link | "Copiar link de convite" (`components/ModalShareBuilding.js:622`) | ok |
| 2.3 | 4 | código de doze caracteres | "Código do prédio", "Copiar" (`ModalShareBuilding.js:702`, `:725`) | ok |
| 2.3 | 5 | gerar novo código | "Gerar novo código", "Cancelar" (`ModalShareBuilding.js:776`, `:762`, `:753`) | ok |
| 2.4 | 1 | contador de pedidos | "Solicitações" com contador (`gestor/predios/[id]/colaboradores/page.js:359`) | ok |
| 2.4 | 2 | "Aprovar" | "Aprovar"; confirmação "Aprovar como inspetor" (`colaboradores/page.js:234`, `components/EscolhaDePapel.js:215`) | ok |
| 2.4 | 4 | "Recusar" **(confirmar)**, com confirmação | **"Rejeitar"**, sem confirmação (`colaboradores/page.js:239`, `:196-212`) | difere |
| 2.5 | 1 | colunas nome, papel, data de entrada **(confirmar)** | nome, e-mail, seletor de papel, "Remover vínculo"; sem data (`colaboradores/page.js:74-99`) | difere (só a Tela) |
| 2.5 | 3 | remover, confirmação | "Remover vínculo", modal "Remover colaborador", "Cancelar" (`colaboradores/page.js:98`, `:486`, `:495`) | ok |
| 2.6 | 1 | adicionar co-gestor **(confirmar: por e-mail)** | "E-mail da conta de gestor" + "Adicionar", seção "Gestão" (`colaboradores/page.js:183-194`, `:373`) | ok (é por e-mail) |
| 2.6 | 2 | marca de dono | seção "Dono do prédio" (`colaboradores/page.js:398`) | ok |
| 2.6 | 3 | transferência, prazo | "Passar o prédio", 7 dias, "Cancelar" (`components/TrocaDeDono.js:103`, `:115`, `:125`) | ok |
| 2.6 | 4 | aviso de congelado | "Este prédio está inativo desde..." (`components/GestorShell.js:82`) | difere (palavra "inativo") |
| 2.7 | 2 | Processos, Prédio, Desempenho | iguais (`components/analytics/PainelAnalitico.js:68-70`); menu "Análise" (`components/GestorSidebar.js:28`) | ok |
| 2.7 | 3 | ausência de "Iniciar vistoria" **(confirmar)** | gestor não tem início nem barra inferior (`perfil/page.js:1054`) | ok (ausência confirmada) |
| 3.1 | 1 | "Iniciar vistoria" **(confirmar)** | **"Nova vistoria"** (`home/page.js:137`) | difere |
| 3.1 | 3 | "Nada a relatar", "Próximo andar" | "Nada a relatar neste andar", "Próximo andar" (`components/FloorForm.js:160`, `:216`) | ok |
| 3.1 | 4 | "Tipo de manutenção", "Descrição" | iguais, mais "Categoria", "Prioridade", "Responsável (opcional)" (`FloorForm.js:178-197`, `:66`) | ok |
| 3.1 | 5 | outro registro **(confirmar rótulo)** | "Adicionar ocorrência" (`FloorForm.js:211`) | ok (rótulo definido) |
| 3.1 | 8 | "Enviar vistoria" | igual; tela "Vistoria enviada" (`FloorForm.js:216`, `inspecao/page.js:476`) | ok |
| 3.3 | 2 | "retomar" | modal "Vistoria interrompida", botão **"Continuar vistoria"** (`inspecao/page.js:512-520`) | difere |
| 3.3 | 4 | descartar | "Descartar e começar de novo" (`inspecao/page.js:522`) | ok |
| 3.4 | 2 | alternador | "Vistorias" / "Ocorrências" (`components/HistoricoSwitcher.js:35-36`) | ok |
| 4.1 | 1 | "1 para receber", "A receber" | iguais (`responsavel/page.js:399`, `:164`) | ok |
| 4.1 | 2 | "Prazo", "Do moderador" | "Do moderador" (`responsavel/chamados/[id]/page.js:257`) | ok |
| 4.1 | 3 | "Receber chamado" | igual (`responsavel/chamados/[id]/page.js:280`) | ok |
| 4.2 | 1 | filas | "A receber", "Em andamento", "Concluídos" (`responsavel/page.js:164-166`) | ok |
| 4.2 | 2 | relato e foto **(confirmar rótulos)** | "O que foi feito agora?", "Fotos", "Registrar" (`components/LinhaDoTempo.js:449`, `:510`, `:513`) | ok (rótulos definidos) |
| 4.2 | 4 | "3 dias úteis para o prazo", "Atrasado há 2 dias úteis" | formatos iguais (`lib/chamadosDoResponsavel.js:129-132`) | ok |
| 4.3 | 2 | "Informar conclusão" | igual, confirmação "Informar conclusão?" (`lib/chamadosDoResponsavel.js:95-100`) | ok |
| 4.3 | 3 | "Aguardando o moderador fechar" | igual (`lib/chamadosDoResponsavel.js:72`) | ok |
| 4.3 | 4 | "Cancelar conclusão" | igual (`components/CancelarConclusaoBox.js:48`) | ok |
| 4.4 | 1 | onde fica o botão **(confirmar)** | botão redondo "Registrar ocorrência" no topo de `/responsavel` (`responsavel/page.js:418`); modal "Registrar nova ocorrência" (`components/RegistrarOcorrenciaModal.js:146`) | ok (lugar definido) |
| 4.4 | 2 | andar, tipo, categoria, prioridade, descrição | "Andar / Local", "Tipo de manutenção", "Prioridade", "Categoria", "Descrição do problema" (`RegistrarOcorrenciaModal.js:165-209`) | ok |
| 4.4 | 3 | "Anexar fotos" | igual; depois "Adicionar mais fotos (n/4)" (`RegistrarOcorrenciaModal.js:271`) | ok |
| 4.4 | 4 | "Registrar ocorrência" | igual (`RegistrarOcorrenciaModal.js:285`) | ok |
| 5.1 | 1 | novos, encaminhados, em andamento, concluídos | "Em aberto", "Encaminhados", "Em andamento", "Concluídos" + "Fora do prazo" (`moderador/page.js:201-205`) | difere ("novos") |
| 5.1 | 3 | calendário de vistorias | não há na área do moderador (`components/ModeradorSidebar.js:26-34`, `moderador/page.js`) | não encontrado |
| 5.2 | 3 | encaminhar | "Encaminhar para", "Encaminhar" (`components/ChamadosBoard.js:544`, `:557`) | ok |
| 5.2 | 4 | "Notas para o responsável", "Salvar nota" | iguais, mas só com o chamado em andamento (`components/ChamadoModal.js:134`, `:148`, `:282-287`) | difere (momento) |
| 5.2 | 5 | "Cancelar envio" | igual (`ChamadoModal.js:176`) | ok |
| 5.3 | 2 | chamado aguardando o responsável receber | coluna "Encaminhados" (`components/ProcessamentoBoard.js:203-204`); aviso "Aguardando ... confirmar o recebimento" e "Cancelar envio" (`components/ChamadoModal.js:252-258`, `:276-279`) | ok (aba redefinida em D19) |
| 5.3 | 3 | reencaminhar | "Reenviar para", "Reenviar" (`ChamadoModal.js:82`, `:89`) | difere (nome) |
| 5.3 | 5 | finalizar, houve gasto | "Finalizar", "Finalizar chamado", "Houve gasto nesta manutenção" (`ChamadoModal.js:302`, `components/FinalizarChamadoModal.js:91`, `:119`) | ok |
| 5.5 | 1 | geração do relatório **(confirmar onde)** | "Gerar relatório" em Finalizados; modal "Gerar relatório", "Período" (`moderador/chamados/finalizados/page.js:44`, `components/RelatorioModal.js:105-112`) | ok (lugar definido) |
| 5.5 | 2 | gerar e baixar | "Gerar .docx" (`RelatorioModal.js:194`) | ok |
| 6.1 | 1 | calendário mensal | em `/historico`, modos "Mensal", "Semestral", "Anual" (`historico/page.js:237`); o Painel do visualizador é a agenda (`desktop/visualizacao/_componentes/PainelSupervisor.js:287`) | difere (rota) |
| 6.1 | 3 | seletor de prédio **(confirmar)** | só com mais de um vínculo (`historico/page.js:452-453`) | não aparece para a Beatriz do seed |
| 6.2 | 3 | "Gerar planilha" / "Baixar planilha" | iguais (`components/ReportDocumentModal.js:326-353`) | ok |
| 6.3 | 1 | aviso | "Acesso apenas pelo computador" + "Ver tutorial" (`components/RouteGuard.js:38`, `:44`) | ok |

Caminhos relativos a `frontend/app/`, exceto onde indicado.

### Rotas citadas

Todas existem: `/login`, `/register`, `/register/gestor`, `/confirmar`, `/conectar` (lê `token` ou `codigo`, e `expirado=true`, em `conectar/page.js:26` e `:126`), `/home`, `/perfil`, `/ajuda`, `/ajuda/[pasta]/[funcionalidade]`, `/gestor`, `/gestor/predios/[id]` com `colaboradores`, `dashboard`, `agenda` e `chamados/{novos,processamento,finalizados}`, `/inspecao`, `/historico`, `/responsavel`, `/responsavel/chamados/[id]`, `/moderador`, `/moderador/dashboard`, `/moderador/chamados/{novos,processamento,finalizados}`, `/desktop/visualizacao`.

### Tema escuro

Forçável e estável: `localStorage['viston:tema'] = 'dark'` antes da carga (`frontend/app/lib/theme.js:26` e `:46`) define `data-theme="dark"` na primeira pintura. `colorScheme: 'dark'` no Playwright cobre quem ficar em "Automático".

---

## 12. Divergências entre o roteiro de origem e o do repositório

O `roteiros.md` do repositório (fonte da verdade, 6 pastas e 28 funcionalidades) e o `prompts/roteiros-tutoriais-viston.md` (origem do usuário) diferem. Situação em 2026-10-13: R9 e R10 aplicados (sem plano nem assinatura na narração; na 2.6 o dono é quem pode transferir o prédio, embora a tela ainda diga "Quem paga pelo prédio"); R1 a R5 e a pasta 7 seguem fora, por decisão do proprietário.

| # | Onde | Roteiro de origem | Repositório | Efeito |
|---|---|---|---|---|
| R1 | 2.7 | "Plano e assinatura" (`gestor-plano-assinatura`, 3 abas, só se o checkout do Stripe funcionar) | não existe; 2.7 é "Acompanhar a operação" | Na origem, "Acompanhar a operação" é 2.8. O id `gestor-acompanhar-operacao` é o mesmo, só a numeração muda. |
| R2 | Pasta 7 | "Administração": 7.1 `admin-publicar-tutorial` (5 abas) e 7.2 `admin-painel` (4 abas) | não existe | `catalogo.mjs` registra que "o proprietário decidiu que o ADMIN não tem tutorial, e a pasta de administração saiu do roteiro". São 30 + 2 = 32 vídeos na origem contra 28 aqui. |
| R3 | 2.1 | 4 abas, com "O que o plano Livre permite" | 3 abas | Narração de origem fala em plano Livre, Essencial e Pro. |
| R4 | 2.4 | 5 abas, com "Quando o plano não comporta" (conta Paula, papel bloqueado) | 4 abas | O commit recusa pacote com número de abas diferente do catálogo. |
| R5 | Elenco | Rafael "plano Pro"; Paula "plano Livre (para mostrar limites)"; "Suporte Viston" ADMIN | Rafael sem plano; Paula "congelado (para mostrar o aviso)"; sem ADMIN | O seed do C1 ainda pede ADMIN e plano Livre para Paula; sem a pasta 7 e as abas de plano, a conta ADMIN só serve para enviar os pacotes. |
| R6 | 1.1 Aba 4 | confirmação por **link** no e-mail | confirmação por **código** | O código é o que existe hoje (`ConfirmarCodigo`). |
| R7 | 1.2 Aba 3 | "Pedir acesso" (confirmar) | "Solicitar Acesso ao Prédio" | O repositório já usa o real. |
| R8 | 1.3 Abas 1 e 2 | "abra a opção de entrar com código"; "envie" | campo já visível; "Buscar" e "Conectar-se" | O repositório já usa o real. |
| R9 | 2.1 Abas 1 e 2 | "cuida da assinatura"; "Toda conta de gestor começa no plano Livre" | "acompanha a operação"; sem plano | Planos fora dos tutoriais. |
| R10 | 2.6 Abas 2 e 4 | dono "é quem paga a assinatura"; congelamento por limite do plano | dono "é quem pode transferir"; congelado "com um aviso explicando o que falta acertar" | A interface ainda diz "Quem paga pelo prédio" (`colaboradores/page.js:398`) e manda regularizar em "Planos e cobrança" (`GestorShell.js:84`). |
| R11 | 4.1 | "contador acende"; lista "Chamados encaminhados a você"; botão "Receber" | "1 para receber"; fila "A receber"; "Receber chamado" | O repositório já usa o real. |
| R12 | 4.2 Abas 1 e 4 | abas de filas (confirmar); "O prazo... fica em vermelho" | filas nomeadas; prazo com dias úteis | O repositório já usa o real. |
| R13 | 4.3 Aba 4 | "desfazer a conclusão (confirmar rótulo)"; "Desfaça" | "Cancelar conclusão" | O repositório já usa o real. |
| R14 | 6.2 Aba 3 | "baixar o Excel" | "Gerar planilha" / "Baixar planilha" | O repositório já usa o real. |

---

## 13. Ordem de produção

### 13.1 Pilotos (antes dos 28)

1. **`primeiros-passos-entrar-codigo`** (celular, 3 abas, cerca de 32 s). Tem digitação, dois toques, uma resposta da API e um aviso de sucesso; o seed é simples (Lucas e o código); e o pacote de exemplo em `tutoriais/exemplo/` é dele, o que dá um termo de comparação direto. Valida: gravação 2x, zoom no celular, ponto de toque, sincronia do `legenda.vtt` no player.
2. **`gestor-equipe`** (computador, 3 abas, cerca de 27 s). Seletor que abre e fecha, modal com cancelar, nada destrutivo. Valida: zoom no computador, anel em elemento pequeno (o seletor de papel), troca de aba sem corte.

Critérios para liberar o lote: os dois passam no `validar.mjs`; o proprietário aprova voz, ritmo, anel e zoom no Studio e a legenda no player; texto legível no ponto máximo do zoom; `inicio_s` leva ao ponto certo no player da ajuda (subir no ambiente de demonstração e clicar nas abas).

### 13.2 Lote

Ordem pensada para o seed e para o risco:

1. Só leitura, sem pendência: 6.3, 3.2, 3.4, 6.2, 5.4, 4.1.
2. Muda estado, sem pendência: 1.3 (piloto), 2.5 (piloto), 2.3, 2.6, 4.3, 4.4, 3.1, 1.4 (depois de D11).
3. Dependem de decisão da seção 15: 1.1 e 2.1 (D2), 1.2 (D10), 2.2 (D12), 2.4 (D13), 3.3 (D14), 4.2 e 5.3 (D19), 5.1 (D15), 5.2 (D16), 5.5 (D17), 6.1 (D18), 2.7 (tela da Aba 3).
4. Por último: 1.5 (precisa de um tutorial publicado no ambiente de demonstração).

---

## 14. Pré-requisitos, custos e tempo

### 14.1 O que falta

| Item | Situação hoje | O que fazer |
|---|---|---|
| Chave ElevenLabs | `ELEVENLABS_API_KEY` não definida | Criar a chave num plano pago (uso comercial) e definir na máquina. Escolher a voz (D3). |
| Banco de demonstração | não existe; o desenvolvimento aponta para o Supabase da nuvem | Um banco separado só para a esteira (projeto ou branch Supabase dedicado, ou Postgres local). Nunca o de produção (D5). Migrations nele com a mesma cadeia do Prisma. |
| `backend/prisma/seed-demo.ts` | não existe (há só `seed:ajuda`) | Escrever conforme C1 mais as necessidades das fichas da seção 10, com `restaurar(id)` e trava contra `NODE_ENV=production` e lista de bancos permitidos. |
| E-mail no ambiente de demonstração | Brevo obrigatório | Modo que não envia (ou caixa de teste) para as contas `@viston.demo` (D2). |
| Backend e frontend de demonstração | | Rodar local apontando para o banco de demonstração (`frontend` em `:3001`). |
| Playwright | não instalado | `npm i -D @playwright/test` em `tutoriais/` e `npx playwright install chromium`. |
| HyperFrames | não instalado; usa `npx` | `npx hyperframes doctor`; `npx hyperframes skills update general-video`. |
| ffmpeg e ffprobe | **instalados** (WinGet, 9.0.2) | nada |
| Node | 24.21.0 | nada |
| `data-testid` | faltam alguns | Commit separado nos elementos sem nome acessível (seção 5.2). |
| Fotos de exemplo | não existem | Gerar duas imagens próprias para a 4.4 e a 4.2. |

### 14.2 Custo da narração

Medido pela estimativa do próprio MCP (sem gerar): 87 caracteres = 87 créditos = US$ 0,0087 no `eleven_multilingual_v2`, ou seja, 1 crédito por caractere, cerca de US$ 0,10 por mil caracteres nessa conta.

| Cenário | Caracteres | Créditos (multilingual v2) | Custo aproximado |
|---|---|---|---|
| Uma geração completa (28 vídeos) | 12.542 | cerca de 12.500 | cerca de US$ 1,25 |
| Com ajustes de pronúncia e ritmo (3 passadas) | cerca de 38.000 | cerca de 38.000 | cerca de US$ 4 |
| Regeneração com cache, mudando uma aba | só a aba | 100 a 300 | centavos |
| Mesmas contas com `eleven_flash_v2_5` | | metade | metade |

O que pesa é a assinatura mínima que libera uso comercial (o plano Starter, de entrada, cobre com folga 30 mil créditos por mês; conferir preço e franquia na contratação).

### 14.3 Tempo

| Fase | Estimativa |
|---|---|
| Banco de demonstração, `seed-demo.ts` e `restaurar()` | 1,5 a 2 dias |
| Esteira (narrar, aba, compor, modelo HyperFrames, empacotar, validar, comandos) | 1,5 a 2,5 dias (meio dia a menos sem a legenda palavra a palavra e o alinhamento por caractere) |
| Pilotos e ajuste fino de estilo com o proprietário | 1 dia |
| 28 testes Playwright (cerca de 20 a 40 min cada, com seletores) | 1,5 a 2 dias |
| Execução completa do lote (gravação em tempo real com folgas, cerca de 1,5x a duração; render local de 1x a 3x; re-encode) | 1 a 2 horas de máquina |
| Revisão dos 28 no Studio e correções pontuais | 0,5 a 1 dia |
| **Total** | **cerca de 6,5 a 8,5 dias de trabalho** |

---

## 15. Decisões pendentes para o proprietário

| # | Pergunta | Recomendação |
|---|---|---|
| D1 | **Resolvida.** Como evitar duas legendas, já que o player liga o `legenda.vtt` por padrão (`<track ... default>` em `components/ajuda/PlayerTutorial.js:317`)? | Decisão do proprietário: sem legenda queimada no vídeo. A única legenda é o `legenda.vtt` por frase, ligado por padrão no player. Nenhuma mudança no frontend. |
| D2 | Como o ambiente de demonstração lida com e-mail (1.1 e 2.1 criam conta e enviam código)? | Modo de e-mail desligado no backend de demonstração, com o código lido do banco. |
| D3 | **Resolvida (2026-10-13).** Qual voz? | Decisão do proprietário: "Juliana, Bright and Encouraging" (`nczLZ6GvJGozyc3FlLte`). "Viston" lido como está escrito, sem acento nem alias (seção 4.3). |
| D4 | Como se fala "QR Code"? | "quiú-ar code". |
| D5 | Onde fica o banco de demonstração? | Um projeto Supabase separado, só para a esteira. |
| D6 | Trilha sonora de fundo? | Nenhuma: tutorial curto, voz limpa, e a regra de não ter abertura nem encerramento combina com silêncio. |
| D7 | No computador, onda de clique sem seta, ou uma seta de cursor animada? | Onda sem seta (não inventa movimento de mouse que não houve). |
| D8 | Aceita vídeos de 19 a 40 s, abaixo do alvo de 40 s do roteiro? | Aceitar; esticar fala para bater meta piora o tutorial. |
| D9 | A tela de envio do admin aceita a pasta com subpastas (`bruto/`, `audio/`, `composicao/`)? | Conferir o `EnvioDoPacote`; se não aceitar, a esteira copia os quatro arquivos para `pacote/` na mesma pasta. |
| D10 | **Resolvida (2026-10-13).** 1.2 Aba 4: a tela inicial não mostra pedido pendente. | Aplicado: a aba fica na confirmação "Solicitação Enviada!" do `/conectar` (texto e "Acessar Início"); a narração diz que o prédio aparece na tela inicial quando o gestor aprovar. |
| D11 | **Resolvida (2026-10-13).** 1.4 Aba 2: o e-mail não se troca pelo perfil. | Aplicado: "Em Identificação você corrige seu nome. O e-mail é a identidade da conta e não muda por aqui." |
| D12 | **Resolvida (2026-10-13).** 2.2: andares no modal "Editar prédio", "2º Subsolo", remover sem confirmação e com histórico apagado. | Aplicado nas Abas 1 a 3: andares em "Editar prédio" do cartão; adicionar com Enter, subsolo escrito por extenso; remover pelo X, sem confirmação, vale ao "Salvar", apaga o histórico do andar, mínimo de um andar. A confirmação no produto fica para outra tarefa. |
| D13 | **Resolvida (2026-10-13).** 2.4 Aba 4: "Rejeitar" age sem confirmação. | Aplicado: aba renomeada "Rejeitar"; a gravação rejeita de verdade um segundo pedido do seed (Pedro Rocha, novo no elenco) e a restauração o recria; a fala usa "Rejeitar" e avisa que não há confirmação. |
| D14 | **Resolvida (2026-10-13).** 3.3 Aba 2: "retomar" virou "Continuar vistoria". | Aplicado, com o modal "Vistoria interrompida" na Tela; a Aba 4 passou a "Descartar e começar de novo", que também não pede confirmação. |
| D15 | **Resolvida (2026-10-13).** 5.1 Aba 3: o moderador não tem calendário. | Aplicado: aba "O histórico do painel" (cartão com "Vistorias" e "Ocorrências"; clicar numa vistoria abre o relatório do dia), mantendo 3 abas. |
| D16 | **Resolvida (2026-10-13).** 5.2: a nota só aparece com o chamado em andamento. | Aplicado: a Aba 4 grava, com corte, um chamado do seed já em andamento, e a fala diz "Quando o responsável já recebeu o chamado"; a Aba 5 volta ao chamado encaminhado da Aba 3. |
| D17 | **Resolvida (2026-10-13).** 5.5 Aba 3: como mostrar o documento. | Aplicado: a esteira converte o `.docx` para PDF e mostra a primeira página. |
| D18 | **Resolvida (2026-10-13).** 6.1 Aba 3: seletor de prédio. | Aplicado: Beatriz ganha um segundo prédio no seed (elenco atualizado) e a fala explica o seletor do topo. |
| D19 | **Resolvida (2026-10-13).** "Terceiro" não existe no Viston (decisão do proprietário). | Aplicado: 4.2 Aba 3 e 5.3 Aba 2 viraram "Aguardando responsável", o chamado encaminhado que espera o "Receber" (estado "Encaminhado"). 4.2: fila "A receber" e o botão "Receber" do cartão. 5.3: coluna "Encaminhados" do "Processamento", onde a única ação é "Cancelar envio". |
| D20 | Divergências R1 a R5: a pasta 7 e as abas de plano (2.1 Aba 4, 2.4 Aba 5, 2.7 assinatura) continuam fora? | **Planos: resolvido (2026-10-13).** O proprietário confirmou que a página de planos não terá vídeo tutorial: 2.7 assinatura, 2.1 Aba 4 e 2.4 Aba 5 ficam fora, como o `catalogo.mjs` já registra. Pasta 7 (Administração): **resolvido (2026-10-13)**, fica fora, como já está. |
| D21 | **Resolvida (2026-10-13).** Corrigir os rótulos direto no `roteiros.md`. | Aplicado numa leva só, antes de qualquer narração; `catalogo.mjs` regenerado (15 `script_hash` mudaram, ver seção 11). |

---

## 16. Fora deste plano

- Nenhum áudio pago foi gerado e nenhum vídeo foi renderizado. A consulta ao MCP ElevenLabs listou vozes e pediu uma estimativa sem gerar; a estimativa criou um flow vazio na conta ElevenLabs.
- Em 2026-10-13 o `roteiros.md` foi corrigido com as decisões D10 a D19 e D21, e o `catalogo.json` regenerado. Nada foi alterado no frontend ou no backend além da cópia gerada do catálogo. Nenhuma migration ou seed foi rodada. Nada foi commitado.
