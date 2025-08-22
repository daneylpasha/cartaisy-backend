"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
// Wishlist controllers
const wishlistController_1 = require("../controllers/wishlistController");
// Review controllers
const reviewController_1 = require("../controllers/reviewController");
// Order controllers
const orderController_1 = require("../controllers/orderController");
// Search controllers
const searchController_1 = require("../controllers/searchController");
// Analytics controllers
const analyticsController_1 = require("../controllers/analyticsController");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const router = express_1.default.Router();
// =============================================================================
// WISHLIST ROUTES
// =============================================================================
/**
 * @route GET /api/v1/customer/wishlists
 * @desc Get user's wishlists
 * @access Private
 */
router.get('/wishlists', auth_1.requireAuth, wishlistController_1.getUserWishlists);
/**
 * @route POST /api/v1/customer/wishlists
 * @desc Create a new wishlist
 * @access Private
 * @body {string} name - Wishlist name (required)
 * @body {string} description - Wishlist description (optional)
 * @body {boolean} isPrivate - Privacy setting (default: true)
 * @body {string} color - Theme color (default: #E91E63)
 */
router.post('/wishlists', auth_1.requireAuth, wishlistController_1.createWishlist);
/**
 * @route GET /api/v1/customer/wishlists/:wishlistId
 * @desc Get specific wishlist with items
 * @access Private
 * @param {string} wishlistId - Wishlist ID
 */
router.get('/wishlists/:wishlistId', (0, validation_1.validateObjectId)('wishlistId'), auth_1.requireAuth, wishlistController_1.getWishlist);
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
router.put('/wishlists/:wishlistId', (0, validation_1.validateObjectId)('wishlistId'), auth_1.requireAuth, wishlistController_1.updateWishlist);
/**
 * @route DELETE /api/v1/customer/wishlists/:wishlistId
 * @desc Delete a wishlist
 * @access Private
 * @param {string} wishlistId - Wishlist ID
 */
router.delete('/wishlists/:wishlistId', (0, validation_1.validateObjectId)('wishlistId'), auth_1.requireAuth, wishlistController_1.deleteWishlist);
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
router.post('/wishlists/:wishlistId/items', auth_1.requireAuth, wishlistController_1.addToWishlist);
/**
 * @route DELETE /api/v1/customer/wishlists/:wishlistId/items/:productId
 * @desc Remove product from wishlist
 * @access Private
 * @param {string} wishlistId - Wishlist ID
 * @param {string} productId - Product ID
 * @query {string} variantId - Product variant ID (optional)
 */
router.delete('/wishlists/:wishlistId/items/:productId', (0, validation_1.validateObjectId)('wishlistId'), (0, validation_1.validateObjectId)('productId'), auth_1.requireAuth, wishlistController_1.removeFromWishlist);
/**
 * @route GET /api/v1/customer/wishlists/check/:productId
 * @desc Check if product is in any wishlist
 * @access Private
 * @param {string} productId - Product ID
 * @query {string} variantId - Product variant ID (optional)
 */
router.get('/wishlists/check/:productId', (0, validation_1.validateObjectId)('productId'), auth_1.requireAuth, wishlistController_1.checkWishlistStatus);
/**
 * @route POST /api/v1/customer/wishlists/:wishlistId/share
 * @desc Share wishlist with others
 * @access Private
 * @param {string} wishlistId - Wishlist ID
 * @body {boolean} isPublic - Make publicly accessible (default: false)
 * @body {string[]} emails - Email addresses to share with (optional)
 * @body {number} expiresInDays - Expiration in days (optional)
 */
router.post('/wishlists/:wishlistId/share', (0, validation_1.validateObjectId)('wishlistId'), auth_1.requireAuth, wishlistController_1.shareWishlist);
/**
 * @route POST /api/v1/customer/wishlists/:sourceWishlistId/move/:targetWishlistId
 * @desc Move item between wishlists
 * @access Private
 * @param {string} sourceWishlistId - Source wishlist ID
 * @param {string} targetWishlistId - Target wishlist ID
 * @body {string} productId - Product ID (required)
 * @body {string} variantId - Product variant ID (optional)
 */
router.post('/wishlists/:sourceWishlistId/move/:targetWishlistId', (0, validation_1.validateObjectId)('sourceWishlistId'), (0, validation_1.validateObjectId)('targetWishlistId'), auth_1.requireAuth, wishlistController_1.moveItemBetweenWishlists);
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
router.post('/reviews', auth_1.requireAuth, reviewController_1.createReview);
/**
 * @route GET /api/v1/customer/reviews
 * @desc Get user's reviews
 * @access Private
 * @query {string} page - Page number (default: 1)
 * @query {string} limit - Items per page (default: 10)
 * @query {string} status - Filter by status (all, pending, approved, rejected)
 */
