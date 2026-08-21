import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { prisma } from './lib/prisma';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import buildingRoutes from './routes/building.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import managerRoutes from './routes/manager.routes';
import feedbackRoutes from './routes/feedback.routes';
import inspectionRoutes from './routes/inspection.routes';
import ticketRoutes from './routes/ticket.routes';
import { errorHandler } from './middlewares/errorHandler';
import { generalLimiter } from './middlewares/rateLimit';

const app = express();

// Render fica atrás de proxy: sem isso o rate limit enxerga um IP só para todos.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ── Cabeçalhos de segurança ───────────────────────────────────────────────────
// A API só devolve JSON: nada para embutir, nada para carregar de outra origem.
app.use(
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: config.isProduction
      ? config.cors.origins
      : [...config.cors.origins, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
// Teto da vistoria: 20 andares × 20 ocorrências × 2000 caracteres cabe em 2mb.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Log de requisição ─────────────────────────────────────────────────────────
//
// Cada requisição ganha um id e uma linha de entrada e saída. É o id que liga
// um 500 ao que veio antes dele na mesma chamada — antes, o painel do Render
// tinha só `console.error` soltos, sem nada que dissesse de qual requisição
// cada um era.
app.use(
  pinoHttp({
    logger,
    // O health check é chamado a cada dez minutos pelo keep-alive: no nível
    // normal ele afogaria o resto.
    autoLogging: { ignore: (req) => req.url === '/health' },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  })
);

// ── Rate limiting geral (os limites finos ficam nas rotas) ────────────────────
app.use(generalLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
//
// Dois, e a diferença importa. `/health` é liveness: o processo está de pé e
// respondendo — é o que o Render usa para decidir se reinicia o serviço, e
// checar o banco aqui faria uma queda do Postgres virar um ciclo de reinícios
// que não conserta nada.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// `/health/ready` é readiness: dá para atender de verdade? Sem isto, "a API
// está no ar" e "a API funciona" eram a mesma resposta, e um banco fora do ar
// só aparecia como 500 na cara do usuário.
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, '[Health] Banco indisponível');
    res.status(503).json({ status: 'degraded', db: 'down', timestamp: new Date().toISOString() });
  }
});

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.use('/buildings', buildingRoutes);
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/managers', managerRoutes);
app.use('/feedbacks', feedbackRoutes);
app.use('/', inspectionRoutes);
// Os chamados moram em dois caminhos — a fila é do prédio, a ação é da
// ocorrência — e por isso a rota entra na raiz, como a de vistorias.
app.use('/', ticketRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } });
});

// ── Error handler (deve ser o último middleware) ───────────────────────────────
app.use(errorHandler);

export default app;
