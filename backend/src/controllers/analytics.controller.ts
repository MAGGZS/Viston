import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { analyticsService } from '../services/analytics.service';
import { ok } from '../utils/response';
import { analyticsFiltersSchema } from '../validators/analytics.validator';

export const analyticsController = {
  /**
   * A visão geral do painel: indicadores, funil e prazo.
   *
   * Os filtros entram espalhados pelo schema, como na listagem de chamados —
   * enumerá-los campo a campo aqui é a lista que se esquece de atualizar, e o
   * filtro passa a existir na URL sem existir na resposta, sem erro nenhum.
   */
  async overview(req: AuthenticatedRequest, res: Response) {
    const filters = analyticsFiltersSchema.parse(req.query);
    ok(res, await analyticsService.overview(req.params.id, filters));
  },

  /**
   * Os responsáveis: a tabela comparativa, ou a análise de um só.
   *
   * Qual dos dois vem sai do próprio filtro — `responsible_id` presente é a
   * pessoa, ausente é a equipe. Duas rotas para a mesma pergunta obrigariam a
   * tela a saber qual chamar antes de saber o que quer mostrar.
   */
  async responsibles(req: AuthenticatedRequest, res: Response) {
    const filters = analyticsFiltersSchema.parse(req.query);
    ok(res, await analyticsService.responsibles(req.params.id, filters));
  },

  /**
   * Quantos chamados pedem atenção agora.
   *
   * Sem filtro nenhum, nem `req.query`: a fila é de agora e do prédio inteiro.
   * Passar o schema aqui abriria um recorte de período sobre uma pergunta que
   * não tem período.
   */
  async queue(req: AuthenticatedRequest, res: Response) {
    ok(res, await analyticsService.queue(req.params.id));
  },

  /**
   * O prédio: custo e reincidência.
   *
   * Mesma guarda do `overview`, e pelo mesmo motivo: tem custo de manutenção
   * dentro, e custo não é leitura de quem só acompanha o prédio.
   */
  async building(req: AuthenticatedRequest, res: Response) {
    const filters = analyticsFiltersSchema.parse(req.query);
    ok(res, await analyticsService.building(req.params.id, filters));
  },

  /**
   * Os inspetores do prédio.
   *
   * A rota é de gestor (ver routes/analytics.routes.ts). Quem vistoria é
   * avaliado por quem gere o prédio, e não pelo moderador que recebe as
   * ocorrências dele — o moderador trabalha com o resultado da ronda, não com
   * quem a fez.
   */
  async inspectors(req: AuthenticatedRequest, res: Response) {
    const filters = analyticsFiltersSchema.parse(req.query);
    ok(res, await analyticsService.inspectors(req.params.id, filters));
  },
};
