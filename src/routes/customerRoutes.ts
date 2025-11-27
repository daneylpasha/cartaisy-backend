import express from 'express';
import { homescreenController } from '../controllers/homescreenController';

// Wishlist controllers
import {
  getUserWishlists,
  getWishlist,
  createWishlist,
  updateWishlist,
  deleteWishlist,
  addToWishlist,
  removeFromWishlist,
  checkWishlistStatus,
  shareWishlist,
  getSharedWishlist,
  moveItemBetweenWishlists
} from '../controllers/wishlistController';

// Review controllers
import {
  createReview,
  getReview,
  updateReview,
  deleteReview,
  voteOnReview,
  getUserReviews,
  reportReview,
  getReviewAnalytics,
  moderateReview
} from '../controllers/reviewController';

// Order controllers
import {
  getUserOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  cancelOrder,
  requestReturn,
  getOrderTracking,
  rateOrder,
  createSupportTicket,
  getOrderAnalytics
} from '../controllers/orderController';

// NOTE: Search routes are now handled by TSOA auto-generated routes
// See src/controllers/searchController.ts (TSOA controller)
// and src/generated/routes.ts (auto-generated)

// Analytics controllers
import {
  getDashboardAnalytics,
  getProductAnalytics,
  getUserBehaviorAnalytics,
  getRevenueAnalytics,
  getInventoryAnalytics
} from '../controllers/analyticsController';

import { requireAuth, optionalAuth, requireAdmin } from '../middleware/auth';
import { validateObjectId } from '../middleware/validation';
import { storeAuth } from '../middleware/storeAuth';

const router = express.Router();

// =============================================================================
// HOMESCREEN ROUTE
// =============================================================================

/**
 * GET /api/v1/customer/homescreen
 * Get all homescreen data including carousel items
 */
router.get('/homescreen', requireAuth, storeAuth, homescreenController.getHomescreenData);

// Individual homescreen component endpoints for selective updates
// These can be uncommented and implemented as needed:
// router.get('/homescreen/carousel', homescreenController.getCarouselOnly);
// router.get('/homescreen/featured', homescreenController.getFeaturedOnly);
// router.get('/homescreen/categories', homescreenController.getCategoriesOnly);

// =============================================================================
// WISHLIST ROUTES
// =============================================================================

/**
 * @route GET /api/v1/customer/wishlists
 * @desc Get user's wishlists
 * @access Private
 */
router.get('/wishlists', requireAuth, getUserWishlists);

/**
 * @route POST /api/v1/customer/wishlists
 * @desc Create a new wishlist
 * @access Private
 * @body {string} name - Wishlist name (required)
 * @body {string} description - Wishlist description (optional)
 * @body {boolean} isPrivate - Privacy setting (default: true)
 * @body {string} color - Theme color (default: #E91E63)
 */
router.post('/wishlists', requireAuth, createWishlist);

/**
 * @route GET /api/v1/customer/wishlists/:wishlistId
 * @desc Get specific wishlist with items
 * @access Private
 * @param {string} wishlistId - Wishlist ID
 */
router.get('/wishlists/:wishlistId', validateObjectId('wishlistId'), requireAuth, getWishlist);

/**
 * @route PUT /api/v1/customer/wishlists/:wishlistId
 * @desc Update wishlist details
 * @access Private
 * @param {string} wishlistId - Wishlist ID
 * @body {string} name - Wishlist name
 * @body {string} description - Wishlist description
 * @body {boolean} isPrivate - Privacy setting
 * @body {string} color - Theme color
 * @body {boolean} isDefault - Default wishlist flag
 */
router.put('/wishlists/:wishlistId', validateObjectId('wishlistId'), requireAuth, updateWishlist);

/**
 * @route DELETE /api/v1/customer/wishlists/:wishlistId
 * @desc Delete a wishlist
 * @access Private
 * @param {string} wishlistId - Wishlist ID
 */
router.delete('/wishlists/:wishlistId', validateObjectId('wishlistId'), requireAuth, deleteWishlist);

/**
 * @route POST /api/v1/customer/wishlists/:wishlistId/items
 * @desc Add product to wishlist
 * @access Private
 * @param {string} wishlistId - Wishlist ID (or 'default' for default wishlist)
 * @body {string} productId - Product ID (required)
 * @body {string} variantId - Product variant ID (optional)
 * @body {string} notes - Personal notes (optional)
 * @body {number} priority - Priority level 1-5 (default: 3)
 */
