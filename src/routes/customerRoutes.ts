import express from 'express';
import { homescreenController } from '../controllers/homescreenController';

// Customer Wishlist controllers (uses Customer model, not User)
import {
  getWishlists as getCustomerWishlists,
  getWishlist as getCustomerWishlist,
  createWishlist as createCustomerWishlist,
  updateWishlist as updateCustomerWishlist,
  deleteWishlist as deleteCustomerWishlist,
  addItemToWishlist,
  removeItemFromWishlist,
  checkProductInWishlist,
  shareWishlist as shareCustomerWishlist,
  moveItemsBetweenWishlists
} from '../controllers/customerWishlistController';

// User Wishlist controllers (for shared wishlist - public endpoint)
import { getSharedWishlist } from '../controllers/wishlistController';

// Customer Review controllers (uses Customer model, not User)
import {
  createReview as createCustomerReview,
  getReviews as getCustomerReviews,
  getReview as getCustomerReview,
  updateReview as updateCustomerReview,
  deleteReview as deleteCustomerReview,
  voteReview as voteCustomerReview,
  reportReview as reportCustomerReview
} from '../controllers/customerReviewController';

// Admin Review controllers (for moderation - uses User/Admin model)
import {
  getReviewAnalytics,
  moderateReview
} from '../controllers/reviewController';

// Customer Product controllers (uses Customer model, not User)
import {
  getRecommendations as getCustomerRecommendations,
  trackProductView as trackCustomerProductView,
  getRecentlyViewed as getCustomerRecentlyViewed,
  clearViewHistory as clearCustomerViewHistory
} from '../controllers/customerProductController';

// Customer Order controllers (uses Customer model, not User)
import {
  getOrders as getCustomerOrders,
  getOrder as getCustomerOrder,
  createOrder as createCustomerOrder,
  cancelOrder as cancelCustomerOrder,
  returnOrder as returnCustomerOrder,
  getOrderTracking as getCustomerOrderTracking,
  rateOrder as rateCustomerOrder,
  createSupportTicket as createCustomerSupportTicket,
  getOrderAnalytics as getCustomerOrderAnalytics
} from '../controllers/customerOrderController';

// User Order controller (for admin operations)
import { updateOrderStatus } from '../controllers/orderController';

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

// Data Export controllers (GDPR compliance)
import {
  requestDataExport,
  getDataExportStatus,
  getDataExportHistory,
  downloadDataExport
} from '../controllers/dataExportController';

import { requireAuth, optionalAuth, requireAdmin } from '../middleware/auth';
import { validateObjectId } from '../middleware/validation';
import { storeAuth } from '../middleware/storeAuth';
import { authenticateCustomer } from '../middleware/customerAuth';

const router = express.Router();

// =============================================================================
// HOMESCREEN ROUTE
// =============================================================================

/**
 * GET /api/v1/customer/homescreen
 * Get all homescreen data including carousel items
 * Includes layout array indicating display order from dashboard configuration
 *
 * PUBLIC ENDPOINT - No authentication required
 * Requires X-Store-ID header or storeId query parameter
 */
router.get('/homescreen', homescreenController.getHomescreenData);

// Individual homescreen component endpoints for selective updates
// These can be uncommented and implemented as needed:
// router.get('/homescreen/carousel', homescreenController.getCarouselOnly);
// router.get('/homescreen/featured', homescreenController.getFeaturedOnly);
// router.get('/homescreen/categories', homescreenController.getCategoriesOnly);

// =============================================================================
// WISHLIST ROUTES (Customer - uses authenticateCustomer middleware)
// =============================================================================

/**
 * @route GET /api/v1/customer/wishlists
 * @desc Get customer's wishlists
 * @access Private (Customer)
 */
router.get('/wishlists', authenticateCustomer, getCustomerWishlists as any);

/**
 * @route POST /api/v1/customer/wishlists
 * @desc Create a new wishlist
 * @access Private (Customer)
 * @body {string} name - Wishlist name (required)
 * @body {string} description - Wishlist description (optional)
 * @body {boolean} isPrivate - Privacy setting (default: true)
 * @body {string} color - Theme color (default: #E91E63)
 */
router.post('/wishlists', authenticateCustomer, createCustomerWishlist as any);

/**
 * @route GET /api/v1/customer/wishlists/check/:productId
 * @desc Check if product is in any wishlist
 * @access Private (Customer)
 * @param {string} productId - Product ID
 * @query {string} variantId - Product variant ID (optional)
 */
router.get('/wishlists/check/:productId',
  validateObjectId('productId'),
  authenticateCustomer,
  checkProductInWishlist as any
);

