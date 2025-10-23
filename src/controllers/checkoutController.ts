import { Body, Controller, Get, Path, Post, Query, Request, Route, Security, Tags, Response } from 'tsoa';
import CheckoutSession from '../models/CheckoutSession';
import PaymentMethod from '../models/PaymentMethod';
import User from '../models/User';
import Order from '../models/Order';
import shopifyStorefront from '../services/shopifyStorefrontService';
import stripeService from '../services/stripeService';
import { normalizeAddressForShopify } from '../utils/addressHelper';
import {
  InitCheckoutRequest,
  InitCheckoutResponse,
  GetShippingRatesResponse,
  SaveStep1Request,
  SaveStep1Response,
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
      const existingSession = await CheckoutSession.findActiveByUser(userId);
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

      // Validate input
      if (!sessionId || addressId === undefined) {
        this.setStatus(400);
        throw new Error('Session ID and address ID are required');
      }

      // Find checkout session
      const session = await CheckoutSession.findById(sessionId);
      if (!session) {
        this.setStatus(404);
        throw new Error('Checkout session not found');
      }

      // Verify ownership
      if (!session.belongsToUser(userId)) {
        this.setStatus(403);
        throw new Error('Unauthorized access to checkout session');
      }

      // Check expiration
      if ((session as any).isExpired) {
        this.setStatus(400);
        throw new Error('Checkout session has expired');
      }

      // Get user and address
      const user = await User.findById(userId);
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      if (!user.addresses || !user.addresses[addressId]) {
        this.setStatus(404);
        throw new Error('Address not found');
      }

      const address = user.addresses[addressId];

      // Normalize address to ISO codes for Shopify
      const normalizedAddress = normalizeAddressForShopify({
        country: address.country,
        countryCode: address.countryCode,
        province: address.province,
      });

      // Update cart delivery address to get shipping rates from Shopify
      // Using new 2025-01 API (cartDeliveryAddressesAdd)
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

      if (shopifyResponse?.data?.cartDeliveryAddressesAdd?.userErrors?.length > 0) {
        const error = shopifyResponse.data.cartDeliveryAddressesAdd.userErrors[0];
        this.setStatus(400);
        throw new Error(error.message || 'Failed to get shipping rates');
      }

      const cart = shopifyResponse?.data?.cartDeliveryAddressesAdd?.cart;
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
   * Save Step 1: Shipping information
   *
   * @param requestBody - Shipping details
   * @param request - Express request with authenticated user
   * @returns Updated session
   */
  @Post('step1')
  @Security('jwt')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Session not found')
  @Response(500, 'Internal Server Error')
  public async saveStep1(
    @Body() requestBody: SaveStep1Request,
    @Request() request: any
  ): Promise<SaveStep1Response> {
    try {
      const userId = request.user._id;
      const { sessionId, shippingAddressId, deliveryInstructions, contactNumber, shippingRateHandle } = requestBody;

      // Validate input
      if (!sessionId || shippingAddressId === undefined || !contactNumber || !shippingRateHandle) {
        this.setStatus(400);
        throw new Error('All shipping fields are required');
      }

      // Find session
      const session = await CheckoutSession.findById(sessionId);
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
      const cart = shopifyResponse?.data?.cartDeliveryAddressesAdd?.cart;
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
      console.error('Error saving step 1:', error);

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
      const session = await CheckoutSession.findById(sessionId);
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

      // Find and validate payment method
      const paymentMethod = await PaymentMethod.findById(paymentMethodId);
      if (!paymentMethod) {
        this.setStatus(404);
        throw new Error('Payment method not found');
      }

      // Verify ownership
      if (!paymentMethod.belongsToUser(userId)) {
        this.setStatus(403);
        throw new Error('Unauthorized access to payment method');
      }

      // Check if expired
      if (paymentMethod.isExpired) {
        this.setStatus(400);
        throw new Error('Payment method has expired');
      }

      // Update session
      session.paymentMethodId = paymentMethod._id;

      // Mark step 2 complete and move to step 3
      session.completeStep(2);
      session.status = 'step3';
      session.currentStep = 3;

      // Extend expiration
      session.extendExpiration(30);

      await session.save();

      return {
        success: true,
        data: {
          sessionId: session._id.toString(),
          status: session.status,
          currentStep: session.currentStep,
          completedSteps: session.completedSteps,
          paymentMethod: {
            id: paymentMethod._id.toString(),
            displayName: (paymentMethod as any).displayName,
            type: paymentMethod.type,
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
      const session = await CheckoutSession.findById(sessionId);
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
        session.promoCode = undefined;
        session.discount = undefined;
        session.updatePricing({ discountAmount: 0 });
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
              currency: session.currency,
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
        this.setStatus(400);
        throw new Error('Promo code is not applicable to this order');
      }

      // Calculate discount amount
      let discountAmount = 0;
      if (cart.discountAllocations && cart.discountAllocations.length > 0) {
        discountAmount = cart.discountAllocations.reduce((sum: number, allocation: any) => {
          return sum + parseFloat(allocation.discountedAmount?.amount || '0');
        }, 0);
      }

      // Update session
      session.promoCode = discountCode.code;
      session.discount = {
        code: discountCode.code,
        amount: discountAmount,
        type: 'fixed_amount', // Shopify returns fixed amount discounts
        applicable: true,
      };
      session.updatePricing({ discountAmount });

      // Update tax from cart (may change with discount)
      session.tax = parseFloat(cart?.estimatedCost?.totalTaxAmount?.amount || '0');
      session.updatePricing({ tax: session.tax });

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
            currency: session.currency,
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

      // Find session with populated references
      const session = await CheckoutSession.findById(sessionId).populate('paymentMethodId');

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

      // Get payment method
      const paymentMethod = session.paymentMethodId as any;

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
          paymentMethod: {
            id: paymentMethod?._id?.toString() || '',
            displayName: paymentMethod?.displayName || '',
            type: paymentMethod?.type || '',
            last4: paymentMethod?.card?.last4,
          },
          pricing: {
            subtotal: session.subtotal,
            shippingCost: session.shippingCost,
            discountAmount: session.discountAmount,
            couponDiscount: session.discountAmount,
            tax: session.tax,
            grandTotal: session.grandTotal,
            currency: session.currency,
          },
          deliveryInstructions: session.deliveryInstructions,
          promoCode: session.promoCode,
          status: session.status,
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

      // Find session with all populated data
      const session = await CheckoutSession.findById(sessionId).populate('paymentMethodId');

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

      // Validate all required fields
      if (!(session as any).isReadyForPayment) {
        this.setStatus(400);
        throw new Error('Please complete all checkout steps before proceeding');
      }

      // Get user and payment method
      const user = await User.findById(userId);
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      const paymentMethod = session.paymentMethodId as any;
      if (!paymentMethod) {
        this.setStatus(400);
        throw new Error('Payment method not found');
      }

      // Get cart from Shopify for final validation
      const cartResponse = await shopifyStorefront.getCart(session.shopifyCartId);
      const cart = cartResponse?.data?.cart;

      if (!cart || !cart.lines?.edges || cart.lines.edges.length === 0) {
        this.setStatus(400);
        throw new Error('Cart is empty or no longer available');
      }

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
        paymentMethod.stripePaymentMethodId,
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
      const normalizedShippingAddress = normalizeAddressForShopify({
        country: shippingAddress.country,
        countryCode: shippingAddress.countryCode,
        province: shippingAddress.province,
      });

      // Prepare line items for draft order
      const lineItems = cart.lines.edges.map((edge: any) => ({
        variantId: edge.node.merchandise.id,
        quantity: edge.node.quantity,
      }));

      // Create draft order
      const draftOrderResponse = await shopifyStorefront.createDraftOrder({
        email: user.email,
        lineItems,
        shippingAddress: {
          address1: shippingAddress.address1,
          address2: shippingAddress.address2,
          city: shippingAddress.city || '',
          province: normalizedShippingAddress.provinceCode,
          country: normalizedShippingAddress.countryCode,
          zip: shippingAddress.zip,
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          phone: session.contactNumber || shippingAddress.phone,
        },
        shippingLine: session.selectedShippingRate ? {
          title: session.selectedShippingRate.title,
          price: session.selectedShippingRate.price,
          shippingRateHandle: session.selectedShippingRate.handle,
        } : undefined,
        note: session.deliveryInstructions,
        tags: ['mobile-app', 'stripe-payment'],
        metafields: [
          { namespace: 'custom', key: 'payment_intent_id', value: paymentIntent.id, type: 'single_line_text_field' },
          { namespace: 'custom', key: 'session_id', value: session._id.toString(), type: 'single_line_text_field' },
        ],
      });

      if (draftOrderResponse?.data?.draftOrderCreate?.userErrors?.length > 0) {
        const error = draftOrderResponse.data.draftOrderCreate.userErrors[0];
        throw new Error(`Failed to create draft order: ${error.message}`);
      }

      const draftOrder = draftOrderResponse?.data?.draftOrderCreate?.draftOrder;
      session.shopifyDraftOrderId = draftOrder.id;
      await session.save();

      // Complete draft order (paymentPending=false since we already processed payment)
      const completeResponse = await shopifyStorefront.completeDraftOrder(draftOrder.id, false);

      if (completeResponse?.data?.draftOrderComplete?.userErrors?.length > 0) {
        const error = completeResponse.data.draftOrderComplete.userErrors[0];
        throw new Error(`Failed to complete order: ${error.message}`);
      }

      const shopifyOrder = completeResponse?.data?.draftOrderComplete?.draftOrder?.order;
      session.shopifyOrderId = shopifyOrder.id;

      // Create order in database
      const order = new Order({
        userId,
        shopifyOrderId: shopifyOrder.id,
        orderNumber: shopifyOrder.name,
        confirmationNumber: shopifyOrder.confirmationNumber,
        email: user.email,
        totalPrice: session.grandTotal,
        subtotal: session.subtotal,
        shippingCost: session.shippingCost,
        tax: session.tax,
        discount: session.discountAmount,
        currency: session.currency,
        paymentMethod: 'stripe',
        paymentStatus: 'paid',
        shippingAddress: shippingAddress,
        status: 'pending',
      });

      await order.save();

      // Mark session as completed
      session.orderId = order._id;
      session.status = 'completed';
      session.completeStep(3);
      await session.save();

      return {
        success: true,
        data: {
          order: {
            id: order._id.toString(),
            orderNumber: order.orderNumber,
            shopifyOrderId: order.shopifyOrderId,
            confirmationNumber: order.confirmationNumber,
            totalPrice: order.totalPrice,
            currency: order.currency || 'USD',
            status: order.status,
            estimatedDelivery: session.selectedShippingRate?.description,
          },
          payment: {
            status: 'succeeded',
            paymentIntentId: paymentIntent.id,
          },
        },
        message: 'Order created successfully',
      };
    } catch (error) {
      console.error('Error completing checkout:', error);

      // Update session status on error
      try {
        const session = await CheckoutSession.findById(requestBody.sessionId);
        if (session) {
          session.status = 'failed';
          session.paymentError = (error as Error).message;
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