router.post('/wishlists/:wishlistId/items', requireAuth, addToWishlist);

/**
 * @route DELETE /api/v1/customer/wishlists/:wishlistId/items/:productId
 * @desc Remove product from wishlist
 * @access Private
 * @param {string} wishlistId - Wishlist ID
 * @param {string} productId - Product ID
 * @query {string} variantId - Product variant ID (optional)
 */
router.delete('/wishlists/:wishlistId/items/:productId', 
  validateObjectId('wishlistId'), 
  validateObjectId('productId'), 
  requireAuth, 
  removeFromWishlist
);

/**
 * @route GET /api/v1/customer/wishlists/check/:productId
 * @desc Check if product is in any wishlist
 * @access Private
 * @param {string} productId - Product ID
 * @query {string} variantId - Product variant ID (optional)
 */
router.get('/wishlists/check/:productId', 
  validateObjectId('productId'), 
  requireAuth, 
  checkWishlistStatus
);

/**
 * @route POST /api/v1/customer/wishlists/:wishlistId/share
 * @desc Share wishlist with others
 * @access Private
 * @param {string} wishlistId - Wishlist ID
 * @body {boolean} isPublic - Make publicly accessible (default: false)
 * @body {string[]} emails - Email addresses to share with (optional)
 * @body {number} expiresInDays - Expiration in days (optional)
 */
router.post('/wishlists/:wishlistId/share', 
  validateObjectId('wishlistId'), 
  requireAuth, 
  shareWishlist
);

/**
 * @route POST /api/v1/customer/wishlists/:sourceWishlistId/move/:targetWishlistId
 * @desc Move item between wishlists
 * @access Private
 * @param {string} sourceWishlistId - Source wishlist ID
 * @param {string} targetWishlistId - Target wishlist ID
 * @body {string} productId - Product ID (required)
 * @body {string} variantId - Product variant ID (optional)
 */
router.post('/wishlists/:sourceWishlistId/move/:targetWishlistId',
  validateObjectId('sourceWishlistId'),
  validateObjectId('targetWishlistId'),
  requireAuth,
  moveItemBetweenWishlists
);

// =============================================================================
// REVIEW ROUTES
// =============================================================================

/**
 * @route POST /api/v1/customer/reviews
 * @desc Create a product review
 * @access Private
 * @body {string} productId - Product ID (required)
 * @body {number} rating - Rating 1-5 (required)
 * @body {string} reviewText - Review text (required)
 * @body {string} title - Review title (optional)
 * @body {string[]} images - Review images (optional)
 * @body {string[]} pros - Product pros (optional)
 * @body {string[]} cons - Product cons (optional)
 * @body {boolean} wouldRecommend - Recommendation flag (optional)
 */
router.post('/reviews', requireAuth, createReview);

/**
 * @route GET /api/v1/customer/reviews
 * @desc Get user's reviews
 * @access Private
 * @query {string} page - Page number (default: 1)
 * @query {string} limit - Items per page (default: 10)
 * @query {string} status - Filter by status (all, pending, approved, rejected)
 */
router.get('/reviews', requireAuth, getUserReviews);

/**
 * @route GET /api/v1/customer/reviews/:reviewId
 * @desc Get specific review
 * @access Private
 * @param {string} reviewId - Review ID
 */
router.get('/reviews/:reviewId', validateObjectId('reviewId'), requireAuth, getReview);

/**
 * @route PUT /api/v1/customer/reviews/:reviewId
 * @desc Update a review
 * @access Private
 * @param {string} reviewId - Review ID
 * @body {number} rating - Rating 1-5
 * @body {string} reviewText - Review text
 * @body {string} title - Review title
 * @body {string[]} images - Review images
 * @body {string[]} pros - Product pros
 * @body {string[]} cons - Product cons
 * @body {boolean} wouldRecommend - Recommendation flag
 */
router.put('/reviews/:reviewId', validateObjectId('reviewId'), requireAuth, updateReview);

/**
 * @route DELETE /api/v1/customer/reviews/:reviewId
 * @desc Delete a review
 * @access Private
 * @param {string} reviewId - Review ID
 */
router.delete('/reviews/:reviewId', validateObjectId('reviewId'), requireAuth, deleteReview);

