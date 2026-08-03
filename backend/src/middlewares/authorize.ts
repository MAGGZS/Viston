import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate';
import { ForbiddenError } from '../utils/errors';

export function authorize(...roles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Acesso restrito a: ${roles.join(', ')}`);
    }
    next();
  };
}
