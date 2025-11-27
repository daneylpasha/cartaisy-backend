import { Router } from 'express';
import { collectionDisplayController } from '../controllers/collectionDisplayController';
import { requireStoreAdmin } from '../middleware/auth';

const router = Router();

router.get('/collection-displays', collectionDisplayController.getCollectionDisplays);

router.post('/admin/collection-displays', requireStoreAdmin, collectionDisplayController.createCollectionDisplays);

router.put('/admin/collection-displays', requireStoreAdmin, collectionDisplayController.updateCollectionDisplays);

router.delete('/admin/collection-displays/:id', requireStoreAdmin, collectionDisplayController.deleteCollectionDisplay);

router.patch('/admin/collection-displays/:id/status', requireStoreAdmin, collectionDisplayController.updateCollectionDisplayStatus);

export default router;