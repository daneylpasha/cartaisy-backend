import { Router } from 'express';
import { collectionDisplayController } from '../controllers/collectionDisplayController';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();

router.get('/collection-displays', collectionDisplayController.getCollectionDisplays);

router.post('/admin/collection-displays', authenticateAdmin, collectionDisplayController.createCollectionDisplays);

router.put('/admin/collection-displays', authenticateAdmin, collectionDisplayController.updateCollectionDisplays);

router.delete('/admin/collection-displays/:id', authenticateAdmin, collectionDisplayController.deleteCollectionDisplay);

router.patch('/admin/collection-displays/:id/status', authenticateAdmin, collectionDisplayController.updateCollectionDisplayStatus);

export default router;