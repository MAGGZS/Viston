import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate';
import { ForbiddenError } from '../utils/errors';
import { userRepository } from '../repositories/user.repository';

/**
 * Guarda de papel de sistema. Hoje o único é ADMIN.
 *
 * O papel vem do token, mas não para por ali: o token dura quinze minutos, e
 * um ADMIN rebaixado ou desativado seguiria com o painel inteiro aberto até ele
 * expirar. Aqui o banco confirma, a cada requisição, que a conta ainda é ADMIN
 * e está ativa. O custo é uma consulta, e só nas rotas do painel do admin.
 */
export function authorize(...roles: string[]) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Acesso restrito a: ${roles.join(', ')}`);
    }

    if (req.user.role === 'ADMIN') {
      const account = req.user.kind === 'USER' ? await userRepository.findById(req.user.id) : null;
      if (!account || account.role !== 'ADMIN' || account.status === 'DELETED') {
        throw new ForbiddenError(`Acesso restrito a: ${roles.join(', ')}`);
      }
    }

    next();
  };
}
