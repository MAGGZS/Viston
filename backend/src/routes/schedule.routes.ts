import { Router } from 'express';
import { guardUuidParams } from '../middlewares/uuidParams';
import { scheduleController } from '../controllers/schedule.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { requireBuildingMember, requireBuildingSupervisor } from '../middlewares/buildingAccess';
import { requireBuildingActive } from '../middlewares/planGate';
import { scheduleWriteLimiter } from '../middlewares/rateLimit';
import { createScheduleSchema, updateScheduleSchema } from '../validators/schedule.validator';

const router = guardUuidParams(Router());

/**
 * A agenda de vistorias.
 *
 * Escrever (marcar, mudar, concluir, cancelar) é do gestor ou do VIEWER do
 * prédio — `requireBuildingSupervisor`. Ler é de qualquer vínculo; o INSPECTOR
 * recebe só as rondas dele, e esse recorte é do serviço, que sabe o papel pela
 * guarda (`req.buildingRole`).
 *
 * Prédio inativo é só leitura: a escrita passa por `requireBuildingActive`, a
 * mesma guarda do resto da API. Entra depois da de vínculo — quem não tem nada
 * com o prédio recebe 403, e não fica sabendo que ele está congelado.
 *
 * A escrita tem teto por conta (`scheduleWriteLimiter`), logo depois do login:
 * cada gravação pode virar aviso e e-mail para o inspetor.
 *
 * A sugestão vem antes de qualquer rota com `:scheduleId`, para "suggestion"
 * nunca ser lido como id.
 */
router.get(
  '/buildings/:id/schedules/suggestion',
  authenticate,
  requireBuildingSupervisor(),
  scheduleController.suggestion
);

router.get('/buildings/:id/schedules', authenticate, requireBuildingMember(), scheduleController.list);

router.post(
  '/buildings/:id/schedules',
  authenticate,
  scheduleWriteLimiter,
  requireBuildingSupervisor(),
  requireBuildingActive(),
  validate(createScheduleSchema),
  scheduleController.create
);

router.patch(
  '/buildings/:id/schedules/:scheduleId',
  authenticate,
  scheduleWriteLimiter,
  requireBuildingSupervisor(),
  requireBuildingActive(),
  validate(updateScheduleSchema),
  scheduleController.update
);

/** O painel do supervisor: mesma guarda da escrita da agenda, sem a de prédio ativo — é leitura. */
router.get(
  '/buildings/:id/supervisor/overview',
  authenticate,
  requireBuildingSupervisor(),
  scheduleController.overview
);

// ── O que é da conta de quem pede ─────────────────────────────────────────────
// Sem prédio na rota: o recorte é a própria conta, e os prédios saem do vínculo
// dela (ver scheduleService.mine). `read-all` vem antes de `:id/read` só por
// legibilidade — os dois caminhos não colidem.
router.get('/me/schedules', authenticate, scheduleController.mine);
router.get('/me/notifications', authenticate, scheduleController.notifications);
router.patch('/me/notifications/read-all', authenticate, scheduleController.readAllNotifications);
router.patch('/me/notifications/:id/read', authenticate, scheduleController.readNotification);

export default router;
