import { supabase } from '../lib/supabase';
import { config } from '../config';

export const storageService = {
  /**
   * Sobe a planilha do dia de um prédio.
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

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  },

  /** Apaga a planilha do bucket a partir da URL pública gravada no relatório. */
  async removeExcel(excelUrl: string): Promise<void> {
    const fileName = decodeURIComponent(excelUrl.split('/').pop() ?? '');
    if (!fileName) return;

    const { error } = await supabase.storage.from(config.supabase.bucketExcel).remove([fileName]);
    if (error) throw new Error(`Falha ao remover o Excel: ${error.message}`);
  },

  /**
   * Sobe a foto de perfil já recortada pelo app.
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
   * Nunca derruba a operação de quem chamou: trocar a foto tem de funcionar
   * mesmo que o arquivo velho já tenha sumido do bucket.
   */
  async removeAvatar(avatarUrl: string): Promise<void> {
    const fileName = decodeURIComponent(avatarUrl.split('/').pop() ?? '');
    if (!fileName || !fileName.startsWith('avatar_')) return;

    const { error } = await supabase.storage.from(config.supabase.bucketPhotos).remove([fileName]);
    if (error) console.error('[Avatar] Falha ao remover foto antiga:', error.message);
  },
};
