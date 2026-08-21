import { Request, Response, NextFunction } from 'express';
import { AccountKind, verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';

/**
 * Quem está fazendo a requisição.
 *
 * `kind` diz em que tabela a conta mora, e é o que separa as duas identidades do
 * sistema: gestor e usuário são contas de tipos diferentes, não a mesma conta
 * com marcas diferentes.
 *
 * `role` só faz sentido para USER, e só tem dois valores: ADMIN ou NONE.
 */
export type Actor = { id: string; kind: AccountKind; role: string };

/**
 * `AuthenticatedRequest` não existe mais: `req.user` e `req.buildingRole` estão
 * declarados no próprio tipo do Express (ver src/types/express.d.ts), e é isso
 * que dispensou o `as any` de toda linha de rota. O apelido fica porque ele
 * lê melhor na assinatura dos controllers.
 */
export type AuthenticatedRequest = Request;

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token não fornecido');
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (payload.type !== 'access') {
    throw new UnauthorizedError('Token inválido');
  }

  // Token emitido antes das contas de gestor não tem `kind`; ele vale como
  // conta de usuário, que é o que ele era. Gestor precisa entrar de novo — o
  // registro dele mudou de tabela, e o token velho não sabe disso.
  const kind: AccountKind = payload.kind === 'MANAGER' ? 'MANAGER' : 'USER';

  // Gestor não tem papel de sistema: estar em `managers` já é o que ele é.
  const role = kind === 'USER' && payload.role === 'ADMIN' ? 'ADMIN' : 'NONE';

  req.user = { id: payload.sub, kind, role };
  next();
}
