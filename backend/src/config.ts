import dotenv from 'dotenv';
import path from 'path';

/**
 * `.env.local` em desenvolvimento, `.env` em produção.
 *
 * A separação é o que permite rodar na máquina apontando para os mesmos dados da
 * nuvem, sem que o arquivo local se confunda com o de produção. Em produção o
 * Render injeta as variáveis direto no processo e nenhum arquivo existe — o
 * dotenv apenas não encontra nada e segue.
 *
 * O que não volta é o fallback para `.env.example` que existia junto com isto:
 * o exemplo é versionado e vem preenchido, então ele fazia o `required()` abaixo
 * nunca disparar. Faltando `JWT_SECRET`, o servidor subia calado assinando token
 * com `your-jwt-secret-change-in-production` — a falha que a checagem existe para
 * impedir, escondida pela rede de segurança.
 */
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Variável de ambiente obrigatória não definida: ${key}`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,

  database: {
    url: required('DATABASE_URL'),
  },

  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    bucketExcel: process.env.SUPABASE_BUCKET_EXCEL || 'viston-excel',
    bucketPhotos: process.env.SUPABASE_BUCKET_PHOTOS || 'viston-photos',
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
     *
     * Obrigatória em produção. Sem ela, o fallback de desenvolvimento entrava
     * calado e o CORS barrava o app inteiro — de fora, isso parece o servidor
     * fora do ar, e o diagnóstico começa no lugar errado. Melhor não subir.
     */
    origins: (isProduction ? required('FRONTEND_URL') : process.env.FRONTEND_URL || 'http://localhost:3001')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url) => (url.startsWith('http') ? url : `https://${url}`)),
  },
};
