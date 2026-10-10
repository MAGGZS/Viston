/**
 * As regras da central de ajuda que não dependem de tela.
 *
 * Moram aqui, fora dos componentes, por dois motivos. O primeiro é que o player
 * é um só para o usuário e para a pré-visualização do admin, e as contas de
 * "qual aba está ativa neste segundo" não podem existir em duas versões que um
 * dia discordam. O segundo é teste: a aba que acompanha o tempo e a conferência
 * do pacote são as duas partes com mais casos de borda, e testá-las sem montar
 * vídeo nenhum é o que deixa os casos de borda baratos de cobrir.
 *
 * O contrato da API está em tutoriais/API.md; nomes de campo e mensagens vêm de
 * lá, e não de suposição.
 */

/**
 * A aba que vale para um instante do vídeo.
 *
 * É a última com `start_s <= tempo`, como o contrato define. Aba sem tempo
 * (`start_s` nulo, o que acontece enquanto o vídeo não foi enviado ou quando o
 * admin apagou o tempo de uma delas) não entra na conta: ela continua
 * clicável, só não é alcançada pela reprodução.
 *
 * Antes da primeira aba com tempo, vale a primeira. O vídeo começa em 0 e o
 * roteiro sempre abre a primeira aba em 0, mas um ajuste fino pode tê-la
 * empurrado para 0,4 s, e uma tela sem aba ativa nesse meio segundo piscaria.
 */
export function indiceDaAbaNoTempo(steps, tempo) {
  let ativa = 0;
  if (!Array.isArray(steps)) return ativa;
  steps.forEach((step, i) => {
    if (typeof step?.start_s === 'number' && step.start_s <= tempo + 0.05) ativa = i;
  });
  return ativa;
}

/**
 * Quanto da aba ativa já passou, de 0 a 1.
 *
 * O fim da aba é o começo da próxima com tempo; a última termina na duração do
 * vídeo. É o que enche o filete dourado debaixo da aba ativa: a pessoa vê o
 * capítulo andando sem precisar ler a barra de tempo do vídeo, que no telefone
 * é estreita demais para dizer onde um passo acaba.
 */
export function progressoDaAba(steps, indice, tempo, duracao) {
  const inicio = steps?.[indice]?.start_s;
  if (typeof inicio !== 'number') return 0;
  const proxima = steps.slice(indice + 1).find((s) => typeof s?.start_s === 'number');
  const fim = proxima ? proxima.start_s : duracao;
  if (typeof fim !== 'number' || fim <= inicio) return 0;
  return Math.min(1, Math.max(0, (tempo - inicio) / (fim - inicio)));
}

/**
 * O `?passo=N` da URL, já dentro dos limites.
 *
 * Fora do intervalo, ou lixo, vira a primeira aba: um link velho de quando o
 * tutorial tinha oito passos e hoje tem sete não pode abrir uma tela vazia.
 * Devolve o índice (base 0), que é o que a tela usa; a URL fala em base 1,
 * como a numeração que a pessoa lê nas abas.
 */
export function indiceDoPasso(valor, total) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n) || n < 1 || n > total) return 0;
  return n - 1;
}

/** O endereço de uma aba, igual ao que a busca e o "?" constroem. */
export function linkDaAba(pasta, funcionalidade, ordem) {
  const base = `/ajuda/${pasta}/${funcionalidade}`;
  return ordem && ordem > 1 ? `${base}?passo=${ordem}` : base;
}

/**
 * Duração para ler: "1:24", "0:15", "12:05".
 *
 * Arredondada para o segundo inteiro: é o tamanho do tutorial, e 84,2 s não diz
 * nada a mais do que "1:24" a quem decide se assiste agora.
 */
