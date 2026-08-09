import { supabase } from '../lib/supabase';
import { config } from '../config';

export const storageService = {
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

};