/**
 * @route GET /api/v1/customer/wishlists/:wishlistId
 * @desc Get specific wishlist with items
 * @access Private (Customer)
 * @param {string} wishlistId - Wishlist ID
 */
router.get('/wishlists/:wishlistId', validateObjectId('wishlistId'), authenticateCustomer, getCustomerWishlist as any);

/**
 * @route PUT /api/v1/customer/wishlists/:wishlistId
 * @desc Update wishlist details
 * @access Private (Customer)
 * @param {string} wishlistId - Wishlist ID
 * @body {string} name - Wishlist name
 * @body {string} description - Wishlist description
 * @body {boolean} isPrivate - Privacy setting
 * @body {string} color - Theme color
 * @body {boolean} isDefault - Default wishlist flag
 */
router.put('/wishlists/:wishlistId', validateObjectId('wishlistId'), authenticateCustomer, updateCustomerWishlist as any);

/**
 * @route DELETE /api/v1/customer/wishlists/:wishlistId
 * @desc Delete a wishlist
 * @access Private (Customer)
 * @param {string} wishlistId - Wishlist ID
 */
router.delete('/wishlists/:wishlistId', validateObjectId('wishlistId'), authenticateCustomer, deleteCustomerWishlist as any);

/**
 * @route POST /api/v1/customer/wishlists/:wishlistId/items
 * @desc Add product to wishlist
 * @access Private (Customer)
 * @param {string} wishlistId - Wishlist ID (or 'default' for default wishlist)
 * @body {string} productId - Product ID (required)
 * @body {string} variantId - Product variant ID (optional)
 * @body {string} notes - Personal notes (optional)
 * @body {number} priority - Priority level 1-5 (default: 3)
 */
router.post('/wishlists/:wishlistId/items', authenticateCustomer, addItemToWishlist as any);

/**
 * @route DELETE /api/v1/customer/wishlists/:wishlistId/items/:productId
 * @desc Remove product from wishlist
 * @access Private (Customer)
 * @param {string} wishlistId - Wishlist ID
 * @param {string} productId - Product ID
 * @query {string} variantId - Product variant ID (optional)
 */
router.delete('/wishlists/:wishlistId/items/:productId',
  validateObjectId('wishlistId'),
  validateObjectId('productId'),
  authenticateCustomer,
  removeItemFromWishlist as any
);

/**
 * @route POST /api/v1/customer/wishlists/:wishlistId/share
 * @desc Share wishlist with others
 * @access Private (Customer)
 * @param {string} wishlistId - Wishlist ID
 * @body {boolean} isPublic - Make publicly accessible (default: false)
 * @body {string[]} emails - Email addresses to share with (optional)
 * @body {number} expiresInDays - Expiration in days (optional)
 */
router.post('/wishlists/:wishlistId/share',
  validateObjectId('wishlistId'),
  authenticateCustomer,
  shareCustomerWishlist as any
);

/**
 * @route POST /api/v1/customer/wishlists/:sourceWishlistId/move/:targetWishlistId
 * @desc Move items between wishlists
 * @access Private (Customer)
 * @param {string} sourceWishlistId - Source wishlist ID
 * @param {string} targetWishlistId - Target wishlist ID
 * @body {string} productId - Product ID (required) or {string[]} productIds - Array of product IDs
 * @body {string} variantId - Product variant ID (optional)
 */
router.post('/wishlists/:sourceWishlistId/move/:targetWishlistId',
  validateObjectId('sourceWishlistId'),
  validateObjectId('targetWishlistId'),
  authenticateCustomer,
  moveItemsBetweenWishlists as any
);

// =============================================================================
// REVIEW ROUTES (Customer - uses authenticateCustomer middleware)
// =============================================================================

/**
 * @route POST /api/v1/customer/reviews
 * @desc Create a product review
 * @access Private (Customer)
 * @body {string} productId - Product ID (required)
 * @body {number} rating - Rating 1-5 (required)
 * @body {string} comment - Review text (required) - also accepts 'reviewText'
 * @body {string} title - Review title (optional)
 * @body {string[]} images - Review images (optional)
 * @body {boolean} wouldRecommend - Recommendation flag (optional)
 */
router.post('/reviews', authenticateCustomer, createCustomerReview as any);

/**
 * @route GET /api/v1/customer/reviews
 * @desc Get customer's reviews
 * @access Private (Customer)
 * @query {string} page - Page number (default: 1)
 * @query {string} limit - Items per page (default: 20)
 * @query {string} status - Filter by status (all, pending, approved, rejected)
 */
