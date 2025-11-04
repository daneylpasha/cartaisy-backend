import express from 'express';
import {
  getProductRecommendationsController,
  getCartRecommendationsController
} from '../controllers/recommendationsController';

const router = express.Router();

/**
 * Recommendations Routes
 *
 * Provides product recommendation endpoints for mobile app
 */

/**
 * @route   GET /api/v1/recommendations/product/:shopifyProductId
 * @desc    Get product recommendations for Product Detail Page (PDP)
 * @query   limit - Number of recommendations (default: 6, max: 50)
 * @access  Public
 * @example GET /api/v1/recommendations/product/14819881320820?limit=6
 */
router.get('/product/:shopifyProductId', getProductRecommendationsController);

/**
 * @route   POST /api/v1/recommendations/cart
 * @desc    Get cart-based recommendations
 * @query   limit - Number of recommendations (default: 6, max: 50)
 * @body    { cartItems: ["shopifyProductId1", "shopifyProductId2"] }
 * @access  Public
 * @example POST /api/v1/recommendations/cart?limit=6
 *          Body: { "cartItems": ["14819881320820", "14819881320821"] }
 */
router.post('/cart', getCartRecommendationsController);

export default router;
