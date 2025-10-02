import { Get, Post, Delete, Route, Tags, Response, Body, Security, Request } from 'tsoa';
import { Controller } from '@tsoa/runtime';
import Favorite from '../models/Favorite';
import {
  FavoritesResponse,
  FavoriteRequest,
  FavoriteOperationResponse,
} from '../types/api/favorites';

/**
 * Favorites Controller
 * Manages user's favorite products
 */
@Route('customer/favorites')
@Tags('Favorites')
export class FavoritesController extends Controller {
  /**
   * Get user's favorite product IDs
   * Returns a simple array of product IDs for efficient client-side merging
   */
  @Get()
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async getFavorites(@Request() request: any): Promise<FavoritesResponse> {
    try {
      const userId = request.user?.id || request.user?._id;

      if (!userId) {
        this.setStatus(401);
        return {
          success: false,
          data: { productIds: [] },
        };
      }

      const favorites = await Favorite.find({ userId })
        .select('productId')
        .lean();

      const productIds = favorites.map((fav) => fav.productId);

      return {
        success: true,
        data: { productIds },
      };
    } catch (error) {
      console.error('Error fetching favorites:', error instanceof Error ? error.message : 'Unknown error');
      this.setStatus(500);
      return {
        success: false,
        data: { productIds: [] },
      };
    }
  }

  /**
   * Add a product to favorites
   */
  @Post()
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(400, 'Bad Request')
  @Response(500, 'Internal Server Error')
  public async addFavorite(
    @Body() body: FavoriteRequest,
    @Request() request: any
  ): Promise<FavoriteOperationResponse> {
    try {
      const userId = request.user?.id || request.user?._id;

      if (!userId) {
        this.setStatus(401);
        return {
          success: false,
          message: 'Unauthorized',
        };
      }

      // Validate productId exists and is valid format
      if (!body.productId || typeof body.productId !== 'string' || body.productId.trim().length === 0) {
        this.setStatus(400);
        return {
          success: false,
          message: 'Valid product ID is required',
        };
      }

      const sanitizedProductId = body.productId.trim();

      // Validate format (numeric or Shopify GID format)
      const isValidFormat = /^(\d+|gid:\/\/shopify\/Product\/\d+)$/.test(sanitizedProductId);
      if (!isValidFormat) {
        this.setStatus(400);
        return {
          success: false,
          message: 'Invalid product ID format',
        };
      }

      // Check if already favorited
      const existing = await Favorite.findOne({
        userId,
        productId: sanitizedProductId,
      });

      if (existing) {
        return {
          success: true,
          message: 'Product already in favorites',
        };
      }

      // Add to favorites
      await Favorite.create({
        userId,
        productId: sanitizedProductId,
      });

      return {
        success: true,
        message: 'Product added to favorites',
      };
    } catch (error) {
      console.error('Error adding favorite:', error instanceof Error ? error.message : 'Unknown error');
      this.setStatus(500);
      return {
        success: false,
        message: 'Failed to add favorite',
      };
    }
  }

  /**
   * Remove a product from favorites
   */
  @Delete('{productId}')
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(404, 'Not Found')
  @Response(500, 'Internal Server Error')
  public async removeFavorite(
    productId: string,
    @Request() request: any
  ): Promise<FavoriteOperationResponse> {
    try {
      const userId = request.user?.id || request.user?._id;

      if (!userId) {
        this.setStatus(401);
        return {
          success: false,
          message: 'Unauthorized',
        };
      }

      const result = await Favorite.deleteOne({
        userId,
        productId,
      });

      if (result.deletedCount === 0) {
        this.setStatus(404);
        return {
          success: false,
          message: 'Favorite not found',
        };
      }

      return {
        success: true,
        message: 'Product removed from favorites',
      };
    } catch (error) {
      console.error('Error removing favorite:', error instanceof Error ? error.message : 'Unknown error');
      this.setStatus(500);
      return {
        success: false,
        message: 'Failed to remove favorite',
      };
    }
  }
}
