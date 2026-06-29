import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { getProductRecommendations, getCartRecommendations } from '../services/recommendationsService';
import { ApiError } from '../utils/errors';
import { getStoreIdFromRequest } from '../middleware/storeAuth';

/**
 * Recommendations Controller
 *
 * Handles product recommendation requests for:
 * - Product Detail Page (PDP)
 * - Cart Screen
 */

/**
 * Get product recommendations for PDP
 * GET /api/v1/recommendations/product/:shopifyProductId?limit=6
 *
 * @param shopifyProductId - Shopify product ID (e.g., "14819881320820")
 */
export const getProductRecommendationsController = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { shopifyProductId } = req.params;
    const { limit = '6' } = req.query;

    // Validate shopifyProductId
    if (!shopifyProductId) {
      throw new ApiError('Shopify Product ID is required', 400);
    }

    // Parse and validate limit
    const limitNum = parseInt(limit as string, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      throw new ApiError('Limit must be a number between 1 and 50', 400);
    }

    const storeId = getStoreIdFromRequest(req as AuthenticatedRequest);

    // Fetch recommendations from Shopify
    const recommendations = await getProductRecommendations(shopifyProductId, limitNum, { storeId });

    return res.status(200).json({
      success: true,
      data: {
        recommendedProducts: recommendations,
        basedOn: 'product',
        sourceProductId: shopifyProductId,
        count: recommendations.length
      }
    });
  } catch (error) {
    console.error('Error in getProductRecommendationsController:', error);

    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch product recommendations'
    });
  }
};

/**
 * Get cart-based recommendations
 * POST /api/v1/recommendations/cart?limit=6
 *
 * Body (for unauthenticated users):
 * {
 *   "cartItems": ["productId1", "productId2", "productId3"]
 * }
 *
 * For authenticated users, can also use cart from session/user
 */
export const getCartRecommendationsController = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<Response> => {
  try {
    const { limit = '6' } = req.query as { limit?: string };
    const body = req.body as { cartItems?: string[] } || {};
    const { cartItems } = body;

    // Parse and validate limit
    const limitNum = parseInt(limit as string, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      throw new ApiError('Limit must be a number between 1 and 50', 400);
    }

    // Get cart items from request body
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      throw new ApiError('Cart items array is required and must not be empty', 400);
    }

    // Validate cart items are strings
    const validCartItems = cartItems.filter(id => typeof id === 'string' && id.length > 0);

    if (validCartItems.length === 0) {
      throw new ApiError('No valid product IDs provided in cart items', 400);
    }

    const storeId = getStoreIdFromRequest(req as AuthenticatedRequest);

    // Fetch recommendations
    const recommendations = await getCartRecommendations(validCartItems, limitNum, { storeId });

    return res.status(200).json({
      success: true,
      data: {
        recommendedProducts: recommendations,
        basedOn: 'cart',
        cartItemsCount: validCartItems.length,
        count: recommendations.length
      }
    });
  } catch (error) {
    console.error('Error in getCartRecommendationsController:', error);

    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch cart recommendations'
    });
  }
};
