import { supabase } from '../lib/supabase';
import { config } from '../config';
import { logger } from '../lib/logger';

/**
 * Validade da URL assinada da planilha.
 *
 * Curta de propósito: ela é gerada no clique de quem já provou ter vínculo com
 * o prédio, e o download começa em seguida. Cinco minutos cobrem rede ruim e
 * dedo lento; mais que isso é transformar de novo o link numa credencial que
 * viaja por mensagem.
 */
const EXCEL_URL_TTL_SECONDS = 300;

/**
 * Todo objeto de planilha se chama `report_...` — inclusive a do dia, que passa
 * por `uploadExcel` com o dia no lugar do id.
 */
const EXCEL_PREFIX = 'report_';

/** Nada de barra, `..` ou nome vazio: o caminho é montado aqui, nunca vem do cliente. */
function assertSafeExcelPath(path: string): void {
  if (!path || path.includes('/') || path.includes('\\') || path.includes('..')) {
    throw new Error(`Caminho inválido no storage: "${path}"`);
  }
  if (!path.startsWith(EXCEL_PREFIX)) {
    throw new Error(`Caminho fora do esperado no storage: "${path}"`);
  }
}

export const storageService = {
  /**
   * Sobe a planilha do dia de um prédio e devolve o caminho dela no bucket.
   *
   * O nome carrega prédio e dia porque o arquivo é do dia — mas também o
   * instante do envio: a planilha é refeita a cada vistoria nova daquela data, e
   * reusar o nome deixaria quem já baixou o link vendo a versão antiga em cache.
   */
  async uploadDayExcel(buildingId: string, date: Date, buffer: Buffer): Promise<string> {
    const day = new Date(date).toISOString().slice(0, 10);
    return this.uploadExcel(`day_${buildingId}_${day}`, buffer);
  },

  async uploadExcel(reportId: string, buffer: Buffer): Promise<string> {
    const fileName = `report_${reportId}_${Date.now()}.xlsx`;
    const bucket = config.supabase.bucketExcel;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });

    if (error) throw new Error(`Falha no upload do Excel: ${error.message}`);

    // O caminho, e não a URL: o bucket é privado, e quem baixa passa por
    // `GET /inspections/:id/excel`, que confere o vínculo antes de assinar.
    return fileName;
  },

  /**
   * URL de download da planilha, válida por poucos minutos.
   *
   * `download` faz o Supabase devolver `Content-Disposition: attachment` com o
   * nome legível — sem ele o navegador abriria uma aba com o nome interno do
   * objeto, que é `day_<uuid>_<data>_<timestamp>.xlsx`.
   */
  async createExcelSignedUrl(path: string, downloadName?: string): Promise<string> {
    assertSafeExcelPath(path);

    const { data, error } = await supabase.storage
      .from(config.supabase.bucketExcel)
      .createSignedUrl(path, EXCEL_URL_TTL_SECONDS, downloadName ? { download: downloadName } : {});

    if (error || !data) {
      throw new Error(`Falha ao assinar a URL do Excel: ${error?.message ?? 'sem resposta'}`);
    }

    return data.signedUrl;
  },

  /** Apaga a planilha do bucket pelo caminho gravado no relatório. */
  async removeExcel(path: string): Promise<void> {
    if (!path) return;
    assertSafeExcelPath(path);

    const { error } = await supabase.storage.from(config.supabase.bucketExcel).remove([path]);
    if (error) throw new Error(`Falha ao remover o Excel: ${error.message}`);
  },

  /**
   * Sobe a foto de perfil já recortada pelo app.
   *
   * Este bucket segue público, e de propósito: a foto aparece em `<img>` em
   * dezenas de lugares (lista de membros, autor da vistoria, cabeçalho), e URL
   * assinada expira — a tela mostraria imagem quebrada minutos depois de
   * carregada, ou exigiria reassinar a cada listagem. O nome do objeto é
   * imprevisível e a foto não é o relatório: o que precisava sair de público
   * era a planilha.
   *
   * O nome carrega o instante do envio porque a URL antiga fica em cache no
   * navegador: reusar o mesmo nome deixaria a foto trocada e a tela mostrando a
   * anterior por horas.
   */
  async uploadAvatar(userId: string, buffer: Buffer, contentType: string): Promise<string> {
    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `avatar_${userId}_${Date.now()}.${extension}`;
    const bucket = config.supabase.bucketPhotos;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, buffer, { contentType, upsert: true });

    if (error) throw new Error(`Falha no upload da foto: ${error.message}`);

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  },

  /**
   * Apaga a foto do bucket a partir da URL pública.
   *
   * O nome sai do último segmento do caminho da URL, e não do texto inteiro:
   * `split('/')` cru pegaria querystring e fragmento junto. O prefixo é conferido
   * porque este método é o único que apaga em nome de uma URL — e a URL, um dia,
   * pode vir de lugar menos confiável que a própria coluna.
   *
   * Nunca derruba a operação de quem chamou: trocar a foto tem de funcionar
   * mesmo que o arquivo velho já tenha sumido do bucket.
   */
  async removeAvatar(avatarUrl: string): Promise<void> {
    let fileName: string;
    try {
      fileName = decodeURIComponent(new URL(avatarUrl).pathname.split('/').pop() ?? '');
    } catch {
      return;
    }

    if (!fileName || !fileName.startsWith('avatar_') || fileName.includes('..')) return;

    const { error } = await supabase.storage.from(config.supabase.bucketPhotos).remove([fileName]);
    if (error) logger.error({ err: error }, '[Avatar] Falha ao remover foto antiga');
  },

  /**
   * Sobe uma foto da linha do tempo da manutenção.
   *
   * Mesmo bucket público do avatar, e pela mesma razão escrita ali em cima: a
   * foto aparece em `<img>` na página do chamado e nas duas caixas de leitura,
   * e URL assinada expiraria — a tela mostraria imagem quebrada minutos depois.
   * O que precisava sair de público era a planilha, que é o relatório.
   *
   * O prefixo distingue o que é foto de manutenção do que é avatar: é por ele
   * que `removeTicketPhoto` sabe que pode apagar, e é o que impede uma URL de
   * avatar de entrar por aquela porta.
   */
  async uploadTicketPhoto(ticketId: string, buffer: Buffer, contentType: string): Promise<string> {
    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    // O sufixo aleatório separa duas fotos enviadas no mesmo milissegundo — o
    // que acontece quando a atualização vai com quatro de uma vez.
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const fileName = `ticket_${ticketId}_${unique}.${extension}`;
    const bucket = config.supabase.bucketPhotos;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, buffer, { contentType, upsert: false });

    if (error) throw new Error(`Falha no upload da foto: ${error.message}`);

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  },

  /**
   * Apaga uma foto da linha do tempo, a partir da URL pública.
   *
   * Gêmeo de `removeAvatar`, com o prefixo que é dela — e, como ele, nunca
   * derruba quem chamou: apagar a atualização tem de funcionar mesmo que o
   * arquivo já tenha sumido do bucket.
   */
  async removeTicketPhoto(photoUrl: string): Promise<void> {
    let fileName: string;
    try {
      fileName = decodeURIComponent(new URL(photoUrl).pathname.split('/').pop() ?? '');
    } catch {
      return;
    }

    if (!fileName || !fileName.startsWith('ticket_') || fileName.includes('..')) return;

    const { error } = await supabase.storage.from(config.supabase.bucketPhotos).remove([fileName]);
    if (error) logger.error({ err: error }, '[Chamado] Falha ao remover foto da atualização');
  },
};