/**
 * @route POST /api/v1/customer/reviews/:reviewId/vote
 * @desc Vote on a review (helpful/not helpful)
 * @access Private
 * @param {string} reviewId - Review ID
 * @body {string} voteType - Vote type ('helpful' or 'not_helpful')
 */
router.post('/reviews/:reviewId/vote', validateObjectId('reviewId'), requireAuth, voteOnReview);

/**
 * @route POST /api/v1/customer/reviews/:reviewId/report
 * @desc Report a review
 * @access Private
 * @param {string} reviewId - Review ID
 * @body {string} reason - Report reason (required)
 * @body {string} description - Additional description (optional)
 */
router.post('/reviews/:reviewId/report', validateObjectId('reviewId'), requireAuth, reportReview);

// =============================================================================
// ORDER ROUTES
// =============================================================================

/**
 * @route GET /api/v1/customer/orders
 * @desc Get user's orders
 * @access Private
 * @query {string} page - Page number (default: 1)
 * @query {string} limit - Items per page (default: 10)
 * @query {string} status - Filter by status
 * @query {string} startDate - Start date filter (ISO string)
 * @query {string} endDate - End date filter (ISO string)
 */
router.get('/orders', requireAuth, getUserOrders);

/**
 * @route POST /api/v1/customer/orders
 * @desc Create a new order
 * @access Private
 * @body {object[]} lineItems - Order items (required)
 * @body {object} billingAddress - Billing address (required)
 * @body {object} shippingAddress - Shipping address (required)
 * @body {object} shipping - Shipping method and cost (required)
 * @body {string} specialInstructions - Special delivery instructions (optional)
 * @body {object} deliveryPreferences - Delivery preferences (optional)
 * @body {string} source - Order source (default: 'mobile')
 * @body {string} channel - Order channel (default: 'app')
 * @body {string} campaignId - Marketing campaign ID (optional)
 */
router.post('/orders', requireAuth, createOrder);

/**
 * @route GET /api/v1/customer/orders/:orderId
 * @desc Get specific order details
 * @access Private
 * @param {string} orderId - Order ID
 */
router.get('/orders/:orderId', validateObjectId('orderId'), requireAuth, getOrder);

/**
 * @route POST /api/v1/customer/orders/:orderId/cancel
 * @desc Cancel an order
 * @access Private
 * @param {string} orderId - Order ID
 * @body {string} reason - Cancellation reason (optional)
 */
router.post('/orders/:orderId/cancel', validateObjectId('orderId'), requireAuth, cancelOrder);

/**
 * @route POST /api/v1/customer/orders/:orderId/return
 * @desc Request order return/exchange
 * @access Private
 * @param {string} orderId - Order ID
 * @body {string} type - Return type ('return' or 'exchange')
 * @body {string} reason - Return reason (required)
 * @body {object[]} items - Items to return (required)
 */
router.post('/orders/:orderId/return', validateObjectId('orderId'), requireAuth, requestReturn);

/**
 * @route GET /api/v1/customer/orders/:orderId/tracking
 * @desc Get order tracking information
 * @access Private
 * @param {string} orderId - Order ID
 */
router.get('/orders/:orderId/tracking', validateObjectId('orderId'), requireAuth, getOrderTracking);

/**
 * @route POST /api/v1/customer/orders/:orderId/rate
 * @desc Rate a delivered order
 * @access Private
 * @param {string} orderId - Order ID
 * @body {number} overallRating - Overall rating 1-5 (required)
 * @body {number} deliveryRating - Delivery rating 1-5 (optional)
 * @body {number} packagingRating - Packaging rating 1-5 (optional)
 * @body {number} productQualityRating - Product quality rating 1-5 (optional)
 * @body {number} customerServiceRating - Customer service rating 1-5 (optional)
 * @body {string} comment - Rating comment (optional)
 */
router.post('/orders/:orderId/rate', validateObjectId('orderId'), requireAuth, rateOrder);

/**
 * @route POST /api/v1/customer/orders/:orderId/support
 * @desc Create support ticket for order
 * @access Private
 * @param {string} orderId - Order ID
 * @body {string} subject - Ticket subject (required)
 * @body {string} priority - Ticket priority (low, medium, high, urgent)
 */
router.post('/orders/:orderId/support', validateObjectId('orderId'), requireAuth, createSupportTicket);