export function formatarDuracao(segundos) {
  if (typeof segundos !== 'number' || !Number.isFinite(segundos) || segundos < 0) return null;
  const total = Math.round(segundos);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}:${String(seg).padStart(2, '0')}`;
}

/** A mesma duração, por extenso, para o leitor de tela. */
export function duracaoPorExtenso(segundos) {
  if (typeof segundos !== 'number' || !Number.isFinite(segundos) || segundos < 0) return null;
  const total = Math.round(segundos);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  if (min === 0) return `${seg} segundos`;
  if (seg === 0) return min === 1 ? '1 minuto' : `${min} minutos`;
  return `${min} min e ${seg} s`;
}

/**
 * O tempo de início de uma aba, com décimo de segundo: "0:09,4".
 *
 * Aqui o décimo importa, ao contrário da duração: é o ajuste fino do admin, e
 * uma aba que cai meio segundo antes da fala corta a primeira palavra.
 */
export function formatarInicio(segundos) {
  if (typeof segundos !== 'number' || !Number.isFinite(segundos)) return null;
  const decimos = Math.round(segundos * 10);
  const min = Math.floor(decimos / 600);
  const resto = (decimos - min * 600) / 10;
  const [inteiro, frac] = resto.toFixed(1).split('.');
  return `${min}:${inteiro.padStart(2, '0')},${frac}`;
}

/**
 * Um tutorial sem vídeo, na lista de uma pasta.
 *
 * A lista não traz `video_url`: o que denuncia a falta do vídeo é a duração,
 * que só existe quando há vídeo (ver "Mudanças de 2026-10-10" em
 * tutoriais/API.md). É isso que tira a duração do cartão e põe o selo de
 * passo a passo em texto no lugar.
 */
export function cartaoSemVideo(feature) {
  return typeof feature?.duration_s !== 'number';
}

/** O selo do tutorial sem vídeo, o mesmo na pasta, no player e na prévia do admin. */
export const SELO_TEXTO = 'Passo a passo em texto';

/**
 * As duas coisas que o admin lê em cada funcionalidade, lado a lado.
 *
 * Publicação e vídeo são independentes desde 2026-10-10: o tutorial vale sem
 * vídeo (os passos em texto já ensinam), nasce publicado e só sai do ar quando
 * o admin despublica. Um selo único, como era o `state`, misturava as duas
 * perguntas e escondia o caso mais comum agora, "no ar e sem vídeo".
 *
 * A ordem do vídeo é a do filtro no topo da árvore, e é a ordem
 * do trabalho: o que falta gravar, o que está em dia e, por último, o
 * desatualizado, que é exceção e o que mais pede atenção, por isso o único
 * selo em vermelho.
 */
export const PUBLICACAO = [
  { id: 'published', label: 'Publicado', filtro: 'Publicados', variant: 'success' },
  { id: 'unpublished', label: 'Despublicado', filtro: 'Despublicados', variant: 'default' },
];

export const ESTADOS_DO_VIDEO = [
  { id: 'SEM_VIDEO', label: 'Sem vídeo', filtro: 'Sem vídeo', variant: 'default' },
  { id: 'EM_DIA', label: 'Vídeo em dia', filtro: 'Em dia', variant: 'success' },
  { id: 'DESATUALIZADO', label: 'Vídeo desatualizado', filtro: 'Desatualizado', variant: 'danger' },
];

/** `published` ou `unpublished`, as mesmas chaves de `published_counts`. */
export function publicacaoDe(feature) {
  return feature?.published ? 'published' : 'unpublished';
}

/**
 * O estado do vídeo de uma funcionalidade.
 *
 * Vem de `video_state`. Enquanto o backend da transição não estiver em todo
 * lugar, cai no `state` antigo: `SEM_VIDEO` e `DESATUALIZADO` são os mesmos
 * nos dois, e `PUBLICADO` ou `RASCUNHO` querem dizer vídeo em dia.
 */
export function estadoDoVideo(feature) {
  if (feature?.video_state) return feature.video_state;
  if (feature?.state === 'SEM_VIDEO' || feature?.state === 'DESATUALIZADO') return feature.state;
  return feature?.state ? 'EM_DIA' : 'SEM_VIDEO';
}

export function publicacaoPorId(id) {
  return PUBLICACAO.find((p) => p.id === id) ?? PUBLICACAO[1];
}

export function estadoDoVideoPorId(id) {
  return ESTADOS_DO_VIDEO.find((e) => e.id === id) ?? ESTADOS_DO_VIDEO[0];
}

/**
 * As contagens do topo da árvore.
 *
 * Vêm prontas da API (`total`, `published_counts`, `video_counts`). Se uma
 * delas faltar (servidor ainda na versão anterior), são contadas aqui, pela
 * própria árvore: o número no filtro nunca pode discordar da lista que ele
 * filtra.
 */
export function contagensDaArvore(arvore) {
  const features = (arvore?.folders ?? []).flatMap((f) => f.features ?? []);
  const contar = (chave, ids) =>
    Object.fromEntries(ids.map((id) => [id, features.filter((f) => chave(f) === id).length]));
  return {
    total: typeof arvore?.total === 'number' ? arvore.total : features.length,
    publicacao: arvore?.published_counts ?? contar(publicacaoDe, PUBLICACAO.map((p) => p.id)),
    video: arvore?.video_counts ?? contar(estadoDoVideo, ESTADOS_DO_VIDEO.map((e) => e.id)),
  };
}

/** O filtro de quem está fora do ar, ao lado dos filtros de vídeo. */
export const FILTRO_DESPUBLICADOS = 'DESPUBLICADOS';

/**
 * Os filtros da árvore do admin, numa fileira só e um de cada vez.
 *
 * O vídeo é o trabalho do dia a dia (o que falta gravar, o que ficou para
 * trás), por isso é ele que a fileira corta. A publicação é exceção: os
 * tutoriais nascem publicados, e "Despublicados" só aparece quando há algum.
 * Mostrar o chip com zero ocuparia a fileira com uma pergunta que quase nunca
 * tem resposta.
 */
export function opcoesDoFiltro(contagens) {
  const despublicados = contagens?.publicacao?.unpublished ?? 0;
  return [
    { id: 'TODOS', label: 'Todos', n: contagens?.total ?? 0 },
    ...ESTADOS_DO_VIDEO.map((e) => ({ id: e.id, label: e.filtro, n: contagens?.video?.[e.id] ?? 0, alerta: e.id === 'DESATUALIZADO' })),
    ...(despublicados > 0 ? [{ id: FILTRO_DESPUBLICADOS, label: 'Despublicados', n: despublicados }] : []),
  ];
}

/** A funcionalidade passa no filtro ligado (um id de `opcoesDoFiltro`). */
export function passaNoFiltro(feature, filtro) {
  if (!filtro || filtro === 'TODOS') return true;
  if (filtro === FILTRO_DESPUBLICADOS) return publicacaoDe(feature) === 'unpublished';
  return estadoDoVideo(feature) === filtro;
}

/** O texto do aviso de desatualizado, o mesmo que o contrato sugere. */
export const AVISO_DESATUALIZADO =
  'O roteiro deste tutorial mudou depois da gravação. Gere o vídeo de novo e envie o pacote.';

/**
 * Os quatro arquivos do pacote e o teto de cada um.
 *
 * Os tetos repetem os do servidor (ver "upload-urls" em tutoriais/API.md) e
 * existem aqui só para avisar antes de subir: o servidor recusa no commit de
 * qualquer jeito, mas aí os 8 MB do vídeo já atravessaram a rede. Na hora do
 * envio vale o `max_bytes` que a resposta do servidor traz, e não estes.
 */
export const ARQUIVOS_DO_PACOTE = [
  { nome: 'video.mp4', rotulo: 'Vídeo', maxBytes: 8 * 1024 * 1024 },
  { nome: 'legenda.vtt', rotulo: 'Legenda', maxBytes: 512 * 1024 },
  { nome: 'capa.jpg', rotulo: 'Capa', maxBytes: 300 * 1024 },
  { nome: 'passos.json', rotulo: 'Passos', maxBytes: 64 * 1024 },
];

/** Tamanho para ler: "312 KB", "7,9 MB". */
export function formatarTamanho(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * O nome do arquivo sem a pasta.
 *
 * Escolhida a pasta pelo seletor de diretório, o navegador entrega o nome puro
 * em `name` e o caminho em `webkitRelativePath`; escolhidos os arquivos soltos,
 * só o nome. Ficar com o nome resolve os dois.
 */
function nomeDoArquivo(file) {
  const nome = file?.name ?? '';
  return nome.split(/[\\/]/).pop();
}

/**
 * Separa os quatro arquivos do pacote do que mais vier junto.
 *
 * Pasta escolhida inteira pode trazer lixo do sistema (`.DS_Store`,
 * `Thumbs.db`) e, no caso da esteira de gravação, rascunhos com outros nomes.
 * O que importa são os quatro nomes do contrato. Se a pessoa escolher uma pasta
 * de pacotes em vez da pasta de um pacote, aparecem dois `passos.json`, e a
 * tela não tem como adivinhar qual era: é erro, com o motivo dito.
 */
export function separarArquivosDoPacote(lista) {
  const arquivos = {};
  const repetidos = new Set();
  Array.from(lista ?? []).forEach((file) => {
    const nome = nomeDoArquivo(file);
    if (!ARQUIVOS_DO_PACOTE.some((a) => a.nome === nome)) return;
    if (arquivos[nome]) repetidos.add(nome);
    arquivos[nome] = file;
  });

  const faltando = ARQUIVOS_DO_PACOTE.filter((a) => !arquivos[a.nome]).map((a) => a.nome);
  const grandes = ARQUIVOS_DO_PACOTE.filter((a) => arquivos[a.nome] && arquivos[a.nome].size > a.maxBytes);

  let erro = null;
  if (repetidos.size > 0) {
    erro = `Há mais de um ${[...repetidos][0]} na pasta escolhida. Escolha a pasta de um pacote só, a que tem os quatro arquivos dentro.`;
  } else if (faltando.length > 0) {
    erro =
      faltando.length === 1
        ? `Falta o arquivo ${faltando[0]} no pacote.`
        : `Faltam ${faltando.length} arquivos no pacote: ${faltando.join(', ')}.`;
  } else if (grandes.length > 0) {
    const g = grandes[0];
    erro = `O arquivo ${g.nome} tem ${formatarTamanho(arquivos[g.nome].size)}, acima do limite de ${formatarTamanho(g.maxBytes)}.`;
  }

  return { arquivos, erro, arquivoComErro: erro ? ([...repetidos][0] ?? faltando[0] ?? grandes[0]?.nome) : null };
}

/**
 * Confere o `passos.json` contra a funcionalidade aberta, antes de enviar.
 *
 * É a mesma conferência que o servidor faz no commit (passos 3 e 4 da lista do
 * contrato), feita aqui para avisar sem gastar 8 MB de upload. Quando o pacote
 * é de outra funcionalidade, a frase diz qual é a certa, e `destino` traz o que
 * a tela precisa para oferecer o link até ela: a árvore do admin, quando já
 * carregada, sabe o título e o id de cada funcionalidade.
 *
 * Não tenta validar o resto do formato. Tempos, ordem das abas e duração são
 * do servidor, que tem a regra completa; duplicar aqui só criaria uma segunda
 * versão dela para envelhecer.
 */
export function conferirPassos(texto, feature, arvore) {
  let passos;
  try {
    passos = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'O arquivo passos.json não é um JSON válido.' };
  }

  if (!passos || typeof passos !== 'object' || typeof passos.pasta !== 'string' || typeof passos.id !== 'string') {
    return { ok: false, erro: 'O passos.json está fora do formato: faltam os campos "pasta" e "id".' };
  }

  const pastaAberta = feature?.folder?.slug;
  const idAberto = feature?.slug;

  if (passos.pasta !== pastaAberta || passos.id !== idAberto) {
    const destino = acharNaArvore(arvore, passos.pasta, passos.id);
    const aqui = `"${feature?.title}" (${feature?.folder?.title})`;
    const erro = destino
      ? `Este pacote é da funcionalidade "${destino.titulo}", na pasta ${destino.pastaTitulo}, e não de ${aqui}. Abra "${destino.titulo}" e envie o pacote por lá.`
      : `Este pacote é de "${passos.pasta}/${passos.id}", que não existe na central. A funcionalidade escolhida é "${pastaAberta}/${idAberto}".`;
    return { ok: false, erro, destino };
  }

  // Os tetos do formato, os mesmos do passo 2 da conferência do servidor. Ficam
  // aqui porque custam nada e evitam subir oito megas para ouvir que o
  // `passos.json` tem 51 abas.
  const tetos = tetosDoPassos(passos);
  if (tetos) return { ok: false, erro: tetos };

  const abasNoPacote = Array.isArray(passos.abas) ? passos.abas.length : 0;
  const abasAqui = feature?.steps?.length ?? 0;
  if (abasNoPacote !== abasAqui) {
    return {
      ok: false,
      erro: `O pacote tem ${abasNoPacote} ${abasNoPacote === 1 ? 'aba' : 'abas'} e "${feature?.title}" tem ${abasAqui}. O roteiro mudou depois da gravação? Gere o pacote de novo.`,
    };
  }

  return { ok: true, passos };
}

/** O primeiro teto do formato que o `passos.json` passa, em uma frase; `null` se nenhum. */
function tetosDoPassos(passos) {
  const d = passos.duracao_s;
  if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0 || d > 600) {
    return 'O passos.json está fora do formato: a duração precisa ser um número de segundos entre 0 e 600.';
  }
  if (!Array.isArray(passos.abas) || passos.abas.length === 0) {
    return 'O passos.json está fora do formato: não há nenhuma aba.';
  }
  if (passos.abas.length > 50) return 'O passos.json tem mais de 50 abas, acima do limite.';
  for (const [i, aba] of passos.abas.entries()) {
    const n = i + 1;
    if (typeof aba?.titulo !== 'string' || aba.titulo.length > 120) {
      return `O título da aba ${n} no passos.json está vazio ou passa de 120 caracteres.`;
    }
    if (typeof aba?.texto !== 'string' || aba.texto.length > 2000) {
      return `O texto da aba ${n} no passos.json está vazio ou passa de 2000 caracteres.`;
    }
    if (typeof aba?.inicio_s !== 'number' || !Number.isFinite(aba.inicio_s)) {
      return `O início da aba ${n} no passos.json precisa ser um número de segundos.`;
    }
  }
  return null;
}

function acharNaArvore(arvore, pasta, id) {
  const folder = arvore?.folders?.find((f) => f.slug === pasta);
  const feature = folder?.features?.find((f) => f.slug === id);
  if (!feature) return null;
  return { id: feature.id, titulo: feature.title, pastaTitulo: folder.title };
}

/**
 * Move um item uma casa para cima ou para baixo e devolve a lista de ids.
 *
 * As rotas de ordem pedem a lista inteira, cada id uma vez; mover é trocar dois
 * vizinhos e mandar tudo. Nas pontas, devolve `null`: não há o que mandar.
 */
export function moverNaOrdem(itens, indice, direcao) {
  const alvo = indice + direcao;
  if (!Array.isArray(itens) || alvo < 0 || alvo >= itens.length) return null;
  const ids = itens.map((i) => i.id);
  [ids[indice], ids[alvo]] = [ids[alvo], ids[indice]];
  return ids;
}
