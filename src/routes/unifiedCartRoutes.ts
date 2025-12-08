import express from 'express';
import {
  authenticateCart,
  optionalCartAuth,
} from '../middleware/unifiedCartAuth';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  saveGuestCheckoutInfo,
  getSessionInfo,
} from '../controllers/unifiedCartController';

/**
 * Unified Cart Routes
 *
 * These routes work for both authenticated customers and guest users.
 * The middleware automatically detects user type and handles accordingly.
 *
 * Headers:
 * - X-Store-ID: Required (always)
 * - Authorization: Bearer <token>: Optional (if present = registered customer)
 * - X-Session-ID: Optional (if no auth = guest session, returned in response if new)
 * - X-Device-ID: Recommended (for analytics and multi-session tracking)
 *
 * Response includes X-Session-ID header for new guest sessions.
 */

const router = express.Router();

// =============================================================================
// CART ROUTES (Work for both customer and guest)
// =============================================================================

/**
 * @route GET /api/v1/unified-cart
 * @desc Get cart contents
 * @access Private (Customer or Guest Session)
 * @headers X-Store-ID (required), Authorization or X-Session-ID
 * @returns Cart items, item count, and user type
 */
router.get('/', authenticateCart, getCart as any);

/**
 * @route POST /api/v1/unified-cart
 * @desc Add item to cart
 * @access Private (Customer or Guest Session)
 * @headers X-Store-ID (required), Authorization or X-Session-ID
 * @body {string} productId - Product ID (required)
 * @body {string} variantId - Variant ID (optional)
 * @body {number} quantity - Quantity to add (default: 1)
 * @returns Updated cart
 */
router.post('/', authenticateCart, addToCart as any);

/**
 * @route PATCH /api/v1/unified-cart/:itemId
 * @desc Update cart item quantity
 * @access Private (Customer or Guest Session)
 * @headers X-Store-ID (required), Authorization or X-Session-ID
 * @param {string} itemId - Product ID of item to update
 * @body {number} quantity - New quantity (0 to remove)
 * @returns Updated cart
 */
router.patch('/:itemId', authenticateCart, updateCartItem as any);

/**
 * @route DELETE /api/v1/unified-cart/:itemId
 * @desc Remove item from cart
 * @access Private (Customer or Guest Session)
 * @headers X-Store-ID (required), Authorization or X-Session-ID
 * @param {string} itemId - Product ID of item to remove
 * @query {string} variantId - Variant ID (optional, for specific variant)
 * @returns Updated cart
 */
router.delete('/:itemId', authenticateCart, removeFromCart as any);

/**
 * @route DELETE /api/v1/unified-cart
 * @desc Clear entire cart
 * @access Private (Customer or Guest Session)
 * @headers X-Store-ID (required), Authorization or X-Session-ID
 * @returns Empty cart confirmation
 */
router.delete('/', authenticateCart, clearCart as any);

// =============================================================================
// GUEST-SPECIFIC ROUTES
// =============================================================================

/**
 * @route POST /api/v1/unified-cart/guest-checkout-info
 * @desc Save guest checkout information (email, phone, name)
 * @access Guest Session Only
 * @headers X-Store-ID (required), X-Session-ID (required)
 * @body {string} email - Guest email (required)
 * @body {string} phone - Guest phone (optional)
 * @body {string} fullName - Guest full name (required)
 * @returns Saved guest checkout info
 */
router.post('/guest-checkout-info', authenticateCart, saveGuestCheckoutInfo as any);

// =============================================================================
// SESSION INFO ROUTES
// =============================================================================

/**
 * @route GET /api/v1/unified-cart/session-info
 * @desc Get current session information
 * @access Public (with optional auth)
 * @headers X-Store-ID (required), Authorization or X-Session-ID (optional)
 * @returns Session type, user info, cart item count
 */
router.get('/session-info', optionalCartAuth, getSessionInfo as any);

export default router;
