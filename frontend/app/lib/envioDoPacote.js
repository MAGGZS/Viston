/**
 * O envio dos arquivos do pacote de vídeo, direto para o Storage.
 *
 * Os arquivos não passam pelo backend: ele assina uma URL de upload por arquivo
 * (ver "Envio do vídeo" em tutoriais/API.md) e a tela faz o `PUT` de cada um.
 * Oito megas atravessando o Express ocupariam o servidor gratuito do Render
 * pelo tempo inteiro do upload, e é para isso que a URL assinada existe.
 *
 * `XMLHttpRequest`, e não `fetch`, por um motivo só: `upload.onprogress`. O
 * `fetch` não informa quanto do corpo já saiu, e sem isso a barra de progresso
 * ficaria parada em zero até o vídeo inteiro chegar, que num 4G fraco são
 * dezenas de segundos de uma tela que parece travada.
 *
 * Sem `Authorization`: a assinatura está na própria URL, e mandar o token da
 * API para o Supabase seria entregar a credencial a quem não precisa dela.
 */

import { formatarTamanho } from '@/app/lib/ajuda';

/**
 * O `PUT` de um arquivo, com o progresso dele.
 *
 * `cache-control` de um ano é a recomendação do contrato: o caminho definitivo é
 * único por envio e nunca é sobrescrito, então o navegador pode guardar o
 * arquivo sem risco de mostrar vídeo velho. `x-upsert: false` impede que um
 * segundo envio para o mesmo caminho temporário passe por cima do primeiro.
 *
 * Devolve uma promessa e uma função de cancelar, porque quem sai da tela no
 * meio do envio não pode deixar oito megas subindo para um diretório que
 * ninguém vai confirmar.
 */
export function enviarArquivo({ url, file, contentType, onProgresso }) {
  const xhr = new XMLHttpRequest();

  const promessa = new Promise((resolve, reject) => {
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('cache-control', 'max-age=31536000');
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgresso?.(e.loaded, e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgresso?.(file.size, file.size);
        resolve();
        return;
      }
      // O Supabase responde `{ statusCode, error, message }`. A mensagem dele é
      // técnica ("The resource already exists"), então ela vai junto, mas
      // depois da frase que diz o que fazer.
      let detalhe = '';
      try {
        detalhe = JSON.parse(xhr.responseText)?.message ?? '';
      } catch {
        detalhe = '';
      }
      reject(new ErroDeEnvio(file.name, xhr.status, detalhe));
    };

    xhr.onerror = () => reject(new ErroDeEnvio(file.name, 0, ''));
    xhr.onabort = () => reject(new ErroDeEnvio(file.name, -1, ''));

    xhr.send(file);
  });

  return { promessa, cancelar: () => xhr.abort() };
}

/**
 * Falha do envio de um arquivo, com o nome dele para a tela marcar.
 *
 * `mensagem` substitui a frase montada a partir do status, para a falha que
 * nem chega a sair (arquivo acima do limite).
 */
export class ErroDeEnvio extends Error {
  constructor(arquivo, status, detalhe, mensagem) {
    const motivo =
      status === -1
        ? 'O envio foi cancelado.'
        : status === 0
          ? 'A conexão caiu no meio do envio.'
          : `O Storage recusou o arquivo (${status}${detalhe ? `: ${detalhe}` : ''}).`;
    super(mensagem ?? `Não deu para enviar ${arquivo}. ${motivo} Tente de novo: o envio recomeça do zero com endereços novos.`);
    this.name = 'ErroDeEnvio';
    this.arquivo = arquivo;
    this.status = status;
  }
}

/**
 * Envia os quatro arquivos e informa o progresso somado.
 *
 * Um de cada vez, e não os quatro juntos: o vídeo é 95% do peso, e em paralelo
 * os três pequenos só disputariam a mesma banda sem terminar antes. Em série, a
 * barra anda de forma contínua e, se algo falha, os arquivos seguintes nem
 * chegam a sair.
 *
 * `onProgresso` recebe a fração total, de 0 a 1, e o nome do arquivo da vez.
 */
export function enviarPacote({ urls, arquivos, onProgresso }) {
  const nomes = Object.keys(urls.files);
  const total = nomes.reduce((soma, nome) => soma + (arquivos[nome]?.size ?? 0), 0) || 1;
  let enviados = 0;
  let atual = null;
  let cancelado = false;

  const promessa = (async () => {
    for (const nome of nomes) {
      if (cancelado) throw new ErroDeEnvio(nome, -1, '');
      const destino = urls.files[nome];
      const file = arquivos[nome];
      if (file.size > destino.max_bytes) {
        throw new ErroDeEnvio(nome, 0, '', `O arquivo ${nome} passa do limite de ${formatarTamanho(destino.max_bytes)}.`);
      }
      atual = enviarArquivo({
        url: destino.upload_url,
        file,
        contentType: destino.content_type,
        onProgresso: (carregado) => onProgresso?.((enviados + carregado) / total, nome),
      });
      await atual.promessa;
      enviados += file.size;
      onProgresso?.(enviados / total, nome);
    }
  })();

  return {
    promessa,
    cancelar: () => {
      cancelado = true;
      atual?.cancelar();
    },
  };
}
