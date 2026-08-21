import { BuildingRole } from '@prisma/client';
import { AccountKind } from '../utils/jwt';

/**
 * O que `authenticate` e `buildingAccess` penduram na requisição.
 *
 * Antes isto vivia numa interface própria (`AuthenticatedRequest`), e o preço
 * era um `as any` em toda linha de rota: o Express espera um handler de
 * `Request`, e o controller declarava outro tipo. O `as any` apagava a checagem
 * exatamente na fronteira onde ela mais serve — a que liga rota, middleware e
 * controller —, e um controller no lugar errado passava calado.
 *
 * Aumentando o tipo do próprio Express, o controller volta a receber `Request`,
 * a rota compila sem conversão, e trocar dois handlers de lugar vira erro.
 *
 * `user` é declarado como sempre presente porque toda rota que o lê passa por
 * `authenticate`, que lança antes de chamar o próximo quando não há token.
 * Declará-lo opcional só espalharia `!` pelos controllers.
 */
declare global {
  namespace Express {
    interface Request {
      user: { id: string; kind: AccountKind; role: string };
      /**
       * Papel no prédio da rota, preenchido por `requireBuildingManager` /
       * `requireBuildingMember`. 'GESTOR' quando o ator é gestor daquele prédio.
       */
      buildingRole?: BuildingRole | 'GESTOR' | null;
    }
  }
}

export {};