router.get('/reviews', auth_1.requireAuth, reviewController_1.getUserReviews);
/**
 * @route GET /api/v1/customer/reviews/:reviewId
 * @desc Get specific review
 * @access Private
 * @param {string} reviewId - Review ID
 */
router.get('/reviews/:reviewId', (0, validation_1.validateObjectId)('reviewId'), auth_1.requireAuth, reviewController_1.getReview);
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
router.put('/reviews/:reviewId', (0, validation_1.validateObjectId)('reviewId'), auth_1.requireAuth, reviewController_1.updateReview);
/**
 * @route DELETE /api/v1/customer/reviews/:reviewId
 * @desc Delete a review
 * @access Private
 * @param {string} reviewId - Review ID
 */
router.delete('/reviews/:reviewId', (0, validation_1.validateObjectId)('reviewId'), auth_1.requireAuth, reviewController_1.deleteReview);
/**
 * @route POST /api/v1/customer/reviews/:reviewId/vote
 * @desc Vote on a review (helpful/not helpful)
 * @access Private
 * @param {string} reviewId - Review ID
 * @body {string} voteType - Vote type ('helpful' or 'not_helpful')
 */
router.post('/reviews/:reviewId/vote', (0, validation_1.validateObjectId)('reviewId'), auth_1.requireAuth, reviewController_1.voteOnReview);
/**
 * @route POST /api/v1/customer/reviews/:reviewId/report
 * @desc Report a review
 * @access Private
 * @param {string} reviewId - Review ID
 * @body {string} reason - Report reason (required)
 * @body {string} description - Additional description (optional)
 */
router.post('/reviews/:reviewId/report', (0, validation_1.validateObjectId)('reviewId'), auth_1.requireAuth, reviewController_1.reportReview);
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
router.get('/orders', auth_1.requireAuth, orderController_1.getUserOrders);
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
router.post('/orders', auth_1.requireAuth, orderController_1.createOrder);
/**
 * @route GET /api/v1/customer/orders/:orderId
 * @desc Get specific order details
 * @access Private
 * @param {string} orderId - Order ID
 */
router.get('/orders/:orderId', (0, validation_1.validateObjectId)('orderId'), auth_1.requireAuth, orderController_1.getOrder);
/**
 * @route POST /api/v1/customer/orders/:orderId/cancel
 * @desc Cancel an order
 * @access Private
 * @param {string} orderId - Order ID
 * @body {string} reason - Cancellation reason (optional)
 */
router.post('/orders/:orderId/cancel', (0, validation_1.validateObjectId)('orderId'), auth_1.requireAuth, orderController_1.cancelOrder);
/**
 * @route POST /api/v1/customer/orders/:orderId/return
 * @desc Request order return/exchange
 * @access Private
 * @param {string} orderId - Order ID
 * @body {string} type - Return type ('return' or 'exchange')
 * @body {string} reason - Return reason (required)
 * @body {object[]} items - Items to return (required)
 */
router.post('/orders/:orderId/return', (0, validation_1.validateObjectId)('orderId'), auth_1.requireAuth, orderController_1.requestReturn);
/**
 * @route GET /api/v1/customer/orders/:orderId/tracking
 * @desc Get order tracking information
 * @access Private
 * @param {string} orderId - Order ID
 */
router.get('/orders/:orderId/tracking', (0, validation_1.validateObjectId)('orderId'), auth_1.requireAuth, orderController_1.getOrderTracking);
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
router.post('/orders/:orderId/rate', (0, validation_1.validateObjectId)('orderId'), auth_1.requireAuth, orderController_1.rateOrder);
/**
 * @route POST /api/v1/customer/orders/:orderId/support
 * @desc Create support ticket for order
 * @access Private
 * @param {string} orderId - Order ID
 * @body {string} subject - Ticket subject (required)
 * @body {string} priority - Ticket priority (low, medium, high, urgent)
 */
router.post('/orders/:orderId/support', (0, validation_1.validateObjectId)('orderId'), auth_1.requireAuth, orderController_1.createSupportTicket);
/**
 * @route GET /api/v1/customer/orders/analytics
 * @desc Get user's order analytics
 * @access Private
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/orders/analytics', auth_1.requireAuth, orderController_1.getOrderAnalytics);
// =============================================================================
// SEARCH ROUTES
// =============================================================================
/**
 * @route GET /api/v1/customer/search
 * @desc Search products with advanced filtering
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
 * @query {string} sortBy - Sort order (relevance, price_low, price_high, rating, popular, newest)
 */
router.get('/search', auth_1.optionalAuth, searchController_1.search);
/**
 * @route GET /api/v1/customer/search/suggestions
 * @desc Get search suggestions
 * @access Public
 * @query {string} q - Partial search query (required, min 2 chars)
 * @query {string} limit - Number of suggestions (default: 10)
 */
router.get('/search/suggestions', searchController_1.getSearchSuggestions);
/**
 * @route GET /api/v1/customer/search/popular
 * @desc Get popular searches
 * @access Public
 * @query {string} limit - Number of searches (default: 10)
 * @query {string} days - Time period in days (default: 30)
 */
