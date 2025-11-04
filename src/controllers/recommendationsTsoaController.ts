import { Get, Post, Route, Tags, Response, Path, Body, Query } from 'tsoa';
import { Controller } from '@tsoa/runtime';
import { getProductRecommendations, getCartRecommendations } from '../services/recommendationsService';
import {
  ProductRecommendationsResponse,
  CartRecommendationsResponse,
  CartRecommendationsRequest,
} from '../types/api/recommendations';

/**
 * Recommendations Controller
 *
 * Provides product recommendation endpoints powered by Shopify's Recommendations API
 * for Product Detail Pages (PDP) and Shopping Cart screens.
 */
@Route('recommendations')
@Tags('Recommendations')
export class RecommendationsController extends Controller {
  /**
   * Get product recommendations for Product Detail Page (PDP)
   *
   * Returns recommended products based on a specific Shopify product ID.
   * Uses Shopify's native recommendations algorithm with smart fallback to
   * category and tag-based matching when Shopify API is unavailable.
   *
   * @param shopifyProductId - Shopify product ID (e.g., "14819881320820")
   * @param limit - Number of recommendations to return (default: 6, max: 50)
   * @returns Product recommendations with full product data
   *
   * @example shopifyProductId "14819881320820"
   * @example limit 6
   */
  @Get('product/{shopifyProductId}')
  @Response<{ success: false; error: string }>(400, 'Bad Request - Invalid parameters')
  @Response<{ success: false; error: string }>(500, 'Internal Server Error')
  public async getProductRecommendations(
    @Path() shopifyProductId: string,
    @Query() limit: number = 6
  ): Promise<ProductRecommendationsResponse> {
    try {
      // Validate shopifyProductId
      if (!shopifyProductId || shopifyProductId.trim() === '') {
        this.setStatus(400);
        return {
          success: false,
          error: 'Shopify Product ID is required',
          data: {
            recommendedProducts: [],
            basedOn: 'product',
            sourceProductId: shopifyProductId,
            count: 0,
          },
        };
      }

      // Validate limit
      const limitNum = Number(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
        this.setStatus(400);
        return {
          success: false,
          error: 'Limit must be a number between 1 and 50',
          data: {
            recommendedProducts: [],
            basedOn: 'product',
            sourceProductId: shopifyProductId,
            count: 0,
          },
        };
      }

      // Fetch recommendations
      const recommendations = await getProductRecommendations(shopifyProductId, limitNum);

      return {
        success: true,
        data: {
          recommendedProducts: recommendations,
          basedOn: 'product',
          sourceProductId: shopifyProductId,
          count: recommendations.length,
        },
      };
    } catch (error) {
      console.error('Error in getProductRecommendations:', error);
      this.setStatus(500);
      return {
        success: false,
        error: 'Failed to fetch product recommendations',
        data: {
          recommendedProducts: [],
          basedOn: 'product',
          sourceProductId: shopifyProductId,
          count: 0,
        },
      };
    }
  }

  /**
   * Get cart-based recommendations
   *
   * Returns recommended products based on items currently in the shopping cart.
   * Aggregates recommendations from multiple cart items and ranks them by frequency
   * to show products that complement the entire cart contents.
   *
   * @param limit - Number of recommendations to return (default: 6, max: 50)
   * @param requestBody - Cart items with Shopify product IDs
   * @returns Cart recommendations with full product data
   *
   * @example requestBody { "cartItems": ["14819881320820", "14819881320821"] }
   * @example limit 6
   */
  @Post('cart')
  @Response<{ success: false; error: string }>(400, 'Bad Request - Invalid cart items')
  @Response<{ success: false; error: string }>(500, 'Internal Server Error')
  public async getCartRecommendations(
    @Body() requestBody: CartRecommendationsRequest,
    @Query() limit: number = 6
  ): Promise<CartRecommendationsResponse> {
    try {
      const { cartItems } = requestBody;

      // Validate limit
      const limitNum = Number(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
        this.setStatus(400);
        return {
          success: false,
          error: 'Limit must be a number between 1 and 50',
          data: {
            recommendedProducts: [],
            basedOn: 'cart',
            cartItemsCount: 0,
            count: 0,
          },
        };
      }

      // Validate cart items
      if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        this.setStatus(400);
        return {
          success: false,
          error: 'Cart items array is required and must not be empty',
          data: {
            recommendedProducts: [],
            basedOn: 'cart',
            cartItemsCount: 0,
            count: 0,
          },
        };
      }

      // Filter valid cart items (strings)
      const validCartItems = cartItems.filter((id) => typeof id === 'string' && id.length > 0);

      if (validCartItems.length === 0) {
        this.setStatus(400);
        return {
          success: false,
          error: 'No valid product IDs provided in cart items',
          data: {
            recommendedProducts: [],
            basedOn: 'cart',
            cartItemsCount: 0,
            count: 0,
          },
        };
      }

      // Fetch recommendations
      const recommendations = await getCartRecommendations(validCartItems, limitNum);

      return {
        success: true,
        data: {
          recommendedProducts: recommendations,
          basedOn: 'cart',
          cartItemsCount: validCartItems.length,
          count: recommendations.length,
        },
      };
    } catch (error) {
      console.error('Error in getCartRecommendations:', error);
      this.setStatus(500);
      return {
        success: false,
        error: 'Failed to fetch cart recommendations',
        data: {
          recommendedProducts: [],
          basedOn: 'cart',
          cartItemsCount: 0,
          count: 0,
        },
      };
    }
  }
}