router.get('/reviews', authenticateCustomer, getCustomerReviews as any);

/**
 * @route GET /api/v1/customer/reviews/:reviewId
 * @desc Get specific review
 * @access Private (Customer)
 * @param {string} reviewId - Review ID
 */
router.get('/reviews/:reviewId', validateObjectId('reviewId'), authenticateCustomer, getCustomerReview as any);

/**
 * @route PUT /api/v1/customer/reviews/:reviewId
 * @desc Update a review (within 30-day edit window)
 * @access Private (Customer)
 * @param {string} reviewId - Review ID
 * @body {number} rating - Rating 1-5
 * @body {string} comment - Review text (also accepts 'reviewText')
 * @body {string} title - Review title
 * @body {string[]} images - Review images
 */
router.put('/reviews/:reviewId', validateObjectId('reviewId'), authenticateCustomer, updateCustomerReview as any);

/**
 * @route DELETE /api/v1/customer/reviews/:reviewId
 * @desc Delete a review
 * @access Private (Customer)
 * @param {string} reviewId - Review ID
 */
router.delete('/reviews/:reviewId', validateObjectId('reviewId'), authenticateCustomer, deleteCustomerReview as any);

/**
 * @route POST /api/v1/customer/reviews/:reviewId/vote
 * @desc Vote on a review (helpful/not helpful)
 * @access Private (Customer)
 * @param {string} reviewId - Review ID
 * @body {string} voteType - Vote type ('helpful' or 'not-helpful')
 */
router.post('/reviews/:reviewId/vote', validateObjectId('reviewId'), authenticateCustomer, voteCustomerReview as any);

/**
 * @route POST /api/v1/customer/reviews/:reviewId/report
 * @desc Report a review
 * @access Private (Customer)
 * @param {string} reviewId - Review ID
 * @body {string} reason - Report reason (spam, offensive, fake, inappropriate, other)
 * @body {string} details - Additional details (optional)
 */
router.post('/reviews/:reviewId/report', validateObjectId('reviewId'), authenticateCustomer, reportCustomerReview as any);

// =============================================================================
// ORDER ROUTES (Customer - uses authenticateCustomer middleware)
// =============================================================================

/**
 * @route GET /api/v1/customer/orders/analytics
 * @desc Get customer's order analytics
 * @access Private (Customer)
 * @query {string} timeframe - Timeframe in days (default: 365)
 */
router.get('/orders/analytics', authenticateCustomer, getCustomerOrderAnalytics as any);

/**
 * @route GET /api/v1/customer/orders
 * @desc Get customer's orders
 * @access Private (Customer)
 * @query {string} page - Page number (default: 1)
 * @query {string} limit - Items per page (default: 20)
 * @query {string} status - Filter by status
 * @query {string} startDate - Start date filter (ISO string)
 * @query {string} endDate - End date filter (ISO string)
 */
router.get('/orders', authenticateCustomer, getCustomerOrders as any);

/**
 * @route POST /api/v1/customer/orders
 * @desc Create a new order
 * @access Private (Customer)
 * @body {object[]} lineItems - Order items (required)
 * @body {number} shippingAddressId - Index of shipping address in customer's addresses
 * @body {number} billingAddressId - Index of billing address (optional, defaults to shipping)
 * @body {object} shipping - Shipping method and cost (required)
 * @body {string} notes - Special instructions (optional)
 * @body {string} source - Order source (default: 'mobile')
 * @body {string} channel - Order channel (default: 'app')
 */
router.post('/orders', authenticateCustomer, createCustomerOrder as any);

/**
 * @route GET /api/v1/customer/orders/:orderId
 * @desc Get specific order details
 * @access Private (Customer)
 * @param {string} orderId - Order ID
 */
router.get('/orders/:orderId', validateObjectId('orderId'), authenticateCustomer, getCustomerOrder as any);

/**
 * @route POST /api/v1/customer/orders/:orderId/cancel
 * @desc Cancel an order
 * @access Private (Customer)
 * @param {string} orderId - Order ID
 * @body {string} reason - Cancellation reason (optional)
 */
router.post('/orders/:orderId/cancel', validateObjectId('orderId'), authenticateCustomer, cancelCustomerOrder as any);

/**
 * @route POST /api/v1/customer/orders/:orderId/return
 * @desc Request order return/exchange
 * @access Private (Customer)
 * @param {string} orderId - Order ID
 * @body {string} type - Return type ('return' or 'exchange')
 * @body {string} reason - Return reason (required)
 * @body {object[]} items - Items to return (required)
 */
