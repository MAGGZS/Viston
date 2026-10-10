import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { helpNotFound, helpService } from '../services/help.service';
import { HELP_SLUG } from '../validators/help.validator';
import { ok, created } from '../utils/response';

/**
 * Slug fora do formato é slug que não existe: 404 sem ir ao banco, pelo mesmo
 * motivo do `guardUuidParams` com os ids.
 */
function slugParam(req: AuthenticatedRequest, what: 'Pasta' | 'Tutorial'): string {
  const slug = req.params.slug;
  if (!slug || slug.length > 100 || !HELP_SLUG.test(slug)) throw helpNotFound(what);
  return slug;
}

export const helpController = {
  async listFolders(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.listFolders(req.user));
  },

  async getFolder(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.getFolder(req.user, slugParam(req, 'Pasta')));
  },

  async getFeature(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.getFeature(req.user, slugParam(req, 'Tutorial')));
  },

  async search(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.search(req.user, String(req.query.q ?? '')));
  },

  async answerHelpful(req: AuthenticatedRequest, res: Response) {
    created(
      res,
      await helpService.answerHelpful(req.user, slugParam(req, 'Tutorial'), req.body.helpful, req.body.comment)
    );
  },

  // ── Admin ──────────────────────────────────────────────────────────────────

  async tree(_req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.tree());
  },

  async featureDetail(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.featureDetail(req.params.id));
  },

  async updateFolder(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.updateFolder(req.params.id, req.body, req.user));
  },

  async reorderFolders(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.reorderFolders(req.body.ids, req.user));
  },

  async reorderFeatures(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.reorderFeatures(req.params.id, req.body.ids, req.user));
  },

  async updateFeature(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.updateFeature(req.params.id, req.body, req.user));
  },

  async updateStep(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.updateStep(req.params.id, req.body, req.user));
  },

  async uploadUrls(req: AuthenticatedRequest, res: Response) {
    created(res, await helpService.uploadUrls(req.params.id, req.user));
  },

  async commit(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.commit(req.params.id, req.body.upload_id, req.user));
  },

  async publish(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.publish(req.params.id, req.user));
  },

  async unpublish(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.unpublish(req.params.id, req.user));
  },

  async publishBatch(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.publishBatch(req.body.ids, req.body.published, req.user));
  },

  async sync(req: AuthenticatedRequest, res: Response) {
    ok(res, await helpService.sync(req.body ?? {}, req.user));
  },
};
