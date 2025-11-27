import { Router } from 'express';
import { carouselController } from '../controllers/carouselController';
import { requireStoreAdmin } from '../middleware/auth';

const router = Router();

// Public route to get carousel items
router.get('/carousel', carouselController.getCarouselItems as any);

// Admin routes for carousel management
// Create single carousel item
router.post('/admin/carousel/item', requireStoreAdmin as any, carouselController.createCarouselItem as any);

// Create multiple carousel items (bulk)
router.post('/admin/carousel', requireStoreAdmin as any, carouselController.createCarouselItems as any);

// Update all carousel items (replace all)
router.put('/admin/carousel', requireStoreAdmin as any, carouselController.updateCarouselItems as any);

// Delete a single carousel item
router.delete('/admin/carousel/:id', requireStoreAdmin as any, carouselController.deleteCarouselItem as any);

// Update carousel item status (isActive)
router.patch('/admin/carousel/:id/status', requireStoreAdmin as any, carouselController.updateCarouselItemStatus as any);

export default router;