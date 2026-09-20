import { Router } from 'express';
import { guardUuidParams } from '../middlewares/uuidParams';
import { ownershipController } from '../controllers/ownership.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireBuildingManager } from '../middlewares/buildingAccess';
import { validate } from '../middlewares/validate';
import { sensitiveLimiter } from '../middlewares/rateLimit';
import { requestTransferSchema, respondTransferSchema } from '../validators/ownership.validator';

/**
 * A troca de dono do prédio.
 *
 * Dois caminhos de propósito: o pedido é do prédio (`/buildings/:id/...`),
 * porque é dele que se trata; a resposta é do pedido (`/ownership-transfers/
 * :id`), porque quem responde é o indicado, que pode nem ter aberto a tela do
 * prédio ainda.
 *
 * A rota de abrir passa por `requireBuildingManager` e o serviço ainda confere
 * que quem pede é o *dono* — gestor do prédio não basta, senão o co-gestor
 * poderia passar adiante um prédio que não é ele quem paga.
 */
const router = guardUuidParams(Router());

const auth = authenticate;
const manager = requireBuildingManager();

router.post(
  '/buildings/:id/ownership-transfers',
  auth,
  manager,
  sensitiveLimiter,
  validate(requestTransferSchema),
  ownershipController.request
);

router.get('/buildings/:id/ownership-transfers', auth, manager, ownershipController.listByBuilding);

// Antes de `/:id` para não ser capturado pelo parâmetro dinâmico.
router.get('/ownership-transfers/me', auth, ownershipController.listMine);

router.patch(
  '/ownership-transfers/:id',
  auth,
  validate(respondTransferSchema),
  ownershipController.respond
);

export default router;
