import { Body, Controller, Get, Path, Post, Query, Request, Route, Security, Tags, Response } from 'tsoa';
import CheckoutSession, { ICheckoutSessionDocument } from '../models/CheckoutSession';
import User from '../models/User';
import Order from '../models/Order';
import Product from '../models/Product';
import shopifyStorefront from '../services/shopifyStorefrontService';
import stripeService from '../services/stripeService';
import { normalizeAddressForShopify } from '../utils/addressHelper';
import {
  InitCheckoutRequest,
  InitCheckoutResponse,
  GetShippingRatesResponse,
  SaveShippingRequest,
  SaveShippingResponse,
  SaveStep2Request,
  SaveStep2Response,
  ApplyPromoRequest,
  ApplyPromoResponse,
  CheckoutSummaryResponse,
  CompleteCheckoutRequest,
  CompleteCheckoutResponse,
  CheckoutRequiresActionResponse,
} from '../types/api/checkout';

/**
 * Checkout Controller
 *
 * Manages the complete checkout flow for e-commerce transactions
 * - Multi-step checkout process (Shipping → Payment → Review → Complete)
 * - Shopify Storefront API integration for cart and shipping
 * - Shopify Admin API integration for order creation
 * - Stripe integration for payment processing
 *
 * Security: All endpoints require JWT authentication
 * Session Management: 30-minute auto-expiration via MongoDB TTL index
 */
