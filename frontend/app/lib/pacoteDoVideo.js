/**
 * O pacote montado no navegador a partir de um `video.mp4` sozinho.
 *
 * A esteira de gravação entrega os quatro arquivos prontos. Quando o admin tem
 * só o vídeo (gravado à mão, editado fora da esteira), a tela monta os outros
 * três aqui e envia pelo mesmo caminho de sempre: o contrato do servidor não
 * muda, e o commit confere tudo como confere um pacote da esteira.
 *
 * Os tempos são estimativa. A narração é contínua e fala as abas na ordem, então
 * cada aba ocupa do vídeo a mesma fração que o texto dela ocupa da narração
 * inteira. Erra quando a fala acelera ou pausa, e por isso a tela avisa que os
 * tempos precisam ser conferidos (ver EnvioDoPacote e EditorDeAbas).
 *
 * Tudo que é conta mora aqui, em funções puras, e é o que os testes cobrem. O
 * que depende do navegador (ler a duração, tirar a capa de um quadro) fica no
 * fim do arquivo, separado.
 */

/** Teto de cada linha da legenda e de linhas por fala, o padrão de legibilidade. */
export const LEGENDA_MAX_CARACTERES = 42;
export const LEGENDA_MAX_LINHAS = 2;

/** Teto da capa, o mesmo do servidor (ver ARQUIVOS_DO_PACOTE). */
export const CAPA_MAX_BYTES = 300 * 1024;

/**
 * Divide um texto em frases.
 *
 * Corta depois de `.`, `!`, `?` e reticências seguidos de espaço. "Sr." e
 * números com ponto (1.200) cortariam errado, e não aparecem nos roteiros; o
 * custo do erro, se aparecerem, é uma fala de legenda dividida em duas.
 */
