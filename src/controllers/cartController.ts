import { Get, Post, Put, Delete, Route, Tags, Response, Path, Body, Security, Request, Query, Header } from 'tsoa';
import { Controller } from '@tsoa/runtime';
import shopifyStorefront from '../services/shopifyStorefrontService';
import Customer from '../models/Customer';
import CartActivity from '../models/CartActivity';
import {
  CartResponse,
  CartCreateRequest,
  AddItemsRequest,
  UpdateItemQuantityRequest,
  ClearCartResponse,
  CartData,
  CartLineItem,
} from '../types/api/cart';

interface SaveCartResponse {
  status: string;
  message: string;
}

/**
 * Cart Controller
 * Manages shopping cart operations via Shopify Storefront API
 */
@Route('cart')
@Tags('Cart')
export class CartController extends Controller {
  /**
   * Create a new shopping cart
   * @param requestBody - Optional initial items to add to cart
   * @param country - ISO 3166-1 alpha-2 country code for multi-currency pricing (e.g., 'US', 'GB', 'CA')
   */
  @Post('create')
  @Response(400, 'Bad Request')
  @Response(500, 'Internal Server Error')
  public async createCart(
    @Body() requestBody?: CartCreateRequest,
    @Query() country?: string
  ): Promise<CartResponse> {
    try {
      if (!shopifyStorefront.isConfigured()) {
        this.setStatus(500);
        throw new Error('Shopify not configured');
      }

      const items = requestBody?.items;
      const shopifyResponse = await shopifyStorefront.createCart(items, country);

      if (shopifyResponse?.data?.cartCreate?.userErrors?.length > 0) {
        this.setStatus(400);
        const error = shopifyResponse.data.cartCreate.userErrors[0];
        throw new Error(error.message || 'Failed to create cart');
      }

      const cart = shopifyResponse?.data?.cartCreate?.cart;
      if (!cart) {
        this.setStatus(500);
        throw new Error('Failed to create cart');
      }

      const cartData = await this.transformCart(cart);

      return {
        success: true,
        data: cartData,
      };
    } catch (error) {
      console.error(
        'Error creating cart:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (error instanceof Error && error.message.includes('not configured')) {
        this.setStatus(500);
      } else if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Get cart by ID
   * @param cartId - Shopify cart ID
   * @param country - ISO 3166-1 alpha-2 country code for multi-currency pricing (e.g., 'US', 'GB', 'CA')
   */
  @Get('{cartId}')
  @Response(404, 'Cart not found')
  @Response(500, 'Internal Server Error')
  public async getCart(
    @Path() cartId: string,
    @Query() country?: string
  ): Promise<CartResponse> {
    try {
      if (!shopifyStorefront.isConfigured()) {
        this.setStatus(500);
        throw new Error('Shopify not configured');
      }

      const shopifyResponse = await shopifyStorefront.getCart(cartId, country);

      if (!shopifyResponse?.data?.cart) {
        this.setStatus(404);
        throw new Error('Cart not found');
      }

      const cart = shopifyResponse.data.cart;
      const cartData = await this.transformCart(cart);

      return {
        success: true,
        data: cartData,
      };
    } catch (error) {
      console.error(
        'Error fetching cart:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (error instanceof Error && error.message === 'Cart not found') {
        this.setStatus(404);
      } else if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Add items to cart
   * @param cartId - Shopify cart ID
   * @param requestBody - Items to add
   */
  @Post('{cartId}/items')
  @Response(400, 'Bad Request')
  @Response(404, 'Cart not found')
  @Response(500, 'Internal Server Error')
  public async addItems(
    @Path() cartId: string,
    @Body() requestBody: AddItemsRequest
  ): Promise<CartResponse> {
    try {
      if (!shopifyStorefront.isConfigured()) {
        this.setStatus(500);
        throw new Error('Shopify not configured');
      }

      const shopifyResponse = await shopifyStorefront.addCartLines(cartId, requestBody.items);

      if (shopifyResponse?.data?.cartLinesAdd?.userErrors?.length > 0) {
        const error = shopifyResponse.data.cartLinesAdd.userErrors[0];
        if (error.message.includes('not found') || error.message.includes('invalid')) {
          this.setStatus(404);
        } else {
          this.setStatus(400);
        }
        throw new Error(error.message || 'Failed to add items to cart');
      }

      const cart = shopifyResponse?.data?.cartLinesAdd?.cart;
      if (!cart) {
        this.setStatus(500);
        throw new Error('Failed to add items to cart');
      }

      const cartData = await this.transformCart(cart);

      return {
        success: true,
        data: cartData,
      };
    } catch (error) {
      console.error(
        'Error adding items to cart:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Update cart item quantity
   * @param cartId - Shopify cart ID
   * @param lineItemId - Shopify line item ID
   * @param requestBody - New quantity
   */
  @Put('{cartId}/items/{lineItemId}')
  @Response(400, 'Bad Request')
  @Response(404, 'Cart or item not found')
  @Response(500, 'Internal Server Error')
  public async updateItemQuantity(
    @Path() cartId: string,
    @Path() lineItemId: string,
    @Body() requestBody: UpdateItemQuantityRequest
  ): Promise<CartResponse> {
    try {
      if (!shopifyStorefront.isConfigured()) {
        this.setStatus(500);
        throw new Error('Shopify not configured');
      }

      const shopifyResponse = await shopifyStorefront.updateCartLines(cartId, [
        {
          id: lineItemId,
          quantity: requestBody.quantity,
        },
      ]);

      if (shopifyResponse?.data?.cartLinesUpdate?.userErrors?.length > 0) {
        const error = shopifyResponse.data.cartLinesUpdate.userErrors[0];
        if (error.message.includes('not found') || error.message.includes('invalid')) {
          this.setStatus(404);
        } else {
          this.setStatus(400);
        }
        throw new Error(error.message || 'Failed to update item quantity');
      }

      const cart = shopifyResponse?.data?.cartLinesUpdate?.cart;
      if (!cart) {
        this.setStatus(500);
        throw new Error('Failed to update item quantity');
      }

      const cartData = await this.transformCart(cart);

      return {
        success: true,
        data: cartData,
      };
    } catch (error) {
      console.error(
        'Error updating item quantity:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Remove item from cart
   * @param cartId - Shopify cart ID
   * @param lineItemId - Shopify line item ID
   */
  @Delete('{cartId}/items/{lineItemId}')
  @Response(404, 'Cart or item not found')
  @Response(500, 'Internal Server Error')
  public async removeItem(
    @Path() cartId: string,
    @Path() lineItemId: string
  ): Promise<CartResponse> {
    try {
      if (!shopifyStorefront.isConfigured()) {
        this.setStatus(500);
        throw new Error('Shopify not configured');
      }

      const shopifyResponse = await shopifyStorefront.removeCartLines(cartId, [lineItemId]);

      if (shopifyResponse?.data?.cartLinesRemove?.userErrors?.length > 0) {
        const error = shopifyResponse.data.cartLinesRemove.userErrors[0];
        if (error.message.includes('not found') || error.message.includes('invalid')) {
          this.setStatus(404);
        } else {
          this.setStatus(400);
        }
        throw new Error(error.message || 'Failed to remove item from cart');
      }

      const cart = shopifyResponse?.data?.cartLinesRemove?.cart;
      if (!cart) {
        this.setStatus(500);
        throw new Error('Failed to remove item from cart');
      }

      const cartData = await this.transformCart(cart);

      return {
        success: true,
        data: cartData,
      };
    } catch (error) {
      console.error(
        'Error removing item from cart:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Clear saved cart ID from customer profile
   * Call this after checkout completion to remove stale cart reference
   * @summary Clear saved cart from profile
   * @param request - Request object with authenticated user
   */
  @Delete('saved')
  @Security('jwt')
  @Response<SaveCartResponse>(200, 'Saved cart cleared')
  @Response<SaveCartResponse>(401, 'Unauthorized')
  @Response<SaveCartResponse>(500, 'Internal Server Error')
  public async clearSavedCart(
    @Request() request: any
  ): Promise<SaveCartResponse> {
    try {
      const customerId = request.user?.id || request.user?._id;
      const storeId = request.storeId;

      if (!customerId) {
        this.setStatus(401);
        return { status: 'error', message: 'Authentication required' };
      }

      // Clear shopifyCartId from customer profile
      await Customer.findByIdAndUpdate(
        customerId,
        { $unset: { shopifyCartId: 1 } }
      );

      // Also update CartActivity to reflect empty cart
      if (storeId) {
        try {
          await CartActivity.updateCartActivity(storeId, customerId, {
            itemCount: 0,
            cartTotal: 0,
            currency: 'USD',
          });
          console.log(`[CartController] Updated CartActivity to empty for customer ${customerId}`);
        } catch (cartActivityError) {
          // Log but don't fail - cart activity update is secondary
          console.error('[CartController] Error updating CartActivity:', cartActivityError);
        }
      }

      console.log(`[CartController] Cleared saved cartId for customer ${customerId}`);

      return { status: 'success', message: 'Saved cart cleared' };
    } catch (error) {
      console.error('[CartController] Error clearing saved cart:', error);
      this.setStatus(500);
      return { status: 'error', message: 'Failed to clear saved cart' };
    }
  }

  /**
   * Clear cart (remove all items)
   * @param cartId - Shopify cart ID
   */
  @Delete('{cartId}')
  @Response(404, 'Cart not found')
  @Response(500, 'Internal Server Error')
  public async clearCart(@Path() cartId: string): Promise<ClearCartResponse> {
    try {
      if (!shopifyStorefront.isConfigured()) {
        this.setStatus(500);
        throw new Error('Shopify not configured');
      }

      // First, get the cart to retrieve all line item
      //  IDs
      const cartResponse = await shopifyStorefront.getCart(cartId);

      if (!cartResponse?.data?.cart) {
        this.setStatus(404);
        throw new Error('Cart not found');
      }

      const cart = cartResponse.data.cart;
      const lineIds = cart.lines?.edges?.map((edge: any) => edge.node.id) || [];

      if (lineIds.length === 0) {
        return {
          success: true,
          message: 'Cart is already empty',
        };
      }

      // Remove all line items
      const shopifyResponse = await shopifyStorefront.removeCartLines(cartId, lineIds);

      if (shopifyResponse?.data?.cartLinesRemove?.userErrors?.length > 0) {
        const error = shopifyResponse.data.cartLinesRemove.userErrors[0];
        this.setStatus(400);
        throw new Error(error.message || 'Failed to clear cart');
      }

      return {
        success: true,
        message: 'Cart cleared successfully',
      };
    } catch (error) {
      console.error(
        'Error clearing cart:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (error instanceof Error && error.message === 'Cart not found') {
        this.setStatus(404);
      } else if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Associate cart with logged-in customer
   * Call this when user logs in to merge guest cart with their account
   * @param cartId - Shopify cart ID
   * @param request - Request object with user info
   */
  @Post('{cartId}/associate')
  @Security('jwt')
  @Response(400, 'Bad Request')
  @Response(404, 'Cart not found')
  @Response(500, 'Internal Server Error')
  public async associateWithCustomer(
    @Path() cartId: string,
    @Request() request: any
  ): Promise<CartResponse> {
    try {
      if (!shopifyStorefront.isConfigured()) {
        this.setStatus(500);
        throw new Error('Shopify not configured');
      }

      // Get customer access token from request user
      // Note: You'll need to store Shopify customer access token when user logs in
      const customerAccessToken = request.user?.shopifyAccessToken;

      if (!customerAccessToken) {
        this.setStatus(400);
        throw new Error(
          'Customer access token not found. User needs to authenticate with Shopify.'
        );
      }

      const shopifyResponse = await shopifyStorefront.associateCartWithCustomer(
        cartId,
        customerAccessToken
      );

      if (shopifyResponse?.data?.cartBuyerIdentityUpdate?.userErrors?.length > 0) {
        const error = shopifyResponse.data.cartBuyerIdentityUpdate.userErrors[0];
        if (error.message.includes('not found') || error.message.includes('invalid')) {
          this.setStatus(404);
        } else {
          this.setStatus(400);
        }
        throw new Error(error.message || 'Failed to associate cart with customer');
      }

      const cart = shopifyResponse?.data?.cartBuyerIdentityUpdate?.cart;
      if (!cart) {
        this.setStatus(500);
        throw new Error('Failed to associate cart with customer');
      }

      const cartData = await this.transformCart(cart);

      return {
        success: true,
        data: cartData,
      };
    } catch (error) {
      console.error(
        'Error associating cart with customer:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Save Shopify cart ID to customer profile for persistence across sessions
   * Call this after creating/updating cart to enable cart recovery on next login
   * @summary Save cart to customer profile (body)
   * @param body - Object containing cartId
   * @param request - Request object with authenticated user
   */
  @Post('saved')
  @Security('jwt')
  @Response<SaveCartResponse>(200, 'Cart saved successfully')
  @Response<SaveCartResponse>(401, 'Unauthorized')
  @Response<SaveCartResponse>(500, 'Internal Server Error')
  public async saveCartToProfileBody(
    @Body() body: { cartId: string },
    @Request() request: any
  ): Promise<SaveCartResponse> {
    return this.saveCartToProfile(body.cartId, request);
  }

  /**
   * Save Shopify cart ID to customer profile for persistence across sessions
   * Call this after creating/updating cart to enable cart recovery on next login
   * @summary Save cart to customer profile (path)
   * @param cartId - Shopify cart ID (URL encoded)
   * @param request - Request object with authenticated user
   */
  @Post('{cartId}/save')
  @Security('jwt')
  @Response<SaveCartResponse>(200, 'Cart saved successfully')
  @Response<SaveCartResponse>(401, 'Unauthorized')
  @Response<SaveCartResponse>(500, 'Internal Server Error')
  public async saveCartToProfile(
    @Path() cartId: string,
    @Request() request: any
  ): Promise<SaveCartResponse> {
    try {
      const customerId = request.user?.id || request.user?._id;
      const storeId = request.user?.storeId;

      if (!customerId) {
        this.setStatus(401);
        return { status: 'error', message: 'Authentication required' };
      }

      // Decode the cartId (it comes URL encoded)
      const decodedCartId = decodeURIComponent(cartId);

      // Update customer's shopifyCartId
      await Customer.findByIdAndUpdate(
        customerId,
        { shopifyCartId: decodedCartId },
        { new: true }
      );

      console.log(`[CartController] Saved cartId for customer ${customerId}: ${decodedCartId}`);

      // Track cart activity for abandoned cart notifications (only for customers with storeId)
      console.log(`[CartController] CartActivity check - storeId: ${storeId}, shopifyConfigured: ${shopifyStorefront.isConfigured()}`);
      if (storeId && shopifyStorefront.isConfigured()) {
        try {
          const cartResponse = await shopifyStorefront.getCart(decodedCartId);
          const cart = cartResponse?.data?.cart;

          if (cart) {
            const itemCount = cart.lines?.edges?.length || 0;
            const cartTotal = parseFloat(cart.estimatedCost?.subtotalAmount?.amount || '0');
            const currency = cart.estimatedCost?.subtotalAmount?.currencyCode || 'USD';

            await CartActivity.updateCartActivity(storeId, customerId, {
              shopifyCartId: decodedCartId,
              itemCount,
              cartTotal,
              currency,
            });

            console.log(`[CartController] Updated CartActivity for customer ${customerId}: ${itemCount} items, ${currency} ${cartTotal}`);
          }
        } catch (cartActivityError) {
          // Log but don't fail the request - cart activity tracking is secondary
          console.error('[CartController] Error tracking cart activity:', cartActivityError);
        }
      }

      return { status: 'success', message: 'Cart saved to profile' };
    } catch (error) {
      console.error('[CartController] Error saving cart to profile:', error);
      this.setStatus(500);
      return { status: 'error', message: 'Failed to save cart' };
    }
  }

  /**
   * Transform Shopify cart response to API format
   */
  private async transformCart(cart: any): Promise<CartData> {
    // Extract unique product IDs from cart items
    const productIds = [
      ...new Set(
        (cart.lines?.edges || [])
          .map((edge: any) => edge.node.merchandise?.product?.id)
          .filter((id: string) => id)
      ),
    ];

    // Fetch metafields for all products in parallel
    const metafieldsMap = new Map<string, any[]>();

    if (shopifyStorefront.isAdminConfigured() && productIds.length > 0) {
      const metafieldsPromises = productIds.map(async (productId: string) => {
        try {
          const response = await shopifyStorefront.getProductMetafields(productId);
          const metafields = this.transformMetafields(
            response?.data?.product?.metafields?.edges || []
          );
          return { productId, metafields };
        } catch (error) {
          console.error(`Failed to fetch metafields for product ${productId}:`, error);
          return { productId, metafields: [] };
        }
      });

      const results = await Promise.all(metafieldsPromises);
      results.forEach(({ productId, metafields }) => {
        metafieldsMap.set(productId, metafields);
      });
    }

    const items: CartLineItem[] = (cart.lines?.edges || []).map((edge: any) => {
      const node = edge.node;
      const merchandise = node.merchandise;
      const productId = merchandise.product?.id || '';

      return {
        id: node.id,
        merchandiseId: merchandise.id,
        productId,
        title: merchandise.product?.title || '',
        variantTitle: merchandise.title || '',
        image: merchandise.image?.url || null,
        price: parseFloat(merchandise.priceV2?.amount || '0'),
        compareAtPrice: merchandise.compareAtPriceV2?.amount
          ? parseFloat(merchandise.compareAtPriceV2.amount)
          : null,
        quantity: node.quantity || 0,
        quantityAvailable: merchandise.quantityAvailable || 0,
        metafields: metafieldsMap.get(productId) || [],
      };
    });

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = parseFloat(cart.estimatedCost?.subtotalAmount?.amount || '0');
    const currency = cart.estimatedCost?.subtotalAmount?.currencyCode || 'USD';

    return {
      cartId: cart.id,
      items,
      totalQuantity,
      subtotal,
      currency,
    };
  }

  /**
   * Transform Shopify metafields to API format
   * Same logic as ProductDetailController
   */
  private transformMetafields(metafieldEdges: any[]): any[] {
    return metafieldEdges
      .map(edge => edge.node)
      .filter(metafield => metafield.namespace === 'custom' || metafield.namespace === 'shopify')
      .map(metafield => {
        const isMetaobjectReference = metafield.type?.includes('metaobject_reference');

        let displayKey = metafield.key;
        let displayValue = metafield.value;

        if (
          isMetaobjectReference &&
          metafield.resolvedMetaobjects &&
          metafield.resolvedMetaobjects.length > 0
        ) {
          displayKey = metafield.key
            .split('-')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          const displayNames = metafield.resolvedMetaobjects
            .map((mo: any) => mo.displayName)
            .filter((name: string) => name)
            .join(', ');

          displayValue = displayNames || metafield.value;
        }

        return {
          namespace: metafield.namespace,
          key: displayKey,
          value: displayValue,
          type: metafield.type,
          description: metafield.description,
        };
      });
  }
}
