import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload inválido',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Registro não encontrado' },
      });
      return;
    }

    // Corrida entre duas gravações do mesmo valor único (ex.: dois cadastros
    // com o mesmo e-mail no mesmo instante): é conflito, não erro do servidor.
    if (err.code === 'P2002') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'Já existe um registro com esses dados' },
      });
      return;
    }

    if (err.code === 'P2003') {
      res.status(409).json({
        error: {
          code: 'FOREIGN_KEY_CONSTRAINT',
          message: 'Registro possui vínculos que impedem a exclusão',
        },
      });
      return;
    }
  }

  console.error('[Unhandled Error]', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
  });
}
