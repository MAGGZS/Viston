import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import buildingRoutes from './routes/building.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import managerRoutes from './routes/manager.routes';
import feedbackRoutes from './routes/feedback.routes';
import inspectionRoutes from './routes/inspection.routes';
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

// ── Rate limiting geral (os limites finos ficam nas rotas) ────────────────────
app.use(generalLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.use('/buildings', buildingRoutes);
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/managers', managerRoutes);
app.use('/feedbacks', feedbackRoutes);
app.use('/', inspectionRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } });
});

// ── Error handler (deve ser o último middleware) ───────────────────────────────
app.use(errorHandler);

export default app;
