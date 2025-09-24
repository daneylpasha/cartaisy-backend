import { Router } from 'express';
import { carouselController } from '../controllers/carouselController';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();

router.get('/carousel', carouselController.getCarouselItems);

router.post('/admin/carousel', authenticateAdmin, carouselController.createCarouselItems);

router.put('/admin/carousel', authenticateAdmin, carouselController.updateCarouselItems);

router.delete('/admin/carousel/:id', authenticateAdmin, carouselController.deleteCarouselItem);

router.patch('/admin/carousel/:id/status', authenticateAdmin, carouselController.updateCarouselItemStatus);

export default router;