/**
 * @route GET /api/v1/customer/orders/analytics
 * @desc Get user's order analytics
 * @access Private
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/orders/analytics', requireAuth, getOrderAnalytics);

// =============================================================================
// SEARCH ROUTES
// =============================================================================
// NOTE: All search routes are now handled by TSOA auto-generated routes
// See src/controllers/searchController.ts (TSOA @Route('customer/search'))
// Routes available via TSOA:
//   - GET  /api/v1/customer/search/initial-screen
//   - GET  /api/v1/customer/search/context
//   - GET  /api/v1/customer/search
//   - GET  /api/v1/customer/search/suggestions
//   - GET  /api/v1/customer/search/popular
//   - GET  /api/v1/customer/search/trending
//   - GET  /api/v1/customer/search/failed
//   - POST /api/v1/customer/search/track-click
//   - GET  /api/v1/customer/search/history (requires auth)
//   - POST /api/v1/customer/search/history/clear (requires auth)
//   - GET  /api/v1/customer/search/analytics
//   - GET  /api/v1/customer/search/collections/trending
//   - POST /api/v1/customer/search/collections/track-view

// =============================================================================
// SHARED/PUBLIC ROUTES
// =============================================================================

/**
 * @route GET /api/v1/customer/shared/wishlist/:token
 * @desc Get shared wishlist by token
 * @access Public
 * @param {string} token - Share token
 */
router.get('/shared/wishlist/:token', getSharedWishlist);

// =============================================================================
// ADMIN ROUTES (Analytics & Moderation)
// =============================================================================

/**
 * @route GET /api/v1/customer/admin/analytics/dashboard
 * @desc Get dashboard analytics
 * @access Admin
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/analytics/dashboard', requireAdmin, getDashboardAnalytics);

/**
 * @route GET /api/v1/customer/admin/analytics/products
 * @desc Get product analytics
 * @access Admin
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/analytics/products', requireAdmin, getProductAnalytics);

/**
 * @route GET /api/v1/customer/admin/analytics/users
 * @desc Get user behavior analytics
 * @access Admin
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/analytics/users', requireAdmin, getUserBehaviorAnalytics);

/**
 * @route GET /api/v1/customer/admin/analytics/revenue
 * @desc Get revenue analytics
 * @access Admin
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/analytics/revenue', requireAdmin, getRevenueAnalytics);

/**
 * @route GET /api/v1/customer/admin/analytics/inventory
 * @desc Get inventory analytics
 * @access Admin
 */
router.get('/admin/analytics/inventory', requireAdmin, getInventoryAnalytics);

/**
 * @route GET /api/v1/customer/admin/analytics/search
 * @desc Get search analytics (now via TSOA at /api/v1/customer/search/analytics)
 * @access Admin
 */
// Deprecated: Use TSOA route at /api/v1/customer/search/analytics

/**
 * @route GET /api/v1/customer/admin/search/failed
 * @desc Get failed searches (now via TSOA at /api/v1/customer/search/failed)
 * @access Admin
 */
// Deprecated: Use TSOA route at /api/v1/customer/search/failed

/**
 * @route GET /api/v1/customer/admin/reviews/:productId/analytics
 * @desc Get review analytics for a product
 * @access Admin
 * @param {string} productId - Product ID
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/reviews/:productId/analytics', 
  validateObjectId('productId'), 
  requireAdmin, 
  getReviewAnalytics
);

/**
 * @route POST /api/v1/customer/admin/reviews/:reviewId/moderate
 * @desc Moderate a review (approve/reject/spam)
 * @access Admin
 * @param {string} reviewId - Review ID
 * @body {string} action - Moderation action ('approve', 'reject', 'spam')
 * @body {string} adminNotes - Admin notes (optional)
 * @body {string} response - Admin response (optional, for approved reviews)
 */
router.post('/admin/reviews/:reviewId/moderate', 
  validateObjectId('reviewId'), 
  requireAdmin, 
  moderateReview
);

/**
 * @route PUT /api/v1/customer/admin/orders/:orderId/status
 * @desc Update order status (admin)
 * @access Admin
 * @param {string} orderId - Order ID
 * @body {string} status - New status (required)
 * @body {string} note - Status update note (optional)
 * @body {string} location - Location info (optional)
 */
router.put('/admin/orders/:orderId/status', 
  validateObjectId('orderId'), 
  requireAdmin, 
  updateOrderStatus
);

export default router;