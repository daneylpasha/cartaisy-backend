import express from 'express';
import { getStoreConfig } from '../controllers/storeConfigController';

const router = express.Router();

/**
 * Store Config Routes (Public)
 *
 * Public endpoints for mobile app to get store configuration
 * No authentication required
 * Mounted at /api/v1/store
 */

/**
 * GET /api/v1/store/config
 * Get store configuration (currency, timezone, language, name)
 * Requires X-Store-ID header
 */
router.get('/config', getStoreConfig);

export default router;
