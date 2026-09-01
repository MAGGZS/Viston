'use client';

/**
 * Prepara uma foto do aparelho para viajar como data URL.
 *
 * A foto de um telefone atual sai com 3 a 8 MB e 4000px de largura. A tela a
 * mostra em 72px de miniatura e, no máximo, na largura da janela — mandar o
 * original seria subir dez vezes o necessário por uma imagem que ninguém vai
 * ver em tamanho nenhum, num aparelho que muitas vezes está no subsolo de um
 * prédio com meia barra de sinal.
 *
 * Reduzir a maior aresta a 1600px mantém a foto legível ampliada e a deixa
 * abaixo do teto do servidor. Sem recorte: aqui a foto é prova do que foi
 * feito, e cortar em quadrado tiraria justamente a borda que mostra onde
 * aquilo estava — o contrário do avatar, que é retrato e por isso é quadrado
 * (ver `AvatarEditorModal`).
 *
 * JPEG sempre, mesmo para PNG de entrada: são fotos, e PNG de foto sai três
 * vezes maior sem nenhum ganho.
 */
export const MAX_ARESTA = 1600;
export const QUALIDADE = 0.85;

/** Teto do arquivo que se aceita abrir. Acima disto nem vale decodificar. */
export const MAX_ARQUIVO_BYTES = 12 * 1024 * 1024;

export function comprimirImagem(file, { maxEdge = MAX_ARESTA, quality = QUALIDADE } = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Escolha um arquivo de imagem'));
      return;
    }
    if (file.size > MAX_ARQUIVO_BYTES) {
      reject(new Error('Imagem muito pesada. O limite é 12 MB.'));
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      // Revoga assim que os pixels já estão no `<canvas>`: sem isto cada foto
      // escolhida fica na memória da aba até ela fechar.
      URL.revokeObjectURL(url);

      const maior = Math.max(image.naturalWidth, image.naturalHeight);
      // Só encolhe. Foto pequena esticada até 1600 ganharia peso e nenhum pixel.
      const escala = maior > maxEdge ? maxEdge / maior : 1;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * escala);
      canvas.height = Math.round(image.naturalHeight * escala);

      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível abrir essa imagem'));
    };

    image.src = url;
  });
}
