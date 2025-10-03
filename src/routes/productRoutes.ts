import express from 'express';
import {
  getProducts,
  getProduct,
  searchProducts,
  getFeaturedProducts,
  getProductsByCategory,
  getRecommendations,
  trackProductView,
  getProductReviews,
  getRelatedProducts
} from '../controllers/productController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validateObjectId } from '../middleware/validation';

const router = express.Router();

/**
 * @route GET /api/v1/products
 * @desc Get products with filtering, sorting, and pagination
 * @access Public
 * @query {string} page - Page number (default: 1)
 * @query {string} limit - Items per page (default: 20)
 * @query {string} category - Category ID filter
 * @query {string} brand - Brand name filter
 * @query {string} priceMin - Minimum price filter
 * @query {string} priceMax - Maximum price filter
 * @query {string} inStock - Filter by stock availability (true/false)
 * @query {string} rating - Minimum rating filter
 * @query {string} sortBy - Sort order (relevance, price_low, price_high, newest, rating, popular)
 * @query {string} search - Search query for text search
 * @query {string} tags - Tag filters (can be multiple)
 * @query {string} featured - Filter featured products (true/false)
 */
router.get('/', getProducts);

/**
 * @route GET /api/v1/products/search
 * @desc Enhanced product search with fuzzy matching and filters
 * @access Public
 * @query {string} q - Search query (required)
 * @query {string} page - Page number (default: 1)
 * @query {string} limit - Items per page (default: 20)
 * @query {string} category - Category ID filter
 * @query {string} priceMin - Minimum price filter
 * @query {string} priceMax - Maximum price filter
 * @query {string} brand - Brand name filter
 * @query {string} rating - Minimum rating filter
 * @query {string} inStock - Filter by stock availability (true/false)
 * @query {string} sortBy - Sort order (relevance, price_low, price_high, rating, popular)
 */
router.get('/search', searchProducts);

/**
 * @route GET /api/v1/products/featured
 * @desc Get featured products with personalization
 * @access Public (personalized if authenticated)
 * @query {string} limit - Number of products to return (default: 10)
 * @query {string} category - Category ID filter
 */
router.get('/featured', optionalAuth, getFeaturedProducts);

/**
 * @route GET /api/v1/products/recommendations
 * @desc Get AI-powered product recommendations
 * @access Private
 * @query {string} limit - Number of recommendations (default: 10)
 * @query {string} type - Recommendation type (general, similar, trending)
 */
router.get('/recommendations', requireAuth, getRecommendations);

/**
 * @route GET /api/v1/products/category/:categoryId
 * @desc Get products by category with filters
 * @access Public
 * @param {string} categoryId - Category ID
 * @query {string} page - Page number (default: 1)
 * @query {string} limit - Items per page (default: 20)
 * @query {string} sortBy - Sort order (priority, price_low, price_high, newest, rating, popular)
 * @query {string} priceMin - Minimum price filter
 * @query {string} priceMax - Maximum price filter
 * @query {string} brand - Brand name filter
 * @query {string} inStock - Filter by stock availability (true/false)
 */
router.get('/category/:categoryId', validateObjectId('categoryId'), getProductsByCategory);

/**
 * @route GET /api/v1/products/:id
 * @desc Get single product with related products and reviews
 * @access Public (tracks view if authenticated)
 * @param {string} id - Product ID
 * @note This route is now handled by ProductDetailController (TSOA)
 */
// router.get('/:id', validateObjectId('id'), optionalAuth, getProduct);

/**
 * @route GET /api/v1/products/:id/reviews
 * @desc Get product reviews with pagination and sorting
 * @access Public
 * @param {string} id - Product ID
 * @query {string} page - Page number (default: 1)
 * @query {string} limit - Items per page (default: 10)
 * @query {string} sortBy - Sort order (newest, oldest, rating_high, rating_low, helpful)
 * @query {string} rating - Filter by rating (1-5)
 * @query {string} verified - Filter verified purchases (true/false)
 */
router.get('/:id/reviews', validateObjectId('id'), getProductReviews);

/**
 * @route GET /api/v1/products/:id/related
 * @desc Get related/similar products
 * @access Public
 * @param {string} id - Product ID
 * @query {string} limit - Number of related products (default: 8)
 */
router.get('/:id/related', validateObjectId('id'), getRelatedProducts);

/**
 * @route POST /api/v1/products/:id/track-view
 * @desc Track product view for analytics
 * @access Private
 * @param {string} id - Product ID
 * @body {string} from - View context (search, category, recommendation, direct, related)
 * @body {string} search - Search query if viewed from search
 */
router.post('/:id/track-view', validateObjectId('id'), requireAuth, async (req: any, res) => {
  try {
    await trackProductView(req.params.id, req.user.id, req);
    res.json({
      success: true,
      message: 'View tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking view:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track view'
    });
  }
});

export default router;