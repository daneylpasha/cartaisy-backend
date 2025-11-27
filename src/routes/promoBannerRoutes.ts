import { Router } from 'express';
import { promoBannerController } from '../controllers/promoBannerController';
import { requireStoreAdmin } from '../middleware/auth';

const router = Router();

router.get('/promo-banners', promoBannerController.getPromoBanners);

router.post('/admin/promo-banners', requireStoreAdmin, promoBannerController.createPromoBanners);

router.put('/admin/promo-banners', requireStoreAdmin, promoBannerController.updatePromoBanners);

router.delete('/admin/promo-banners/:id', requireStoreAdmin, promoBannerController.deletePromoBanner);

router.patch('/admin/promo-banners/:id/status', requireStoreAdmin, promoBannerController.updatePromoBannerStatus);

export default router;
