import { Router } from 'express';
import { calloutBannerController } from '../controllers/calloutBannerController';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();

router.get('/callout-banners', calloutBannerController.getCalloutBanners);

router.post('/admin/callout-banners', authenticateAdmin, calloutBannerController.createCalloutBanners);

router.put('/admin/callout-banners', authenticateAdmin, calloutBannerController.updateCalloutBanners);

router.delete('/admin/callout-banners/:id', authenticateAdmin, calloutBannerController.deleteCalloutBanner);

router.patch('/admin/callout-banners/:id/status', authenticateAdmin, calloutBannerController.updateCalloutBannerStatus);

export default router;