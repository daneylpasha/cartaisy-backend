import { Router } from 'express';
import { requireStoreAdmin } from '../middleware/auth';
import * as storeSubmitController from '../controllers/storeSubmitController';

const router = Router();

/**
 * EAS Submit for a store's finished build (issue #187). Store admins act on
 * their own store. A body storeId is rejected. A query or header store id
 * does not select another store. Apple and Google keys stay on the server.
 */

const storeAdminGuard = requireStoreAdmin.map((middleware) => middleware as any);

router.post(
  '/build-requests/:id/submits',
  ...storeAdminGuard,
  storeSubmitController.createStoreSubmit as any
);

router.get(
  '/build-requests/:id/submits',
  ...storeAdminGuard,
  storeSubmitController.listStoreSubmitStatus as any
);

router.get(
  '/build-requests/:id/submits/:platform',
  ...storeAdminGuard,
  storeSubmitController.getStoreSubmitStatus as any
);

export default router;
