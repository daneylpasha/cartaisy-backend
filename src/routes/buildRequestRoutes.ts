import { Router } from 'express';
import { authenticate, requireStoreAdmin } from '../middleware/auth';
import { requirePlatformOps } from '../middleware/platformOps';
import * as buildRequestController from '../controllers/buildRequestController';

const router = Router();

/**
 * Tracked "Build my app" requests (issue #155). Store admins act on their
 * own store. A client storeId is ignored. Platform status and the cross-store
 * queue require a platform-ops marker (issue #170). Store-owner `super_admin`
 * is not enough, so a merchant cannot mark a build ready or read another
 * store's requests.
 */

const storeAdminGuard = requireStoreAdmin.map((middleware) => middleware as any);

router.post('/build-requests', ...storeAdminGuard, buildRequestController.createBuildRequest as any);

router.get('/build-requests', ...storeAdminGuard, buildRequestController.listBuildRequests as any);

router.get('/build-requests/:id', ...storeAdminGuard, buildRequestController.getBuildRequest as any);

router.patch(
  '/build-requests/:id',
  ...storeAdminGuard,
  buildRequestController.updateBuildRequestChecklist as any
);

router.get(
  '/admin/build-requests',
  authenticate as any,
  requirePlatformOps as any,
  buildRequestController.listAdminBuildRequests as any
);

router.patch(
  '/admin/build-requests/:id/status',
  authenticate as any,
  requirePlatformOps as any,
  buildRequestController.updateBuildRequestStatus as any
);

export default router;