@Route('checkout')
@Tags('Checkout')
export class CheckoutController extends Controller {
  /**
   * Initialize checkout session from cart
   *
   * Creates a checkout session linked to the user's Shopify cart
   * Session expires in 30 minutes
   *
   * @param requestBody - Cart ID
   * @param request - Express request with authenticated user
   * @returns Checkout session details
   */
  @Post('init')
  @Security('jwt')
  @Response(400, 'Bad Request - Invalid cart ID')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async initializeCheckout(
    @Body() requestBody: InitCheckoutRequest,
    @Request() request: any
  ): Promise<InitCheckoutResponse> {
    try {
      const userId = request.user._id;
      const { cartId } = requestBody;

      if (!cartId) {
        this.setStatus(400);
        throw new Error('Cart ID is required');
      }

      // Validate cart exists and get cart details from Shopify
      const cartResponse = await shopifyStorefront.getCart(cartId);

      if (!cartResponse?.data?.cart) {
        this.setStatus(404);
        throw new Error('Cart not found');
      }

      const cart = cartResponse.data.cart;

      // Check if cart has items
      if (!cart.lines?.edges || cart.lines.edges.length === 0) {
        this.setStatus(400);
        throw new Error('Cart is empty');
      }

      // Check for existing active session for this user
      const existingSession = await (CheckoutSession as any).findActiveByUser(userId) as ICheckoutSessionDocument | null;
      if (existingSession) {
        // Extend expiration and return existing session
        existingSession.extendExpiration(30);
        await existingSession.save();

        return {
          success: true,
          data: {
            sessionId: existingSession._id.toString(),
            cartId: existingSession.shopifyCartId,
            subtotal: existingSession.subtotal,
            currency: existingSession.currency,
            itemCount: cart.lines.edges.length,
            expiresAt: existingSession.expiresAt.toISOString(),
          },
        };
      }

      // Create new checkout session
      const subtotal = parseFloat(cart.estimatedCost?.subtotalAmount?.amount || '0');
      const currency = cart.estimatedCost?.subtotalAmount?.currencyCode || 'USD';

      const session = new CheckoutSession({
        userId,
        shopifyCartId: cartId,
        subtotal,
        currency,
        grandTotal: subtotal,
        status: 'step1',
        currentStep: 1,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      });

      await session.save();

      return {
        success: true,
        data: {
          sessionId: session._id.toString(),
          cartId: session.shopifyCartId,
          subtotal: session.subtotal,
          currency: session.currency,
          itemCount: cart.lines.edges.length,
          expiresAt: session.expiresAt.toISOString(),
        },
      };
    } catch (error) {
      console.error('Error initializing checkout:', error);

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Get available shipping rates for an address
   *
   * Uses Shopify Storefront API to get real-time shipping rates
   *
   * @param sessionId - Checkout session ID
   * @param addressId - User address array index
   * @param request - Express request with authenticated user
   * @returns Available shipping rates
   */
  @Get('shipping-rates')
  @Security('jwt')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Session or address not found')
  @Response(500, 'Internal Server Error')
  public async getShippingRates(
    @Query() sessionId: string,
    @Query() addressId: number,
    @Request() request: any
  ): Promise<GetShippingRatesResponse> {
    try {
      const userId = request.user._id;

      console.log('getShippingRates called with:', { sessionId, addressId, userId: userId.toString() });

      // Validate input - addressId can be 0, so check for null/undefined specifically
      if (!sessionId || addressId === null || addressId === undefined) {
        console.error('Validation failed:', { sessionId, addressId });
        this.setStatus(400);
        throw new Error('Session ID and address ID are required');
      }

      // Find checkout session
      const session = await CheckoutSession.findById(sessionId) as ICheckoutSessionDocument | null;
      if (!session) {
        console.error('Checkout session not found:', sessionId);
        this.setStatus(404);
        throw new Error('Checkout session not found');
      }
      console.log('Session found:', { sessionId, sessionUserId: session.userId.toString(), cartId: session.shopifyCartId });

      // Verify ownership
      if (!session.belongsToUser(userId)) {
        console.error('Ownership verification failed:', { sessionUserId: session.userId.toString(), requestUserId: userId.toString() });
        this.setStatus(403);
        throw new Error('Unauthorized access to checkout session');
      }

      // Check expiration
      if (session.isExpired) {
        console.error('Session expired:', { sessionId, expiresAt: session.expiresAt });
        this.setStatus(400);
        throw new Error('Checkout session has expired');
      }

      // Get user and address
      const user = await User.findById(userId);
      if (!user) {
        console.error('User not found:', userId);
        this.setStatus(404);
        throw new Error('User not found');
      }
      console.log('User found:', { userId, addressCount: user.addresses?.length || 0 });

      if (!user.addresses || !user.addresses[addressId]) {
        console.error('Address not found:', { userId, addressId, addressCount: user.addresses?.length || 0 });
        this.setStatus(404);
        throw new Error('Address not found');
      }

      const address = user.addresses[addressId];
      console.log('Address retrieved:', {
        addressId,
        country: address.country,
        countryCode: address.countryCode,
        province: address.province,
        city: address.city,
        zip: address.zip
      });

      // Normalize address to ISO codes for Shopify
      const normalizedAddress = normalizeAddressForShopify({
        country: address.country,
        countryCode: address.countryCode,
        province: address.province,
      });
      console.log('Normalized address:', normalizedAddress);

      // Update cart buyer identity with country code to get shipping rates from Shopify
      // Using cartBuyerIdentityUpdate with countryCode (2025-01 compatible)
      console.log('Calling Shopify updateCartBuyerIdentity with:', {
        cartId: session.shopifyCartId,
        address: {
          city: address.city || '',
          province: normalizedAddress.provinceCode,
          country: normalizedAddress.countryCode,
          zip: address.zip,
        }
      });

      const shopifyResponse = await shopifyStorefront.updateCartBuyerIdentity(session.shopifyCartId, {
        address1: address.address1,
        address2: address.address2,
        city: address.city || '',
        province: normalizedAddress.provinceCode,  // ISO code (e.g., "TX")
        country: normalizedAddress.countryCode,     // ISO code (e.g., "US")
        zip: address.zip,
        firstName: address.firstName,
        lastName: address.lastName,
        phone: address.phone,
      });

      console.log('Shopify response received:', {
        hasUserErrors: shopifyResponse?.data?.cartBuyerIdentityUpdate?.userErrors?.length > 0,
        userErrors: shopifyResponse?.data?.cartBuyerIdentityUpdate?.userErrors,
        hasCart: !!shopifyResponse?.data?.cartBuyerIdentityUpdate?.cart
      });

      if (shopifyResponse?.data?.cartBuyerIdentityUpdate?.userErrors?.length > 0) {
        const error = shopifyResponse.data.cartBuyerIdentityUpdate.userErrors[0];
        this.setStatus(400);
        throw new Error(error.message || 'Failed to get shipping rates');
      }

      const cart = shopifyResponse?.data?.cartBuyerIdentityUpdate?.cart;
      const deliveryGroup = cart?.deliveryGroups?.edges?.[0]?.node;

      // Log for debugging
      console.log('Shopify cart response:', JSON.stringify({
        hasCart: !!cart,
        hasDeliveryGroups: !!cart?.deliveryGroups,
        deliveryGroupsCount: cart?.deliveryGroups?.edges?.length || 0,
        hasDeliveryOptions: !!deliveryGroup?.deliveryOptions,
        deliveryOptionsCount: deliveryGroup?.deliveryOptions?.length || 0,
        address: { province: normalizedAddress.provinceCode, country: normalizedAddress.countryCode }
      }));

      // Log full cart response for debugging
      console.log('Full cart data:', JSON.stringify(cart, null, 2));

      if (!deliveryGroup || !deliveryGroup.deliveryOptions || deliveryGroup.deliveryOptions.length === 0) {
        this.setStatus(400);
        throw new Error('No shipping options available for this address');
      }

      // Transform shipping rates
      const shippingRates = deliveryGroup.deliveryOptions.map((option: any) => ({
        handle: option.handle,
        title: option.title,
        price: parseFloat(option.estimatedCost?.amount || '0'),
        description: option.description,
        deliveryMethodType: option.deliveryMethodType,
      }));

      return {
        success: true,
        data: {
          shippingRates,
          address: {
            address1: address.address1,
            address2: address.address2,
            city: address.city || '',
            province: address.province,
            country: address.country,
            zip: address.zip,
            phone: address.phone,
          },
        },
      };
    } catch (error) {
      console.error('Error getting shipping rates:', error);

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Save shipping information
   *
   * @param requestBody - Shipping details
   * @param request - Express request with authenticated user
   * @returns Updated session
   */
  @Post('save-shipping')
  @Security('jwt')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Session not found')
  @Response(500, 'Internal Server Error')
  public async saveShipping(
    @Body() requestBody: SaveShippingRequest,
    @Request() request: any
  ): Promise<SaveShippingResponse> {
    try {
      const userId = request.user._id;
      const { sessionId, shippingAddressId, deliveryInstructions, contactNumber, shippingRateHandle } = requestBody;

      // Validate input
      if (!sessionId || shippingAddressId === undefined || !contactNumber || !shippingRateHandle) {
        this.setStatus(400);
        throw new Error('All shipping fields are required');
      }

      // Find session
      const session = await CheckoutSession.findById(sessionId) as ICheckoutSessionDocument | null;
      if (!session) {
        this.setStatus(404);
        throw new Error('Checkout session not found');
      }

      // Verify ownership
      if (!session.belongsToUser(userId)) {
        this.setStatus(403);
        throw new Error('Unauthorized access to checkout session');
      }

      // Get user to validate address
      const user = await User.findById(userId);
      if (!user || !user.addresses || !user.addresses[shippingAddressId]) {
        this.setStatus(404);
        throw new Error('Address not found');
      }

      // Get shipping rate details from Shopify
      const address = user.addresses[shippingAddressId];
      const normalizedAddress = normalizeAddressForShopify({
        country: address.country,
        countryCode: address.countryCode,
        province: address.province,
      });

      const shopifyResponse = await shopifyStorefront.updateCartBuyerIdentity(session.shopifyCartId, {
        address1: address.address1,
        address2: address.address2,
        city: address.city || '',
        province: normalizedAddress.provinceCode,
        country: normalizedAddress.countryCode,
        zip: address.zip,
        firstName: address.firstName,
        lastName: address.lastName,
        phone: address.phone,
      });
      const cart = shopifyResponse?.data?.cartBuyerIdentityUpdate?.cart;
      const deliveryGroup = cart?.deliveryGroups?.edges?.[0]?.node;
      const selectedRate = deliveryGroup?.deliveryOptions?.find((opt: any) => opt.handle === shippingRateHandle);

      if (!selectedRate) {
        this.setStatus(400);
        throw new Error('Invalid shipping rate selected');
      }

      // Update session
      session.shippingAddressId = shippingAddressId;
      session.deliveryInstructions = deliveryInstructions;
      session.contactNumber = contactNumber;
      session.selectedShippingRate = {
        handle: selectedRate.handle,
        title: selectedRate.title,
        price: parseFloat(selectedRate.estimatedCost?.amount || '0'),
        description: selectedRate.description,
      };
      session.shippingCost = parseFloat(selectedRate.estimatedCost?.amount || '0');

      // Update tax from Shopify cart
      session.tax = parseFloat(cart?.estimatedCost?.totalTaxAmount?.amount || '0');

      // Recalculate totals
      session.updatePricing({
        shippingCost: session.shippingCost,
        tax: session.tax,
      });

      // Mark step 1 complete and move to step 2
      session.completeStep(1);
      session.status = 'step2';
      session.currentStep = 2;

      // Extend expiration
      session.extendExpiration(30);

      // Explicitly mark shippingAddressId as modified to ensure it's saved
      session.markModified('shippingAddressId');

      await session.save();

      return {
        success: true,
        data: {
          sessionId: session._id.toString(),
          status: session.status,
          currentStep: session.currentStep,
          completedSteps: session.completedSteps,
          shippingCost: session.shippingCost,
          estimatedDelivery: selectedRate.description,
        },
        message: 'Shipping information saved successfully',
      };
    } catch (error) {
      console.error('Error saving shipping information:', error);

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Save Step 2: Payment method
   *
   * @param requestBody - Payment method ID
   * @param request - Express request with authenticated user
   * @returns Updated session
   */
  @Post('step2')
  @Security('jwt')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Session or payment method not found')
  @Response(500, 'Internal Server Error')
  public async saveStep2(
    @Body() requestBody: SaveStep2Request,
    @Request() request: any
  ): Promise<SaveStep2Response> {
    try {
      const userId = request.user._id;
      const { sessionId, paymentMethodId } = requestBody;

      // Validate input
      if (!sessionId || !paymentMethodId) {
        this.setStatus(400);
        throw new Error('Session ID and payment method ID are required');
      }

      // Find session
      const session = await CheckoutSession.findById(sessionId) as ICheckoutSessionDocument | null;
      if (!session) {
        this.setStatus(404);
        throw new Error('Checkout session not found');
      }

      // Verify ownership
      if (!session.belongsToUser(userId)) {
        this.setStatus(403);
        throw new Error('Unauthorized access to checkout session');
      }

      // Validate step progression
      if (!session.completedSteps.includes(1)) {
        this.setStatus(400);
        throw new Error('Please complete shipping information first');
      }

      // Fetch user to get Stripe customer ID
      const user = await User.findById(userId);
      if (!user || !user.stripeCustomerId) {
        this.setStatus(400);
        throw new Error('User does not have a Stripe customer account');
      }

      // Validate payment method exists in Stripe and belongs to user
      try {
        const stripePaymentMethod = await stripeService.getPaymentMethod(paymentMethodId);

        // Verify ownership - payment method must belong to user's Stripe customer
        if (stripePaymentMethod.customer !== user.stripeCustomerId) {
          this.setStatus(403);
          throw new Error('Unauthorized access to payment method');
        }

        // Check if card is expired (if it's a card payment method)
        if (stripePaymentMethod.card) {
          const now = new Date();
          const expYear = stripePaymentMethod.card.exp_year;
          const expMonth = stripePaymentMethod.card.exp_month;
          const expDate = new Date(expYear, expMonth, 0); // Last day of expiry month

          if (expDate < now) {
            this.setStatus(400);
            throw new Error('Payment method has expired');
          }
        }
      } catch (error) {
        console.error('Error validating Stripe payment method:', error);
        this.setStatus(404);
        throw new Error('Payment method not found or invalid');
      }

      // Update session with Stripe payment method ID
      session.paymentMethodId = paymentMethodId;

      // Mark step 2 complete and move to step 3
      session.completeStep(2);
      session.status = 'step3';
      session.currentStep = 3;

      // Extend expiration
      session.extendExpiration(30);

      await session.save();

      // Fetch payment method details from Stripe for response
      const stripePaymentMethod = await stripeService.getPaymentMethod(paymentMethodId);

      // Format payment method display name
      let displayName = 'Payment method';
      if (stripePaymentMethod.card) {
        displayName = `${stripePaymentMethod.card.brand} •••• ${stripePaymentMethod.card.last4}`;
      }

      return {
        success: true,
        data: {
          sessionId: session._id.toString(),
          status: session.status,
          currentStep: session.currentStep,
          completedSteps: session.completedSteps,
          paymentMethod: {
            id: stripePaymentMethod.id,
            displayName: displayName,
            type: stripePaymentMethod.type,
          },
        },
        message: 'Payment method saved successfully',
      };
    } catch (error) {
      console.error('Error saving step 2:', error);

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Apply promo code
   *
   * Uses Shopify Storefront API to validate and apply discount codes
   *
   * @param requestBody - Promo code details
   * @param request - Express request with authenticated user
   * @returns Discount details and updated pricing
   */
  @Post('apply-promo')
  @Security('jwt')
  @Response(400, 'Bad Request - Invalid promo code')
  @Response(401, 'Unauthorized')
  @Response(404, 'Session not found')
  @Response(500, 'Internal Server Error')
  public async applyPromoCode(
    @Body() requestBody: ApplyPromoRequest,
    @Request() request: any
  ): Promise<ApplyPromoResponse> {
    try {
      const userId = request.user._id;
      const { sessionId, promoCode } = requestBody;

      if (!sessionId) {
        this.setStatus(400);
        throw new Error('Session ID is required');
      }

      // Find session
      const session = await CheckoutSession.findById(sessionId) as ICheckoutSessionDocument | null;
      if (!session) {
        this.setStatus(404);
        throw new Error('Checkout session not found');
      }

      // Verify ownership
      if (!session.belongsToUser(userId)) {
        this.setStatus(403);
        throw new Error('Unauthorized access to checkout session');
      }

      // If promo code is empty, remove discount
      if (!promoCode || promoCode.trim() === '') {
        // Get fresh cart data to return current pricing
        const cartResponse = await shopifyStorefront.getCart(session.shopifyCartId);
        const cart = cartResponse?.data?.cart;

        const currentSubtotal = parseFloat(cart?.estimatedCost?.subtotalAmount?.amount || session.subtotal);
        const currentTax = parseFloat(cart?.estimatedCost?.totalTaxAmount?.amount || session.tax);
        const shippingCost = session.shippingCost || 0;

        session.promoCode = undefined;
        session.discount = undefined;
        session.updatePricing({
          subtotal: currentSubtotal,
          discountAmount: 0,
          tax: currentTax,
          shippingCost: shippingCost
        });
        await session.save();

        return {
          success: true,
          data: {
            discount: {
              code: '',
              amount: 0,
              type: 'fixed_amount',
              applicable: false,
            },
            pricing: {
              subtotal: session.subtotal,
              shippingCost: session.shippingCost,
              discountAmount: 0,
              couponDiscount: 0,
              tax: session.tax,
              grandTotal: session.grandTotal,
              currency: cart?.estimatedCost?.subtotalAmount?.currencyCode || session.currency,
            },
          },
          message: 'Discount removed',
        };
      }

      // Apply discount code via Shopify
      const shopifyResponse = await shopifyStorefront.applyDiscountCodes(session.shopifyCartId, [promoCode.trim().toUpperCase()]);

      if (shopifyResponse?.data?.cartDiscountCodesUpdate?.userErrors?.length > 0) {
        const error = shopifyResponse.data.cartDiscountCodesUpdate.userErrors[0];
        this.setStatus(400);
        throw new Error(error.message || 'Invalid promo code');
      }

      const cart = shopifyResponse?.data?.cartDiscountCodesUpdate?.cart;
      const discountCode = cart?.discountCodes?.[0];

      if (!discountCode || !discountCode.applicable) {
        // Get current cart pricing even when promo is not applicable
        const currentSubtotal = parseFloat(cart?.estimatedCost?.subtotalAmount?.amount || session.subtotal);
        const currentTax = parseFloat(cart?.estimatedCost?.totalTaxAmount?.amount || session.tax);
        const shippingCost = session.shippingCost || 0;
        const currentGrandTotal = currentSubtotal + shippingCost + currentTax;

        this.setStatus(400);
        return {
          success: false,
          data: {
            discount: {
              code: promoCode.trim().toUpperCase(),
              amount: 0,
              type: 'fixed_amount',
              applicable: false,
            },
            pricing: {
              subtotal: currentSubtotal,
              shippingCost: shippingCost,
              discountAmount: 0,
              couponDiscount: 0,
              tax: currentTax,
              grandTotal: currentGrandTotal,
              currency: cart?.estimatedCost?.subtotalAmount?.currencyCode || session.currency,
            },
          },
          message: 'Promo code is not applicable to this order. Please check the code requirements.',
        };
      }

      // Calculate discount amount
      let discountAmount = 0;
      if (cart.discountAllocations && cart.discountAllocations.length > 0) {
        discountAmount = cart.discountAllocations.reduce((sum: number, allocation: any) => {
          return sum + parseFloat(allocation.discountedAmount?.amount || '0');
        }, 0);
      }

      // Get current pricing from Shopify cart (real-time)
      const currentSubtotal = parseFloat(cart.estimatedCost?.subtotalAmount?.amount || '0');
      const currentTax = parseFloat(cart.estimatedCost?.totalTaxAmount?.amount || '0');
      const shippingCost = session.shippingCost || 0;

      // Update session with real-time values
      session.promoCode = discountCode.code;
      session.discount = {
        code: discountCode.code,
        amount: discountAmount,
        type: 'fixed_amount', // Shopify returns fixed amount discounts
        applicable: true,
      };

      // Update all pricing fields with current Shopify values
      session.updatePricing({
        subtotal: currentSubtotal,
        discountAmount: discountAmount,
        tax: currentTax,
        shippingCost: shippingCost
      });

      await session.save();

      return {
        success: true,
        data: {
          discount: {
            code: discountCode.code,
            amount: discountAmount,
            type: 'fixed_amount',
            applicable: true,
          },
          pricing: {
            subtotal: session.subtotal,
            shippingCost: session.shippingCost,
            discountAmount: session.discountAmount,
            couponDiscount: session.discountAmount,
            tax: session.tax,
            grandTotal: session.grandTotal,
            currency: cart.estimatedCost?.subtotalAmount?.currencyCode || session.currency,
          },
        },
        message: 'Promo code applied successfully',
      };
    } catch (error) {
      console.error('Error applying promo code:', error);

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Get checkout summary
   *
   * Returns complete checkout details for review before payment
   *
   * @param sessionId - Checkout session ID
   * @param request - Express request with authenticated user
   * @returns Complete checkout summary
   */
  @Get('summary/{sessionId}')
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(404, 'Session not found')
  @Response(500, 'Internal Server Error')
  public async getCheckoutSummary(
    @Path() sessionId: string,
    @Request() request: any
  ): Promise<CheckoutSummaryResponse> {
    try {
      const userId = request.user._id;

      // Find session
      const session = await CheckoutSession.findById(sessionId) as ICheckoutSessionDocument | null;

      if (!session) {
        this.setStatus(404);
        throw new Error('Checkout session not found');
      }

      // Verify ownership
      if (!session.belongsToUser(userId)) {
        this.setStatus(403);
        throw new Error('Unauthorized access to checkout session');
      }

      // Get user for address
      const user = await User.findById(userId);
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      // Get cart items from Shopify
      const cartResponse = await shopifyStorefront.getCart(session.shopifyCartId);
      const cart = cartResponse?.data?.cart;

      if (!cart) {
        this.setStatus(404);
        throw new Error('Cart not found');
      }

      // Transform cart items
      const items = (cart.lines?.edges || []).map((edge: any) => {
        const node = edge.node;
        const merchandise = node.merchandise;

        return {
          id: node.id,
          title: merchandise.product?.title || '',
          variantTitle: merchandise.title || '',
          image: merchandise.image?.url || null,
          price: parseFloat(merchandise.priceV2?.amount || '0'),
          quantity: node.quantity,
          total: parseFloat(merchandise.priceV2?.amount || '0') * node.quantity,
        };
      });

      // Get shipping address
      const shippingAddress = user.addresses?.[session.shippingAddressId || 0];
      if (!shippingAddress) {
        this.setStatus(400);
        throw new Error('Shipping address not found');
      }

      // Get payment method details from Stripe if payment method ID exists
      let paymentMethodData = {
        id: '',
        displayName: '',
        type: '',
        last4: undefined as string | undefined,
      };

      if (session.paymentMethodId) {
        try {
          const stripePaymentMethod = await stripeService.getPaymentMethod(session.paymentMethodId);
          paymentMethodData = {
            id: stripePaymentMethod.id,
            displayName: stripePaymentMethod.card
              ? `${stripePaymentMethod.card.brand} •••• ${stripePaymentMethod.card.last4}`
              : 'Payment method',
            type: stripePaymentMethod.type,
            last4: stripePaymentMethod.card?.last4,
          };
        } catch (error) {
          console.error('Error fetching payment method details:', error);
          // Continue with empty payment method data
        }
      }

      // Calculate current pricing from Shopify cart (real-time)
      const currentSubtotal = parseFloat(cart.estimatedCost?.subtotalAmount?.amount || '0');
      const currentTax = parseFloat(cart.estimatedCost?.totalTaxAmount?.amount || '0');

      // Get discount from session if promo code was applied, otherwise check cart
      let currentDiscount = session.discountAmount || 0;
      if (!currentDiscount && cart.discountAllocations && cart.discountAllocations.length > 0) {
        currentDiscount = cart.discountAllocations.reduce((sum: number, allocation: any) => {
          return sum + parseFloat(allocation.discountedAmount?.amount || '0');
        }, 0);
      }

      const shippingCost = session.shippingCost || 0;
      const currentGrandTotal = currentSubtotal + shippingCost + currentTax - currentDiscount;

      return {
        success: true,
        data: {
          sessionId: session._id.toString(),
          items,
          shippingAddress: {
            address1: shippingAddress.address1,
            address2: shippingAddress.address2,
            city: shippingAddress.city || '',
            province: shippingAddress.province,
            country: shippingAddress.country,
            zip: shippingAddress.zip,
            phone: shippingAddress.phone,
            firstName: shippingAddress.firstName,
            lastName: shippingAddress.lastName,
          },
          shippingMethod: {
            title: session.selectedShippingRate?.title || '',
            price: session.selectedShippingRate?.price || 0,
            estimatedDelivery: session.selectedShippingRate?.description,
          },
          paymentMethod: paymentMethodData,
          pricing: {
            subtotal: currentSubtotal,
            shippingCost: shippingCost,
            discountAmount: currentDiscount,
            couponDiscount: currentDiscount,
            tax: currentTax,
            grandTotal: currentGrandTotal,
            currency: cart.estimatedCost?.subtotalAmount?.currencyCode || session.currency || 'USD',
          },
          deliveryInstructions: session.deliveryInstructions,
          promoCode: session.promoCode,
          status: session.status,
          paymentError: session.paymentError || undefined,
          expiresAt: session.expiresAt.toISOString(),
        },
      };
    } catch (error) {
      console.error('Error getting checkout summary:', error);

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Complete checkout and process payment
   *
   * Final step: Creates payment intent, processes payment, creates order in Shopify
   *
   * Flow:
   * 1. Validate session and all required data
   * 2. Create Stripe payment intent
   * 3. Confirm payment
   * 4. On success: Create draft order in Shopify
   * 5. Complete draft order
   * 6. Save order in database
   * 7. Mark session as completed
   *
   * @param requestBody - Checkout completion request
   * @param request - Express request with authenticated user
   * @returns Order details and payment status
   */
  @Post('complete')
  @Security('jwt')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Session not found')
  @Response(500, 'Internal Server Error - Payment or order creation failed')
  public async completeCheckout(
    @Body() requestBody: CompleteCheckoutRequest,
    @Request() request: any
  ): Promise<CompleteCheckoutResponse | CheckoutRequiresActionResponse> {
    try {
      const userId = request.user._id;
      const { sessionId } = requestBody;

      if (!sessionId) {
        this.setStatus(400);
        throw new Error('Session ID is required');
      }

      // Find session (paymentMethodId is a string, not a reference, so no need to populate)
      const session = await CheckoutSession.findById(sessionId) as ICheckoutSessionDocument | null;

      if (!session) {
        this.setStatus(404);
        throw new Error('Checkout session not found');
      }

      // Verify ownership
      if (!session.belongsToUser(userId)) {
        this.setStatus(403);
        throw new Error('Unauthorized access to checkout session');
      }

      // Check if already completed
      if (session.status === 'completed') {
        // Return existing order
        const existingOrder = await Order.findById(session.orderId);
        if (existingOrder) {
          return {
            success: true,
            data: {
              order: {
                id: existingOrder._id.toString(),
                orderNumber: existingOrder.orderNumber,
                shopifyOrderId: existingOrder.shopifyOrderId,
                totalPrice: existingOrder.totalPrice,
                currency: existingOrder.currency || 'USD',
                status: existingOrder.status,
              },
              payment: {
                status: 'succeeded',
                paymentIntentId: session.stripePaymentIntentId || '',
              },
            },
            message: 'Order already completed',
          };
        }
      }

      // Debug logging
      console.log('Complete checkout validation:', {
        shippingAddressId: session.shippingAddressId,
        selectedShippingRate: session.selectedShippingRate,
        paymentMethodId: session.paymentMethodId,
        status: session.status,
        isReadyForPayment: (session as any).isReadyForPayment
      });

      // Validate all required fields (allow retrying failed sessions)
      const canProceed = (
        (session.shippingAddressId !== undefined && session.shippingAddressId !== null) &&
        !!session.selectedShippingRate &&
        !!session.paymentMethodId &&
        (session.status === 'step3' || session.status === 'failed')
      );

      if (!canProceed) {
        this.setStatus(400);
        const missing = [];
        if (session.shippingAddressId === undefined || session.shippingAddressId === null) missing.push('shipping address');
        if (!session.selectedShippingRate) missing.push('shipping method');
        if (!session.paymentMethodId) missing.push('payment method');
        if (session.status !== 'step3' && session.status !== 'failed') {
          missing.push(`status is '${session.status}' (must be 'step3' or 'failed' to retry)`);
        }

        throw new Error(`Please complete all checkout steps before proceeding. Missing: ${missing.join(', ')}`);
      }

      // Reset failed status to allow retry
      if (session.status === 'failed') {
        console.log('Retrying failed checkout session:', session._id.toString());
        session.status = 'step3';
        session.paymentStatus = 'pending';
        session.paymentError = undefined;
      }

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      // paymentMethodId is a string (Stripe PM ID like "pm_xxx")
      const paymentMethodId = session.paymentMethodId;
      if (!paymentMethodId) {
        this.setStatus(400);
        throw new Error('Payment method not found');
      }

      // Get cart from Shopify for final validation and pricing
      // Use try-catch with retry logic for Shopify API calls
      let cart = null;
      let cartFetchAttempts = 0;
      const maxCartFetchAttempts = 3;

      while (cartFetchAttempts < maxCartFetchAttempts && !cart) {
        try {
          cartFetchAttempts++;
          console.log(`Fetching cart from Shopify (attempt ${cartFetchAttempts}/${maxCartFetchAttempts})...`);

          const cartResponse = await shopifyStorefront.getCart(session.shopifyCartId);
          cart = cartResponse?.data?.cart;

          if (cart && cart.lines?.edges && cart.lines.edges.length > 0) {
            console.log('✓ Cart fetched successfully from Shopify');
            break;
          }
        } catch (error: any) {
          console.error(`Cart fetch attempt ${cartFetchAttempts} failed:`, error.message);

          // If this is the last attempt or it's not a retryable error, throw
          if (cartFetchAttempts >= maxCartFetchAttempts || (error.response?.status !== 503 && error.response?.status !== 429)) {
            console.error('All cart fetch attempts failed or non-retryable error');
            break;
          }

          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, cartFetchAttempts * 1000));
        }
      }

      // If cart fetch failed, use session data as fallback
      if (!cart || !cart.lines?.edges || cart.lines.edges.length === 0) {
        console.warn('⚠ Could not fetch cart from Shopify, using session data as fallback');

        // Validate that session has required data
        if (!session.subtotal || session.subtotal <= 0) {
          this.setStatus(400);
          throw new Error('Cart data unavailable. Please restart checkout process.');
        }

        // Use session data for pricing (already validated during save-shipping step)
        console.log('Using session pricing data:', {
          subtotal: session.subtotal,
          tax: session.tax,
          discount: session.discountAmount,
          shipping: session.shippingCost,
          grandTotal: session.grandTotal
        });

        // No need to update pricing, session already has correct values
        // Just proceed with existing session data
      } else {
        // Cart fetched successfully, update session with current cart pricing
        const currentSubtotal = parseFloat(cart.estimatedCost?.subtotalAmount?.amount || '0');
        const currentTax = parseFloat(cart.estimatedCost?.totalTaxAmount?.amount || '0');

        // Calculate discount if promo code was applied
        let currentDiscount = 0;
        if (cart.discountAllocations && cart.discountAllocations.length > 0) {
          currentDiscount = cart.discountAllocations.reduce((sum: number, allocation: any) => {
            return sum + parseFloat(allocation.discountedAmount?.amount || '0');
          }, 0);
        }

        // Fallback: if Shopify cart doesn't have discount allocations but session has discount, use that
        if (currentDiscount === 0 && session.discount && session.discount.amount) {
          currentDiscount = session.discount.amount;
        }

        // Update session pricing with current Shopify values
        session.updatePricing({
          subtotal: currentSubtotal,
          tax: currentTax,
          discountAmount: currentDiscount,
          shippingCost: session.shippingCost || 0
        });

        console.log('Updated session pricing from Shopify cart:', {
          subtotal: session.subtotal,
          tax: session.tax,
          discount: session.discountAmount,
          shipping: session.shippingCost,
          grandTotal: session.grandTotal
        });
      }

      console.log('Updated session pricing before payment:', {
        subtotal: session.subtotal,
        tax: session.tax,
        discount: session.discountAmount,
        shipping: session.shippingCost,
        grandTotal: session.grandTotal
      });

      // Update session status
      session.status = 'payment_processing';
      await session.save();

      // Create Stripe customer if not exists
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const stripeCustomer = await stripeService.createCustomer(user.email, {
          userId: userId.toString(),
          name: user.name || '',
        });
        stripeCustomerId = stripeCustomer.id;
        user.stripeCustomerId = stripeCustomerId;
        await user.save();
      }

      // Create payment intent
      const paymentIntent = await stripeService.createPaymentIntent(
        stripeService.dollarsToCents(session.grandTotal),
        session.currency.toLowerCase(),
        stripeCustomerId,
        paymentMethodId, // paymentMethodId is the Stripe PM ID string (e.g., "pm_xxx")
        {
          sessionId: session._id.toString(),
          userId: userId.toString(),
          orderType: 'shopify_draft',
        }
      );

      // Save payment intent ID
      session.stripePaymentIntentId = paymentIntent.id;
      session.stripeClientSecret = paymentIntent.client_secret || undefined;
      await session.save();

      // Confirm payment
      const confirmedIntent = await stripeService.confirmPaymentIntent(paymentIntent.id);

      // Check if requires action (3D Secure)
      if (stripeService.requiresAction(confirmedIntent)) {
        session.paymentStatus = 'requires_action';
        await session.save();

        return {
          success: true,
          requiresAction: true,
          data: {
            paymentIntentId: confirmedIntent.id,
            clientSecret: confirmedIntent.client_secret || '',
            nextAction: {
              type: confirmedIntent.next_action?.type || 'unknown',
              redirectUrl: (confirmedIntent.next_action as any)?.redirect_to_url?.url,
            },
          },
          message: 'Additional authentication required',
        };
      }

      // Check payment success
      if (!stripeService.isSucceeded(confirmedIntent)) {
        session.paymentStatus = 'failed';
        session.paymentError = 'Payment failed. Please try again or use a different payment method.';
        session.status = 'failed';
        await session.save();

        this.setStatus(400);
        throw new Error('Payment failed. Please try again.');
      }

      // Payment succeeded - Create order in Shopify
      session.paymentStatus = 'succeeded';
      await session.save();

      // Get shipping address and normalize for Shopify
      const shippingAddress = user.addresses?.[session.shippingAddressId || 0];

      if (!shippingAddress) {
        console.error('Shipping address not found:', {
          shippingAddressId: session.shippingAddressId,
          totalAddresses: user.addresses?.length
        });
        this.setStatus(400);
        throw new Error('Shipping address not found. Please select a valid address.');
      }

      // Log address details for debugging
      console.log('Using shipping address:', {
        addressId: session.shippingAddressId,
        hasFirstName: !!shippingAddress.firstName,
        hasLastName: !!shippingAddress.lastName,
        country: shippingAddress.country,
        city: shippingAddress.city
      });

      const normalizedShippingAddress = normalizeAddressForShopify({
        country: shippingAddress.country,
        countryCode: shippingAddress.countryCode,
        province: shippingAddress.province,
      });

      // If cart wasn't fetched successfully, we need to fetch it again for line items
      // This is critical for order creation
      if (!cart || !cart.lines?.edges) {
        console.log('Cart not available, attempting final fetch for line items...');
        try {
          const finalCartResponse = await shopifyStorefront.getCart(session.shopifyCartId);
          cart = finalCartResponse?.data?.cart;

          if (!cart || !cart.lines?.edges || cart.lines.edges.length === 0) {
            console.error('❌ Critical: Cannot create order without cart items');
            this.setStatus(400);
            throw new Error('Unable to retrieve cart items. Please try again or contact support.');
          }
          console.log('✓ Cart fetched successfully for line items');
        } catch (error: any) {
          console.error('❌ Final cart fetch failed:', error.message);
          this.setStatus(500);
          throw new Error('Unable to retrieve cart items from Shopify. Please try again in a moment.');
        }
      }

      const lineItems = await Promise.all(cart.lines.edges.map(async (edge: any) => {
        const node = edge.node;
        const merchandise = node.merchandise;
        const itemPrice = parseFloat(merchandise.priceV2?.amount || '0');

        // Find MongoDB product ID from Shopify product ID for image population
        let productId = null;
        if (merchandise.product?.id) {
          const product = await Product.findOne({ shopifyProductId: merchandise.product.id });
          productId = product?._id;
        }

        // Get product image from Shopify cart
        const productImage = merchandise.image?.url || merchandise.product?.featuredImage?.url || null;

        return {
          productId, // MongoDB product ID for populate
          shopifyProductId: merchandise.product?.id,
          shopifyVariantId: merchandise.id,
          title: merchandise.product?.title || 'Product',
          variantTitle: merchandise.title || null,
          image: productImage, // Direct image URL from Shopify
          sku: merchandise.sku || '',
          quantity: node.quantity,
          price: itemPrice,
        };
      }));

      const orderNumber = `ORD-${Date.now()}-${userId.toString().slice(-6).toUpperCase()}`;

      const order = new Order({
        user: userId,
        orderNumber,
        confirmationNumber: `CONF-${Date.now()}`,
        email: user.email,
        phone: session.contactNumber,
        lineItems,
        subtotalPrice: session.subtotal,
        totalTax: session.tax,
        discount: session.discountAmount || 0,
        shippingCost: session.shippingCost || 0,
        totalPrice: session.grandTotal,
        currency: session.currency,
        financial: {
          status: 'paid',
          method: 'stripe',
          transactionId: paymentIntent.id,
          paidAt: new Date(),
        },
        payment: {
          method: 'stripe',
          status: 'paid',
          transactionId: paymentIntent.id,
          amount: session.grandTotal,
          currency: session.currency,
          paidAt: new Date(),
        },
        shippingAddress: {
          firstName: shippingAddress.firstName || user.name?.split(' ')[0] || 'Customer',
          lastName: shippingAddress.lastName || user.name?.split(' ').slice(1).join(' ') || '',
          address1: shippingAddress.address1,
          address2: shippingAddress.address2,
          city: shippingAddress.city,
          province: shippingAddress.province,
          country: shippingAddress.country,
          zip: shippingAddress.zip,
          phone: session.contactNumber || shippingAddress.phone,
          countryCode: shippingAddress.countryCode,
          provinceCode: normalizedShippingAddress.provinceCode,
        },
        shipping: {
          method: session.selectedShippingRate?.title || 'Standard',
          cost: session.shippingCost,
          estimatedDelivery: session.selectedShippingRate?.estimatedDelivery,
        },
        status: 'pending',
        fulfillmentStatus: 'unfulfilled',
        notes: session.deliveryInstructions || '',
        source: 'mobile',
        metadata: {
          stripePaymentIntentId: paymentIntent.id,
          checkoutSessionId: session._id.toString(),
          cartId: session.shopifyCartId,
        },
      });

      await order.save();

      // Mark session as completed
      session.orderId = order._id;
      session.status = 'completed';
      session.completeStep(3);
      await session.save();

      // Get payment method details from Stripe for complete response
      const stripePaymentMethod = await stripeService.getPaymentMethod((session as any).paymentMethodId);

      // Cast session and order to any for type flexibility
      const sessionData = session as any;
      const orderData = order as any;

      // Build complete response with all order details
      return {
        success: true,
        data: {
          order: {
            // Basic Order Information
            id: order._id.toString(),
            orderNumber: orderData.orderNumber,
            confirmationNumber: orderData.confirmationNumber || `CONF-${Date.now()}`,
            shopifyOrderId: orderData.shopifyOrderId || null,
            email: orderData.email,
            phone: sessionData.contactNumber || shippingAddress.phone,

            // Products Purchased - Complete Details
            products: orderData.lineItems.map((item: any) => ({
              productId: item.shopifyProductId,
              variantId: item.shopifyVariantId,
              title: item.title,
              sku: item.sku,
              quantity: item.quantity,
              price: item.price,
              totalPrice: item.price * item.quantity,
              // Use image from lineItem (already saved during order creation)
              // Fallback to cart if available
              image: item.image || (cart?.lines?.edges?.find((edge: any) =>
                edge.node.merchandise.id === item.shopifyVariantId
              )?.node.merchandise.image?.url) || null,
            })),

            // Complete Pricing Breakdown
            pricing: {
              subtotal: orderData.subtotalPrice,
              shippingCost: orderData.shippingCost || 0,
              discount: orderData.discount || 0,
              tax: orderData.totalTax,
              totalPrice: orderData.totalPrice,
              currency: orderData.currency || 'USD',
            },

            // Discount Information (if applied)
            discount: sessionData.discount ? {
              code: sessionData.discount.code,
              amount: sessionData.discount.amount,
              type: sessionData.discount.type,
              applicable: sessionData.discount.applicable,
            } : null,

            // Complete Shipping Address
            shippingAddress: {
              firstName: shippingAddress.firstName || user.name?.split(' ')[0] || 'Customer',
              lastName: shippingAddress.lastName || user.name?.split(' ').slice(1).join(' ') || '',
              fullName: `${shippingAddress.firstName || user.name?.split(' ')[0] || 'Customer'} ${shippingAddress.lastName || user.name?.split(' ').slice(1).join(' ') || ''}`.trim(),
              company: shippingAddress.company || null,
              address1: shippingAddress.address1,
              address2: shippingAddress.address2 || null,
              city: shippingAddress.city,
              province: shippingAddress.province,
              country: shippingAddress.country,
              zip: shippingAddress.zip,
              phone: sessionData.contactNumber || shippingAddress.phone,
            },

            // Billing Address (same as shipping for now)
            billingAddress: {
              firstName: shippingAddress.firstName || user.name?.split(' ')[0] || 'Customer',
              lastName: shippingAddress.lastName || user.name?.split(' ').slice(1).join(' ') || '',
              fullName: `${shippingAddress.firstName || user.name?.split(' ')[0] || 'Customer'} ${shippingAddress.lastName || user.name?.split(' ').slice(1).join(' ') || ''}`.trim(),
              company: shippingAddress.company || null,
              address1: shippingAddress.address1,
              address2: shippingAddress.address2 || null,
              city: shippingAddress.city,
              province: shippingAddress.province,
              country: shippingAddress.country,
              zip: shippingAddress.zip,
              phone: sessionData.contactNumber || shippingAddress.phone,
            },

            // Payment Details - Complete
            payment: {
              method: 'stripe',
              status: 'succeeded',
              transactionId: paymentIntent.id,
              cardBrand: stripePaymentMethod.card?.brand || null,
              last4: stripePaymentMethod.card?.last4 || null,
              amount: orderData.totalPrice,
              currency: orderData.currency || 'USD',
              paidAt: new Date().toISOString(),
            },

            // Shipping Details
            shipping: {
              method: sessionData.selectedShippingRate?.title || 'Standard Shipping',
              cost: sessionData.shippingCost || 0,
              estimatedDelivery: sessionData.selectedShippingRate?.description || 'TBD',
              carrier: null,
              trackingNumber: null,
            },

            // Delivery Instructions
            deliveryInstructions: sessionData.deliveryInstructions || null,

            // Order Status
            orderStatus: {
              current: orderData.status || 'pending',
              fulfillment: orderData.fulfillmentStatus || 'unfulfilled',
              financial: orderData.financial?.status || orderData.payment?.status || 'paid',
            },

            // Timestamps
            dates: {
              placedAt: new Date().toISOString(),
              estimatedDelivery: sessionData.selectedShippingRate?.description || null,
            },

            // Summary
            summary: {
              totalItems: orderData.lineItems.reduce((sum: number, item: any) => sum + item.quantity, 0),
              totalProducts: orderData.lineItems.length,
              hasSavedMoney: (orderData.discount || 0) > 0,
              savedAmount: orderData.discount || 0,
            },
          },
        },
        message: 'Order created successfully',
      };
    } catch (error) {
      console.error('Error completing checkout:', error);

      // Update session status on error
      try {
        const session = await CheckoutSession.findById(requestBody.sessionId) as ICheckoutSessionDocument | null;
        if (session) {
          (session as any).status = 'failed';
          (session as any).paymentError = (error as Error).message;
          await session.save();
        }
      } catch (updateError) {
        console.error('Failed to update session status:', updateError);
      }

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }
}
