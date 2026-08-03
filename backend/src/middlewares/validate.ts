import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    schema.parse(req[target]);
    next();
  };
}
