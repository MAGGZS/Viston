import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Valida a parte informada da requisição contra o schema.
 *
 * O resultado do parse substitui o valor original quando o alvo é o corpo:
 * o zod remove chaves desconhecidas, então o controller nunca recebe campos
 * fora do contrato (evita mass assignment, ex.: `role` no cadastro público).
 */
export function validate(schema: ZodSchema, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.parse(req[target]);
    if (target === 'body') req.body = parsed;
    next();
  };
}
