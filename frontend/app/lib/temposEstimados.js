/**
 * A marca de "tempos estimados" de um vídeo enviado sozinho.
 *
 * Quando o admin envia só o `video.mp4`, a tela monta o `passos.json` e a
 * legenda com tempos estimados (ver app/lib/pacoteDoVideo.js), e o aviso para
 * conferi-los precisa sobreviver à releitura da funcionalidade e a um F5.
 *
 * Guardada no navegador, e não no servidor: o contrato do pacote não tem campo
 * para isso, e a pedido do proprietário o envio do mp4 sozinho não muda o
 * backend. A marca leva o `upload_id` do envio, que aparece no caminho do vídeo
 * (e portanto na URL assinada); assim ela some sozinha quando outro pacote
 * substitui o vídeo. O custo é que outro navegador não vê o aviso.
 */
const chave = (featureId) => `viston:ajuda:tempos-estimados:${featureId}`;

export function marcarTemposEstimados(featureId, uploadId) {
  try {
    localStorage.setItem(chave(featureId), String(uploadId));
  } catch {
    // Navegação privada ou armazenamento cheio: o aviso só não persiste.
  }
}

export function limparTemposEstimados(featureId) {
  try {
    localStorage.removeItem(chave(featureId));
  } catch {
    // Idem.
  }
}

/** O vídeo atual desta funcionalidade foi enviado sozinho, com tempos estimados? */
export function temposEstimados(feature) {
  if (!feature?.id || !feature?.video_url) return false;
  let uploadId = null;
  try {
    uploadId = localStorage.getItem(chave(feature.id));
  } catch {
    return false;
  }
  return Boolean(uploadId) && feature.video_url.includes(`/${uploadId}/`);
}
