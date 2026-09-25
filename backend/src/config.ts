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
  trustProxy: process.env.TRUST_PROXY !== undefined ? parseInt(process.env.TRUST_PROXY, 10) || false : 1,

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

  /**
   * O envio dos códigos por e-mail, pela API da Brevo.
   *
   * Obrigatórias sempre, e não só em produção. A máquina de quem desenvolve
   * roda contra os mesmos dados da nuvem (ver o comentário do arquivo de
   * ambiente), e um caminho mais frouxo aqui é um caminho que ninguém exercita
   * antes do deploy: o defeito aparece na primeira pessoa que se cadastra em
   * produção, não em quem escreveu o código.
   *
   * O preço é o backend não subir sem elas. É o preço certo — o mesmo que
   * `JWT_SECRET` cobra desde sempre, e pela mesma razão.
   *
   * `EMAIL_FROM` é só o endereço, e precisa ser um remetente verificado no
   * painel da Brevo. Verificar lá é um clique num e-mail de confirmação; não
   * exige domínio próprio, que é o que este projeto não tem.
   */
  email: {
    apiKey: required('BREVO_API_KEY'),
    from: required('EMAIL_FROM'),
    // O nome que aparece na caixa de entrada, ao lado do endereço.
    fromName: process.env.EMAIL_FROM_NAME || 'Viston',
  },

  /**
   * O Stripe, e por que nada aqui é obrigatório.
   *
   * `required()` derrubaria o serviço na subida enquanto a conta do Stripe não
   * existisse — e ela não existe ainda. Sem chave, as rotas de cobrança
   * respondem 503 e o resto do produto segue inteiro; é o que permite este
   * código ir para produção antes de a loja abrir.
   *
   * O que falta para ligar: as quatro chaves de preço no painel do Stripe, a
   * secreta da conta e o segredo do endpoint de webhook. Todas entram pelo
   * painel do Render (`sync: false`), como a da Brevo — segredo nenhum mora
   * neste repositório.
   */
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    prices: {
      ESSENCIAL: {
        MONTHLY: process.env.STRIPE_PRICE_ESSENCIAL_MONTHLY || '',
        YEARLY: process.env.STRIPE_PRICE_ESSENCIAL_YEARLY || '',
      },
      PRO: {
        MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
        YEARLY: process.env.STRIPE_PRICE_PRO_YEARLY || '',
      },
      /** O prédio extra, cobrado por unidade em cima do plano. */
      EXTRA_BUILDING: {
        MONTHLY: process.env.STRIPE_PRICE_EXTRA_BUILDING_MONTHLY || '',
        YEARLY: process.env.STRIPE_PRICE_EXTRA_BUILDING_YEARLY || '',
      },
    },
  },

  /**
   * O segredo do ciclo diário de planos.
   *
   * A rota que o dispara não tem sessão: quem a chama é um agendador, não uma
   * pessoa. A credencial dele é este valor, comparado em tempo constante — e,
   * sem ele configurado, a rota responde 404, como se não existisse. Vazio é o
   * estado seguro: melhor o ciclo não rodar do que rodar para quem descobriu a
   * URL.
   */
  jobSecret: process.env.JOB_SECRET || '',

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
