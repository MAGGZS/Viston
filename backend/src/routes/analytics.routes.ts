import { Router } from 'express';
import { guardUuidParams } from '../middlewares/uuidParams';
import { analyticsController } from '../controllers/analytics.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireBuildingManager, requireBuildingModerator } from '../middlewares/buildingAccess';

const router = guardUuidParams(Router());

/**
 * O painel analítico do prédio.
 *
 * De moderador, pelo mesmo motivo dos contadores e do resumo: é o painel de
 * trabalho dele, tem custo de manutenção dentro, e não é leitura de quem só
 * acompanha o prédio. O gestor passa pela mesma guarda — `requireBuildingModerator`
 * aceita quem gere o prédio — e ganha os blocos a mais dentro da resposta.
 *
 * O escopo sai do `:id` da rota e nunca do corpo nem da query: é a guarda que
 * resolve o vínculo, e não o serviço confiando no que veio pedido. O único
 * parâmetro que aponta para gente, o `responsible_id`, é conferido contra o
 * vínculo daquele prédio antes de virar filtro (ver services/analytics.service.ts).
 */
router.get(
  '/buildings/:id/analytics/overview',
  authenticate,
  requireBuildingModerator(),
  analyticsController.overview
);

router.get(
  '/buildings/:id/analytics/responsibles',
  authenticate,
  requireBuildingModerator(),
  analyticsController.responsibles
);

/**
 * A contagem da fila — a que o painel inicial pede.
 *
 * Mesma guarda do resto: quem não modera não vê a operação. É leve de
 * propósito (uma consulta), porque toda visita ao painel inicial a dispara.
 */
router.get(
  '/buildings/:id/analytics/queue',
  authenticate,
  requireBuildingModerator(),
  analyticsController.queue
);

/**
 * O prédio — custo e reincidência.
 *
 * `requireBuildingModerator`, como o `overview`: o moderador é quem lança o
 * valor da manutenção ao fechar o chamado, e esconder dele o total do que ele
 * próprio lançou seria pedir o dado sem devolver a leitura. É também o que faz
 * a cobertura de custo subir — quem vê o buraco no número tende a preenchê-lo.
 */
router.get(
  '/buildings/:id/analytics/building',
  authenticate,
  requireBuildingModerator(),
  analyticsController.building
);

/**
 * Os inspetores são do gestor, e só dele.
 *
 * `requireBuildingManager` e não `requireBuildingModerator`: o moderador
 * trabalha com o resultado da ronda — a ocorrência que chegou na fila dele —,
 * não com quem a fez. Avaliar quem vistoria é leitura de quem gere o prédio.
 *
 * A guarda mora aqui, na rota, e não em esconder a aba no navegador: aba
 * escondida com rota aberta é permissão que existe só no desenho.
 */
router.get(
  '/buildings/:id/analytics/inspectors',
  authenticate,
  requireBuildingManager(),
  analyticsController.inspectors
);

export default router;
