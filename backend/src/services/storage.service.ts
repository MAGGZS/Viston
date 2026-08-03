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

  async uploadPhoto(
    reportId: string,
    floorId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<string> {
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB

    if (!ALLOWED_TYPES.includes(mimeType)) {
      throw new Error('Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.');
    }
    if (buffer.length > MAX_SIZE) {
      throw new Error('Arquivo muito grande. Máximo 10MB.');
    }

    const path = `${reportId}/${floorId}/${Date.now()}_${fileName}`;
    const bucket = config.supabase.bucketPhotos;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType: mimeType, upsert: false });

    if (error) throw new Error(`Falha no upload da foto: ${error.message}`);

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },
};