router.get('/search/popular', searchController_1.getPopularSearches);
/**
 * @route GET /api/v1/customer/search/trending
 * @desc Get trending searches
 * @access Public
 * @query {string} limit - Number of searches (default: 10)
 */
router.get('/search/trending', searchController_1.getTrendingSearches);
/**
 * @route POST /api/v1/customer/search/track-click
 * @desc Track search result click
 * @access Public
 * @body {string} searchId - Search record ID (required)
 * @body {string} productId - Clicked product ID (required)
 * @body {number} position - Click position in results (optional)
 */
router.post('/search/track-click', searchController_1.trackSearchClick);
/**
 * @route GET /api/v1/customer/search/history
 * @desc Get user's search history
 * @access Private
 * @query {string} limit - Number of searches (default: 20)
 */
router.get('/search/history', auth_1.requireAuth, searchController_1.getUserSearchHistory);
/**
 * @route DELETE /api/v1/customer/search/history
 * @desc Clear user's search history
 * @access Private
 */
router.delete('/search/history', auth_1.requireAuth, searchController_1.clearUserSearchHistory);
// =============================================================================
// SHARED/PUBLIC ROUTES
// =============================================================================
/**
 * @route GET /api/v1/customer/shared/wishlist/:token
 * @desc Get shared wishlist by token
 * @access Public
 * @param {string} token - Share token
 */
router.get('/shared/wishlist/:token', wishlistController_1.getSharedWishlist);
// =============================================================================
// ADMIN ROUTES (Analytics & Moderation)
// =============================================================================
/**
 * @route GET /api/v1/customer/admin/analytics/dashboard
 * @desc Get dashboard analytics
 * @access Admin
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/analytics/dashboard', auth_1.requireAdmin, analyticsController_1.getDashboardAnalytics);
/**
 * @route GET /api/v1/customer/admin/analytics/products
 * @desc Get product analytics
 * @access Admin
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/analytics/products', auth_1.requireAdmin, analyticsController_1.getProductAnalytics);
/**
 * @route GET /api/v1/customer/admin/analytics/users
 * @desc Get user behavior analytics
 * @access Admin
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/analytics/users', auth_1.requireAdmin, analyticsController_1.getUserBehaviorAnalytics);
/**
 * @route GET /api/v1/customer/admin/analytics/revenue
 * @desc Get revenue analytics
 * @access Admin
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/analytics/revenue', auth_1.requireAdmin, analyticsController_1.getRevenueAnalytics);
/**
 * @route GET /api/v1/customer/admin/analytics/inventory
 * @desc Get inventory analytics
 * @access Admin
 */
router.get('/admin/analytics/inventory', auth_1.requireAdmin, analyticsController_1.getInventoryAnalytics);
/**
 * @route GET /api/v1/customer/admin/analytics/search
 * @desc Get search analytics
 * @access Admin
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/analytics/search', auth_1.requireAdmin, searchController_1.getSearchAnalytics);
/**
 * @route GET /api/v1/customer/admin/search/failed
 * @desc Get failed searches for optimization
 * @access Admin
 * @query {string} limit - Number of searches (default: 10)
 * @query {string} days - Time period in days (default: 7)
 */
router.get('/admin/search/failed', auth_1.requireAdmin, searchController_1.getFailedSearches);
/**
 * @route GET /api/v1/customer/admin/reviews/:productId/analytics
 * @desc Get review analytics for a product
 * @access Admin
 * @param {string} productId - Product ID
 * @query {string} timeframe - Timeframe in days (default: 30)
 */
router.get('/admin/reviews/:productId/analytics', (0, validation_1.validateObjectId)('productId'), auth_1.requireAdmin, reviewController_1.getReviewAnalytics);
/**
 * @route POST /api/v1/customer/admin/reviews/:reviewId/moderate
 * @desc Moderate a review (approve/reject/spam)
 * @access Admin
 * @param {string} reviewId - Review ID
 * @body {string} action - Moderation action ('approve', 'reject', 'spam')
 * @body {string} adminNotes - Admin notes (optional)
 * @body {string} response - Admin response (optional, for approved reviews)
 */
router.post('/admin/reviews/:reviewId/moderate', (0, validation_1.validateObjectId)('reviewId'), auth_1.requireAdmin, reviewController_1.moderateReview);
/**
 * @route PUT /api/v1/customer/admin/orders/:orderId/status
 * @desc Update order status (admin)
 * @access Admin
 * @param {string} orderId - Order ID
 * @body {string} status - New status (required)
 * @body {string} note - Status update note (optional)
 * @body {string} location - Location info (optional)
 */
router.put('/admin/orders/:orderId/status', (0, validation_1.validateObjectId)('orderId'), auth_1.requireAdmin, orderController_1.updateOrderStatus);
exports.default = router;
//# sourceMappingURL=customerRoutes.js.map