router.post('/orders/:orderId/return', validateObjectId('orderId'), authenticateCustomer, returnCustomerOrder as any);

/**
 * @route GET /api/v1/customer/orders/:orderId/tracking
 * @desc Get order tracking information
 * @access Private (Customer)
 * @param {string} orderId - Order ID
 */
router.get('/orders/:orderId/tracking', validateObjectId('orderId'), authenticateCustomer, getCustomerOrderTracking as any);

/**
 * @route POST /api/v1/customer/orders/:orderId/rate
 * @desc Rate a delivered order
 * @access Private (Customer)
 * @param {string} orderId - Order ID
 * @body {number} rating - Overall rating 1-5 (required)
 * @body {string} review - Review comment (optional)
 * @body {number} deliveryRating - Delivery rating 1-5 (optional)
 * @body {number} packagingRating - Packaging rating 1-5 (optional)
 * @body {number} productQualityRating - Product quality rating 1-5 (optional)
 * @body {number} customerServiceRating - Customer service rating 1-5 (optional)
 */
router.post('/orders/:orderId/rate', validateObjectId('orderId'), authenticateCustomer, rateCustomerOrder as any);

/**
 * @route POST /api/v1/customer/orders/:orderId/support
 * @desc Create support ticket for order
 * @access Private (Customer)
 * @param {string} orderId - Order ID
 * @body {string} subject - Ticket subject (required)
 * @body {string} message - Ticket message (optional)
 * @body {string} priority - Ticket priority (low, medium, high, urgent)
 */
router.post('/orders/:orderId/support', validateObjectId('orderId'), authenticateCustomer, createCustomerSupportTicket as any);

// =============================================================================
// PRODUCT INTERACTION ROUTES (Customer - uses authenticateCustomer middleware)
// =============================================================================

/**
 * @route GET /api/v1/customer/products/recommendations
 * @desc Get personalized product recommendations
 * @access Private (Customer)
 * @query {string} limit - Number of products (default: 10, max: 50)
 * @query {string} type - Recommendation type (general, similar, trending, for_you)
 */
router.get('/products/recommendations', authenticateCustomer, getCustomerRecommendations as any);

/**
 * @route GET /api/v1/customer/products/recently-viewed
 * @desc Get customer's recently viewed products
 * @access Private (Customer)
 * @query {string} limit - Number of products (default: 10, max: 50)
 */
router.get('/products/recently-viewed', authenticateCustomer, getCustomerRecentlyViewed as any);

/**
 * @route DELETE /api/v1/customer/products/view-history
 * @desc Clear customer's view history
 * @access Private (Customer)
 */
router.delete('/products/view-history', authenticateCustomer, clearCustomerViewHistory as any);

/**
 * @route POST /api/v1/customer/products/:productId/track-view
 * @desc Track product view for analytics
 * @access Private (Customer)
 * @param {string} productId - Product ID
 * @body {string} from - View context (search, category, recommendation, direct, related, featured)
 * @body {string} searchQuery - Search query if viewed from search (optional)
 * @body {string} categoryId - Category ID if viewed from category (optional)
 * @body {number} duration - View duration in seconds (optional)
 * @body {number} scrollDepth - Scroll depth percentage (optional)
 */
router.post('/products/:productId/track-view',
  validateObjectId('productId'),
  authenticateCustomer,
  trackCustomerProductView as any
);

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
// DATA EXPORT ROUTES (GDPR Compliance)
// =============================================================================

/**
 * @route POST /api/v1/customer/data-export/request
 * @desc Request a new data export
 * @access Private (Customer)
 * @returns Export data and metadata
 * @rateLimit 1 request per 24 hours
 */
router.post('/data-export/request', authenticateCustomer, requestDataExport as any);

/**
 * @route GET /api/v1/customer/data-export/status
 * @desc Get status of latest export and availability for new request
 * @access Private (Customer)
 */
router.get('/data-export/status', authenticateCustomer, getDataExportStatus as any);

/**
 * @route GET /api/v1/customer/data-export/history
 * @desc Get export request history
 * @access Private (Customer)
 * @query {number} limit - Number of records (default: 10)
 * @query {number} offset - Pagination offset (default: 0)
 */
router.get('/data-export/history', authenticateCustomer, getDataExportHistory as any);

/**
 * @route GET /api/v1/customer/data-export/:exportId/download
 * @desc Download export data as JSON
 * @access Private (Customer)
 * @param {string} exportId - Export ID
 */
router.get('/data-export/:exportId/download',
  validateObjectId('exportId'),
  authenticateCustomer,
  downloadDataExport as any
);

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