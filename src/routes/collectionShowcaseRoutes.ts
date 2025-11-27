import { Router } from 'express';
import { collectionShowcaseController } from '../controllers/collectionShowcaseController';
import { requireStoreAdmin } from '../middleware/auth';

const router = Router();

router.get('/collection-showcases', collectionShowcaseController.getCollectionShowcases);

router.post('/admin/collection-showcases', requireStoreAdmin, collectionShowcaseController.createCollectionShowcases);

router.put('/admin/collection-showcases', requireStoreAdmin, collectionShowcaseController.updateCollectionShowcases);

router.delete('/admin/collection-showcases/:id', requireStoreAdmin, collectionShowcaseController.deleteCollectionShowcase);

router.patch('/admin/collection-showcases/:id/status', requireStoreAdmin, collectionShowcaseController.updateCollectionShowcaseStatus);

export default router;
