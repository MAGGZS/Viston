import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Variável de ambiente obrigatória não definida: ${key}`);
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  database: {
    url: required('DATABASE_URL'),
  },

  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    bucketPhotos: process.env.SUPABASE_BUCKET_PHOTOS || 'viston-photos',
    bucketExcel: process.env.SUPABASE_BUCKET_EXCEL || 'viston-excel',
  },

  jwt: {
    secret: required('JWT_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  googleForms: {
    url: process.env.GOOGLE_FORM_URL || '',
    fields: {
      itemName: process.env.GOOGLE_FORM_FIELD_ITEM_NAME || 'entry.111111',
      quantity: process.env.GOOGLE_FORM_FIELD_QUANTITY || 'entry.222222',
      isMarked: process.env.GOOGLE_FORM_FIELD_IS_MARKED || 'entry.333333',
      status: process.env.GOOGLE_FORM_FIELD_STATUS || 'entry.444444',
      observation: process.env.GOOGLE_FORM_FIELD_OBSERVATION || 'entry.555555',
    },
  },

  cors: {
    frontendUrl: (() => {
      const url = process.env.FRONTEND_URL || 'http://localhost:5173';
      return url.startsWith('http') ? url : `https://${url}`;
    })(),
  },
};
