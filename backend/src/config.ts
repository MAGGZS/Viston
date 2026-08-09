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
    bucketExcel: process.env.SUPABASE_BUCKET_EXCEL || 'viston-excel',
  },

  jwt: {
    secret: required('JWT_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  cors: {
    /**
     * FRONTEND_URL aceita uma ou várias origens separadas por vírgula.
     * Ex: "https://viston.vercel.app,http://localhost:3001"
     * Permite manter a nuvem no ar enquanto se desenvolve localmente.
     */
    origins: (process.env.FRONTEND_URL || 'http://localhost:3001')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url) => (url.startsWith('http') ? url : `https://${url}`)),
  },
};
