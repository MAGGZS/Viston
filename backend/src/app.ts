import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import buildingRoutes from './routes/building.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import inspectionRoutes from './routes/inspection.routes';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: config.isProduction
      ? config.cors.frontendUrl
      : [config.cors.frontendUrl, 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.use('/buildings', buildingRoutes);
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/', inspectionRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } });
});

// ── Error handler (deve ser o último middleware) ───────────────────────────────
app.use(errorHandler);

export default app;
