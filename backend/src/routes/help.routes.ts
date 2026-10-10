import { Router } from 'express';
import { guardUuidParams } from '../middlewares/uuidParams';
import { helpController } from '../controllers/help.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { helpFeedbackLimiter } from '../middlewares/rateLimit';
import {
  commitSchema,
  helpfulSchema,
  publishBatchSchema,
  reorderSchema,
  searchQuerySchema,
  syncSchema,
  updateFeatureSchema,
  updateFolderSchema,
  updateStepSchema,
} from '../validators/help.validator';

/**
 * A central de ajuda. O contrato completo (corpos, respostas, erros) está em
 * `tutoriais/API.md`; as telas são construídas a partir dele.
 *
 * Dois roteadores, porque são dois públicos:
 * - `/help`: qualquer conta autenticada, das duas naturezas, inclusive sem
 *   prédio. A pasta da administração só aparece para ADMIN, e para os outros
 *   ela não existe (404, e não 403).
 * - `/admin/help`: só ADMIN, com a guarda que confere o banco a cada chamada
 *   (ver `authorize`). Toda escrita vai para a auditoria.
 */
const router = Router();
const auth = authenticate;

router.get('/folders', auth, helpController.listFolders);
router.get('/folders/:slug', auth, helpController.getFolder);
router.get('/features/:slug', auth, helpController.getFeature);
router.get('/search', auth, validate(searchQuerySchema, 'query'), helpController.search);
// Teto próprio, por conta: cada resposta vira linha na caixa do admin (ver `helpFeedbackLimiter`).
router.post(
  '/features/:slug/feedback',
  auth,
  helpFeedbackLimiter,
  validate(helpfulSchema),
  helpController.answerHelpful
);

export default router;

export const adminHelpRoutes = (() => {
  const admin = guardUuidParams(Router());
  const adminOnly = authorize('ADMIN');

  admin.get('/tree', auth, adminOnly, helpController.tree);
  // O seed pela tela: o Render gratuito não tem shell para rodar o script.
  admin.post('/sync', auth, adminOnly, validate(syncSchema), helpController.sync);

  // `/folders/order` antes de `/folders/:id`: senão "order" cairia no
  // parâmetro, e o filtro de UUID responderia 404.
  admin.patch('/folders/order', auth, adminOnly, validate(reorderSchema), helpController.reorderFolders);
  admin.patch('/folders/:id', auth, adminOnly, validate(updateFolderSchema), helpController.updateFolder);
  admin.patch(
    '/folders/:id/features/order',
    auth,
    adminOnly,
    validate(reorderSchema),
    helpController.reorderFeatures
  );

  admin.get('/features/:id', auth, adminOnly, helpController.featureDetail);
  admin.patch('/features/:id', auth, adminOnly, validate(updateFeatureSchema), helpController.updateFeature);
  admin.post('/features/:id/video/upload-urls', auth, adminOnly, helpController.uploadUrls);
  admin.post('/features/:id/video/commit', auth, adminOnly, validate(commitSchema), helpController.commit);
  admin.post('/features/:id/publish', auth, adminOnly, helpController.publish);
  admin.post('/features/:id/unpublish', auth, adminOnly, helpController.unpublish);
  // Em lote, pela seleção da árvore. Sem `:id`, então não briga com as duas acima.
  admin.post('/features/publish-batch', auth, adminOnly, validate(publishBatchSchema), helpController.publishBatch);

  admin.patch('/steps/:id', auth, adminOnly, validate(updateStepSchema), helpController.updateStep);

  return admin;
})();
