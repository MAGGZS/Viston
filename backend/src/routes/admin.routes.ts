import { Router } from 'express';
import { guardUuidParams } from '../middlewares/uuidParams';
import { adminController } from '../controllers/admin.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { freezeSchema, grantPlanSchema, suspensionSchema } from '../validators/plan.validator';

/**
 * As rotas de plano que só o admin alcança.
 *
 * Um prefixo próprio, `/admin`, e não um ramo dentro de `/managers`: o que
 * mora aqui não é a conta olhando para si mesma, é o suporte olhando para a
 * conta dos outros. A separação no caminho é a mesma que já existe na guarda,
 * e evita que uma rota nova de gestor caia por engano ao lado de uma que
 * concede plano.
 *
 * `authorize('ADMIN')` confere o banco a cada chamada, e não só o token — ver o
 * comentário do middleware.
 */
const router = guardUuidParams(Router());

const auth = authenticate;
const adminOnly = authorize('ADMIN');

// O plano da conta, o consumo do mês e o histórico das concessões.
router.get('/managers/:managerId/plan', auth, adminOnly, adminController.planSummary);

router.post(
  '/managers/:managerId/grants',
  auth,
  adminOnly,
  validate(grantPlanSchema),
  adminController.grantPlan
);

router.delete('/grants/:id', auth, adminOnly, adminController.revokeGrant);

router.patch(
  '/managers/:managerId/suspension',
  auth,
  adminOnly,
  validate(suspensionSchema),
  adminController.setSuspension
);

router.patch(
  '/buildings/:id/freeze',
  auth,
  adminOnly,
  validate(freezeSchema),
  adminController.setFreeze
);

export default router;
