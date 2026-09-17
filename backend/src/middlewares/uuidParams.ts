import { Router } from 'express';
import { NotFoundError } from '../utils/errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Os parâmetros de rota que são id de linha, e por isso só podem ser UUID.
 *
 * Sem este filtro, `/tickets/abc` descia até o Postgres, que recusava o texto
 * como UUID, e a resposta saía 500 com o erro do driver no log. Para quem sonda
 * a API, 500 é convite; e cada id malformado custava uma ida ao banco.
 *
 * 404, e não 400: um id que não é UUID é um id que não existe.
 */
const ID_PARAMS = ['id', 'floorId', 'managerId', 'userId', 'requestId', 'updateId'];

export function guardUuidParams(router: Router): Router {
  for (const name of ID_PARAMS) {
    router.param(name, (_req, _res, next, value: string) => {
      if (!UUID.test(value)) {
        next(new NotFoundError('Registro'));
        return;
      }
      next();
    });
  }
  return router;
}
