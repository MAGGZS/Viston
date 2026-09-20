import { timingSafeEqual } from 'node:crypto';
import { Request, Response, NextFunction, Router } from 'express';
import { config } from '../config';
import { planJobService } from '../services/planJob.service';
import { ok } from '../utils/response';
import { NotFoundError } from '../utils/errors';
import { logger } from '../lib/logger';

/**
 * O gatilho do ciclo diário.
 *
 * Sem sessão, porque quem chama é um agendador e não uma pessoa: a credencial
 * dele é o `JOB_SECRET`, no cabeçalho, comparado em tempo constante.
 *
 * Sem segredo configurado, ou com segredo errado, a resposta é 404 — e não 401.
 * Para quem sonda, 401 confirma que a rota existe e convida a insistir; 404 diz
 * o mesmo que qualquer caminho inventado.
 *
 * O agendador é um workflow do GitHub Actions (ver `.github/workflows/
 * planos.yml`), pela mesma razão do keep-alive: o Render cobra por Cron Job e
 * minutos de Actions em repositório público não são cobrados.
 */
const router = Router();

function requireJobSecret(req: Request, _res: Response, next: NextFunction): void {
  const enviado = req.headers['x-job-secret'];
  const esperado = config.jobSecret;

  if (!esperado || typeof enviado !== 'string' || enviado.length !== esperado.length) {
    throw new NotFoundError('Rota');
  }
  if (!timingSafeEqual(Buffer.from(enviado), Buffer.from(esperado))) {
    throw new NotFoundError('Rota');
  }

  next();
}

router.post('/jobs/planos', requireJobSecret, async (_req: Request, res: Response) => {
  const inicio = Date.now();
  const resultado = await planJobService.runDaily();
  logger.info({ ...resultado, ms: Date.now() - inicio }, '[Planos] Ciclo disparado pelo agendador');
  ok(res, resultado);
});

export default router;