export function dividirFrases(texto) {
  const limpo = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (!limpo) return [];
  return limpo
    .split(/(?<=[.!?…])\s+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Quebra uma frase em falas de legenda: cada fala com até `maxLinhas` linhas de
 * até `maxCaracteres` caracteres. Devolve uma lista de falas, cada uma uma lista
 * de linhas.
 *
 * Quebra em espaço. Uma palavra maior que a linha (um endereço, por exemplo) é
 * cortada no limite, porque a linha passar do teto é pior que a palavra partida.
 */
export function quebrarEmFalas(frase, maxCaracteres = LEGENDA_MAX_CARACTERES, maxLinhas = LEGENDA_MAX_LINHAS) {
  const palavras = String(frase ?? '').trim().split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (let palavra of palavras) {
    while (palavra.length > maxCaracteres) {
      if (atual) {
        linhas.push(atual);
        atual = '';
      }
      linhas.push(palavra.slice(0, maxCaracteres));
      palavra = palavra.slice(maxCaracteres);
    }
    if (!palavra) continue;
    const junto = atual ? `${atual} ${palavra}` : palavra;
    if (junto.length <= maxCaracteres) {
      atual = junto;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);

  const falas = [];
  for (let i = 0; i < linhas.length; i += maxLinhas) falas.push(linhas.slice(i, i + maxLinhas));
  return falas;
}

/** Peso de um texto na narração: os caracteres sem espaço repetido. Nunca zero. */
function peso(texto) {
  return Math.max(1, String(texto ?? '').replace(/\s+/g, ' ').trim().length);
}

/** Arredonda ao milissegundo, a precisão que o servidor guarda. */
function ms(segundos) {
  return Math.round(segundos * 1000) / 1000;
}

/**
 * Os inícios estimados de cada aba, em segundos.
 *
 * Proporcionais aos caracteres da narração de cada aba, com a primeira em 0.
 * Sempre crescentes e sempre antes do fim do vídeo, que é o que o servidor
 * exige do `passos.json`.
 */
export function estimarInicios(textos, duracao) {
  if (!Array.isArray(textos) || textos.length === 0) return [];
  if (typeof duracao !== 'number' || !Number.isFinite(duracao) || duracao <= 0) return textos.map(() => 0);
  const pesos = textos.map(peso);
  const total = pesos.reduce((a, b) => a + b, 0);
  let acumulado = 0;
  return pesos.map((p) => {
    const inicio = ms((duracao * acumulado) / total);
    acumulado += p;
    return Math.min(inicio, ms(duracao - 0.001));
  });
}

/**
 * As falas da narração com tempo, uma lista de `{ inicio, fim, texto, linhas }`.
 *
 * Cada aba vai do seu início ao início da próxima (a última, ao fim do vídeo).
 * Dentro dela, o tempo se divide entre as falas na proporção dos caracteres.
 * É a mesma conta do `passos.json`, um nível abaixo: da aba para a frase.
 */
export function falasCronometradas(textos, inicios, duracao) {
  const falas = [];
  textos.forEach((texto, i) => {
    const inicio = inicios[i];
    const fim = i + 1 < inicios.length ? inicios[i + 1] : duracao;
    const pedacos = dividirFrases(texto).flatMap((frase) => quebrarEmFalas(frase));
    if (pedacos.length === 0 || !(fim > inicio)) return;
    const pesos = pedacos.map((linhas) => peso(linhas.join(' ')));
    const total = pesos.reduce((a, b) => a + b, 0);
    let acumulado = 0;
    pedacos.forEach((linhas, j) => {
      const de = ms(inicio + ((fim - inicio) * acumulado) / total);
      acumulado += pesos[j];
      const ate = j === pedacos.length - 1 ? ms(fim) : ms(inicio + ((fim - inicio) * acumulado) / total);
      // Aba curtíssima, em que o arredondamento juntaria as pontas: a fala
      // ganha um milissegundo, porque o servidor recusa fala que termina
      // antes de começar.
      falas.push({ inicio: de, fim: Math.max(ate, ms(de + 0.001)), texto: linhas.join(' '), linhas });
    });
  });
  return falas;
}

/** "00:01:07.120", o tempo do WebVTT. */
export function tempoVtt(segundos) {
  const total = Math.max(0, Math.round(segundos * 1000));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const resto = total % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(resto, 3)}`;
}

/** O `legenda.vtt`, uma fala por bloco, no formato que o servidor confere. */
export function gerarLegendaVtt(falas) {
  const blocos = falas.map((f, i) => `${i + 1}\n${tempoVtt(f.inicio)} --> ${tempoVtt(f.fim)}\n${f.linhas.join('\n')}`);
  return `WEBVTT\n\n${blocos.join('\n\n')}\n`;
}

/**
 * O pacote de texto (`passos.json` e `legenda.vtt`) para uma funcionalidade e
 * um vídeo de tal duração.
 *
 * `feature` é a do admin (GET /admin/help/features/:id): a pasta, o slug, o
 * `catalog_script_hash` e as abas, cujo texto é a narração do roteiro (o seed
 * grava a narração no texto da aba). Sem o hash do catálogo não há pacote: a
 * funcionalidade saiu do roteiro, e um vídeo dela entraria já desatualizado.
 *
 * Devolve `{ ok: true, passos, vtt, inicios }` ou `{ ok: false, erro }`.
 */
export function montarPacoteDeTexto(feature, duracao) {
  const steps = feature?.steps ?? [];
  if (!feature?.catalog_script_hash) {
    return { ok: false, erro: 'Esta funcionalidade saiu do roteiro, e sem o roteiro não dá para montar os passos. Envie o pacote completo gerado pela esteira.' };
  }
  if (steps.length === 0) return { ok: false, erro: 'Esta funcionalidade não tem abas para distribuir no vídeo.' };
  if (typeof duracao !== 'number' || !Number.isFinite(duracao) || duracao <= 0) {
    return { ok: false, erro: 'Não deu para ler a duração do vídeo. Confira se o arquivo abre no navegador.' };
  }
  if (duracao > 600) {
    return { ok: false, erro: `O vídeo tem ${Math.round(duracao)} segundos, acima do limite de 10 minutos.` };
  }

  const ordenadas = [...steps].sort((a, b) => a.order - b.order);
  const textos = ordenadas.map((s) => s.body);
  const inicios = estimarInicios(textos, duracao);
  const passos = {
    pasta: feature.folder?.slug,
    id: feature.slug,
    script_hash: feature.catalog_script_hash,
    duracao_s: ms(duracao),
    abas: ordenadas.map((s, i) => ({ ordem: i + 1, titulo: s.title, texto: s.body, inicio_s: inicios[i] })),
  };
  const vtt = gerarLegendaVtt(falasCronometradas(textos, inicios, ms(duracao)));
  return { ok: true, passos, vtt, inicios };
}

/**
 * Confere os primeiros bytes de um MP4 como o servidor confere no commit:
 * caixa `ftyp`, vídeo H.264 (`avc1` ou `avc3`) e áudio AAC (`mp4a`). Feito
 * aqui só para avisar antes de subir os oito megas; quem decide é o servidor.
 *
 * Devolve `null` quando passa, ou a frase do problema.
 */
export function conferirMp4(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  const texto = (de, ate) => String.fromCharCode(...b.subarray(de, ate));
  if (b.length < 12 || texto(4, 8) !== 'ftyp') return 'O arquivo escolhido não é um vídeo MP4.';
  const tem = (marca) => {
    const c = [...marca].map((ch) => ch.charCodeAt(0));
    for (let i = 0; i + 3 < b.length; i += 1) {
      if (b[i] === c[0] && b[i + 1] === c[1] && b[i + 2] === c[2] && b[i + 3] === c[3]) return true;
    }
    return false;
  };
  if (!tem('avc1') && !tem('avc3')) return 'O vídeo precisa estar em H.264. Exporte de novo em H.264 (MP4) e escolha o arquivo outra vez.';
  if (!tem('mp4a')) return 'O áudio do vídeo precisa estar em AAC. Exporte de novo com áudio AAC e escolha o arquivo outra vez.';
  return null;
}

/* ── Leitura de cues para o player ──────────────────────────────────────────── */

/**
 * As falas da legenda que pertencem a uma aba: as que começam entre o início
 * dela e o início da próxima. Folga de 50 ms para a fala que a esteira põe
 * colada no começo da aba.
 */
export function falasDoTrecho(falas, inicio, fim) {
  if (!Array.isArray(falas) || typeof inicio !== 'number') return [];
  return falas.filter((f) => f.inicio >= inicio - 0.05 && (typeof fim !== 'number' || f.inicio < fim - 0.05));
}

/** A fala dita no instante `t`: a última que já começou. `-1` antes da primeira. */
export function indiceDaFala(falas, t) {
  let atual = -1;
  (falas ?? []).forEach((f, i) => {
    if (f.inicio <= t + 0.05) atual = i;
  });
  return atual;
}

/* ── Navegador: duração e capa ─────────────────────────────────────────────── */

/**
 * Abre o vídeo num `<video>` fora da tela e resolve com ele já com metadados.
 * Quem chama libera o endereço com `fechar()`.
 */
export function abrirVideoOculto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const fechar = () => {
      video.removeAttribute('src');
      video.load?.();
      URL.revokeObjectURL(url);
    };
    video.onloadedmetadata = () => resolve({ video, fechar });
    video.onerror = () => {
      fechar();
      reject(new Error('O navegador não conseguiu abrir este vídeo.'));
    };
    video.src = url;
  });
}

/** Leva o vídeo a um instante e espera o quadro estar pronto. */
function irAoQuadro(video, t) {
  return new Promise((resolve) => {
    const pronto = () => {
      video.removeEventListener('seeked', pronto);
      resolve();
    };
    video.addEventListener('seeked', pronto);
    video.currentTime = t;
  });
}

function canvasParaJpeg(canvas, qualidade) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', qualidade));
}

/**
 * Tira a `capa.jpg` de um quadro do vídeo.
 *
 * O quadro é o de 10% da duração (no máximo 3 s): o primeiro quadro costuma
 * ser tela de abertura ou preto. Largura até 1280 px, e a qualidade desce até
 * caber nos 300 KB; não cabendo, a largura cai pela metade e tenta de novo.
 */
export async function capaDoVideo(video) {
  const t = Math.min(3, (video.duration || 0) * 0.1);
  await irAoQuadro(video, t);
  let largura = Math.min(1280, video.videoWidth || 1280);
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const altura = Math.round((largura * (video.videoHeight || 720)) / (video.videoWidth || 1280));
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    canvas.getContext('2d').drawImage(video, 0, 0, largura, altura);
    for (const q of [0.86, 0.76, 0.66, 0.56, 0.46]) {
      const blob = await canvasParaJpeg(canvas, q);
      if (blob && blob.size <= CAPA_MAX_BYTES) return blob;
    }
    largura = Math.round(largura / 2);
  }
  throw new Error('Não deu para gerar uma capa de até 300 KB a partir do vídeo.');
}
