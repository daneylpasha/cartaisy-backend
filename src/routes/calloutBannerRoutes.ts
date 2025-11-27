import { Router } from 'express';
import { calloutBannerController } from '../controllers/calloutBannerController';
import { requireStoreAdmin } from '../middleware/auth';

const router = Router();

router.get('/callout-banners', calloutBannerController.getCalloutBanners);

router.post('/admin/callout-banners', requireStoreAdmin, calloutBannerController.createCalloutBanners);

router.put('/admin/callout-banners', requireStoreAdmin, calloutBannerController.updateCalloutBanners);

router.delete('/admin/callout-banners/:id', requireStoreAdmin, calloutBannerController.deleteCalloutBanner);

router.patch('/admin/callout-banners/:id/status', requireStoreAdmin, calloutBannerController.updateCalloutBannerStatus);

export default router;