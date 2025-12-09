import { Get, Post, Delete, Route, Tags, Response, Body, Security, Request, Query } from 'tsoa';
import { Controller } from '@tsoa/runtime';
import mongoose from 'mongoose';
import Favorite from '../models/Favorite';
import shopifyStorefront from '../services/shopifyStorefrontService';
import {
  FavoritesResponse,
  FavoriteRequest,
  FavoriteOperationResponse,
  DetailedFavoritesResponse,
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
      const userId = request.user?.id || request.user?._id?.toString();
      const isCustomer = request.user?.role === 'customer';

      if (!userId) {
        this.setStatus(401);
        return {
          success: false,
          data: { productIds: [] },
        };
      }

      // Convert userId string to ObjectId for mongoose queries
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Query by customerId for customers, userId for users
      const query = isCustomer ? { customerId: userObjectId } : { userId: userObjectId };
      const favorites = await Favorite.find(query)
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
    let userId: string | undefined;
    let isCustomer = false;

    try {
      userId = request.user?.id || request.user?._id?.toString();
      isCustomer = request.user?.role === 'customer';

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

      // Convert userId string to ObjectId for mongoose queries
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Check if already favorited - query by customerId for customers, userId for users
      const query = isCustomer
        ? { customerId: userObjectId, productId: sanitizedProductId }
        : { userId: userObjectId, productId: sanitizedProductId };
      const existing = await Favorite.findOne(query);

      if (existing) {
        return {
          success: true,
          message: 'Product already in favorites',
        };
      }

      // Add to favorites - set customerId for customers, userId for users
      const favoriteData = isCustomer
        ? { customerId: userObjectId, productId: sanitizedProductId }
        : { userId: userObjectId, productId: sanitizedProductId };
      await Favorite.create(favoriteData);

      return {
        success: true,
        message: 'Product added to favorites',
      };
    } catch (error) {
      console.error('[Favorites] Add favorite error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        isCustomer,
        productId: body.productId,
      });
      this.setStatus(500);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add favorite',
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
      const userId = request.user?.id || request.user?._id?.toString();
      const isCustomer = request.user?.role === 'customer';

      if (!userId) {
        this.setStatus(401);
        return {
          success: false,
          message: 'Unauthorized',
        };
      }

      // Convert userId string to ObjectId for mongoose queries
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Delete by customerId for customers, userId for users
      const query = isCustomer
        ? { customerId: userObjectId, productId }
        : { userId: userObjectId, productId };
      const result = await Favorite.deleteOne(query);

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

  /**
   * Get user's favorite products with full details and pagination
   * Fetches product data directly from Shopify for real-time accuracy
   */
  @Get('detailed')
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(400, 'Bad Request - Invalid pagination parameters')
  @Response(500, 'Internal Server Error')
  public async getDetailedFavorites(
    @Request() request: any,
    @Query() page: number = 1,
    @Query() limit: number = 20
  ): Promise<DetailedFavoritesResponse> {
    try {
      const userId = request.user?.id || request.user?._id?.toString();
      const isCustomer = request.user?.role === 'customer';

      if (!userId) {
        this.setStatus(401);
        return {
          success: false,
          data: {
            products: [],
            pagination: {
              current: 1,
              total: 0,
              count: 0,
              totalProducts: 0,
            },
          },
        };
      }

      // Convert userId string to ObjectId for mongoose queries
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Validate and sanitize pagination parameters
      let pageNum = parseInt(String(page));
      let limitNum = parseInt(String(limit));

      // Validate page number
      if (isNaN(pageNum) || pageNum < 1) {
        pageNum = 1;
      }

      // Validate limit and enforce maximum
      if (isNaN(limitNum) || limitNum < 1) {
        limitNum = 20;
      }
      const MAX_LIMIT = 100;
      if (limitNum > MAX_LIMIT) {
        limitNum = MAX_LIMIT;
      }

      const skip = (pageNum - 1) * limitNum;

      // Query by customerId for customers, userId for users
      const query = isCustomer ? { customerId: userObjectId } : { userId: userObjectId };

      // Get total count of favorites for pagination
      const totalFavorites = await Favorite.countDocuments(query);

      // Get paginated favorite product IDs, sorted by most recently added
      const favorites = await Favorite.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select('productId')
        .lean();

      const productIds = favorites.map((fav) => fav.productId);

      if (productIds.length === 0) {
        return {
          success: true,
          data: {
            products: [],
            pagination: {
              current: pageNum,
              total: 0,
              count: 0,
              totalProducts: 0,
            },
          },
        };
      }

      // Fetch products from Shopify in parallel
      const productPromises = productIds.map(async (productId) => {
        try {
          const response = await shopifyStorefront.getProductById(productId);
          return response?.data?.product || null;
        } catch (error) {
          console.error(`Failed to fetch product ${productId} from Shopify:`, error);
          return null;
        }
      });

      const shopifyProducts = await Promise.all(productPromises);

      // Filter out null values (products that failed to fetch)
      const validProducts = shopifyProducts.filter((p) => p !== null);

      // Transform Shopify products to match expected format
      const transformedProducts = validProducts.map((product: any) => {
        // Extract numeric ID from GID
        const numericId = product.id?.match(/gid:\/\/shopify\/Product\/(\d+)/)?.[1] || product.id;

        // Get price information
        const minPrice = parseFloat(product.priceRange?.minVariantPrice?.amount || '0');
        const compareAtPrice = parseFloat(product.compareAtPriceRange?.minVariantPrice?.amount || '0');

        // Transform images
        const images = product.images?.edges?.map((edge: any, index: number) => ({
          url: edge.node.url,
          alt: edge.node.altText || product.title,
          position: index + 1,
        })) || [];

        // Transform variants
        const variants = product.variants?.edges?.map((edge: any) => {
          const variant = edge.node;
          return {
            id: variant.id,
            title: variant.title,
            price: parseFloat(variant.price?.amount || '0'),
            compareAtPrice: variant.compareAtPrice ? parseFloat(variant.compareAtPrice.amount) : null,
            availableForSale: variant.availableForSale,
            quantityAvailable: variant.quantityAvailable,
            options: variant.selectedOptions,
            image: variant.image ? {
              url: variant.image.url,
              alt: variant.image.altText || variant.title,
            } : null,
          };
        }) || [];

        return {
          id: numericId,
          shopifyProductId: numericId,
          title: product.title,
          description: product.description || '',
          handle: product.handle,
          vendor: product.vendor,
          productType: product.productType,
          tags: product.tags || [],
          price: minPrice,
          compareAtPrice: compareAtPrice > minPrice ? compareAtPrice : null,
          availableForSale: product.availableForSale,
          totalInventory: product.totalInventory,
          currencyCode: product.priceRange?.minVariantPrice?.currencyCode || 'USD',
          images,
          variants,
          status: product.availableForSale ? 'active' : 'draft',
        };
      });

      return {
        success: true,
        data: {
          products: transformedProducts,
          pagination: {
            current: pageNum,
            total: Math.ceil(totalFavorites / limitNum),
            count: transformedProducts.length,
            totalProducts: totalFavorites,
          },
        },
      };
    } catch (error) {
      console.error(
        'Error fetching detailed favorites:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.setStatus(500);
      return {
        success: false,
        data: {
          products: [],
          pagination: {
            current: 1,
            total: 0,
            count: 0,
            totalProducts: 0,
          },
        },
      };
    }
  }
}
