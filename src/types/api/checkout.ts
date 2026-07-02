/**
 * Checkout API Types
 *
 * TypeScript interfaces for checkout flow requests and responses
 * Ensures type safety across checkout controllers and services
 */

// =============================================================================
// COMMON TYPES
// =============================================================================

export interface ShippingRate {
  handle: string;
  title: string;
  price: number;
  currencyCode: string;
  description?: string;
  estimatedDelivery?: string;
  deliveryMethodType?: string;
}

export interface DiscountInfo {
  code: string;
  amount: number;
  type: 'percentage' | 'fixed_amount';
  applicable: boolean;
}

export interface PricingBreakdown {
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  couponDiscount: number;
  tax: number;
  grandTotal: number;
  currency: string;
}

export interface AddressSummary {
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
}

// =============================================================================
// CHECKOUT SESSION
// =============================================================================

/**
 * Request to initialize checkout session
 */
export interface InitCheckoutRequest {
  cartId: string;
}

/**
 * Response for checkout session initialization
 */
export interface InitCheckoutResponse {
  success: boolean;
  data: {
    sessionId: string;
    cartId: string;
    subtotal: number;
    currency: string;
    itemCount: number;
    expiresAt: string;
  };
}

// =============================================================================
// STEP 1: SHIPPING
// =============================================================================

/**
 * Request to get shipping rates
 */
export interface GetShippingRatesRequest {
  sessionId: string;
  addressId: number; // Index in user.addresses array
}

/**
 * Response with available shipping rates
 */
export interface GetShippingRatesResponse {
  success: boolean;
  data: {
    shippingRates: ShippingRate[];
    address: AddressSummary;
  };
}

/**
 * Request to save shipping information
 */
export interface SaveShippingRequest {
  sessionId: string;
  shippingAddressId: number;
  deliveryInstructions?: string;
  contactNumber: string;
  shippingRateHandle: string;
}

/**
 * Response for saving shipping information
 */
export interface SaveShippingResponse {
  success: boolean;
  data: {
    sessionId: string;
    status: string;
    currentStep: number;
    completedSteps: number[];
    shippingCost: number;
    estimatedDelivery?: string;
  };
  message: string;
}

// =============================================================================
// STEP 2: PAYMENT
// =============================================================================

/**
 * Request to save Step 2 (payment method) data
 */
export interface SaveStep2Request {
  sessionId: string;
  paymentMethodId: string;
}

/**
 * Response for Step 2 completion
 */
export interface SaveStep2Response {
  success: boolean;
  data: {
    sessionId: string;
    status: string;
    currentStep: number;
    completedSteps: number[];
    paymentMethod: {
      id: string;
      displayName: string;
      type: string;
    };
  };
  message: string;
}

// =============================================================================
// STEP 3: PROMO CODE & REVIEW
// =============================================================================

/**
 * Request to apply promo code
 */
export interface ApplyPromoRequest {
  sessionId: string;
  promoCode: string;
}

/**
 * Response for promo code application
 */
export interface ApplyPromoResponse {
  success: boolean;
  data: {
    discount: DiscountInfo;
    pricing: PricingBreakdown;
  };
  message?: string;
}

/**
 * Request to remove promo code
 */
export interface RemovePromoRequest {
  sessionId: string;
}

/**
 * Response for promo code removal
 */
export interface RemovePromoResponse {
  success: boolean;
  data: {
    pricing: PricingBreakdown;
  };
  message: string;
}

/**
 * Response for checkout summary
 */
export interface CheckoutSummaryResponse {
  success: boolean;
  data: {
    sessionId: string;
    items: Array<{
      id: string;
      title: string;
      variantTitle?: string;
      image: string | null;
      price: number;
      quantity: number;
      total: number;
    }>;
    shippingAddress: AddressSummary & {
      firstName?: string;
      lastName?: string;
    };
    shippingMethod: {
      title: string;
      price: number;
      estimatedDelivery?: string;
    };
    paymentMethod: {
      id: string;
      displayName: string;
      type: string;
      last4?: string;
    };
    pricing: PricingBreakdown;
    deliveryInstructions?: string;
    promoCode?: string;
    status: string;
    paymentError?: string;
    expiresAt: string;
  };
}

// =============================================================================
// CHECKOUT COMPLETION
// =============================================================================

/**
 * Request to complete checkout and process payment
 */
export interface CompleteCheckoutRequest {
  sessionId: string;
  // Optional: For handling 3D Secure confirmation
  paymentIntentId?: string;
  // Optional: For Google Pay / Apple Pay - one-time use payment method
  // When provided, creates and confirms payment intent immediately without attaching to customer
  paymentMethodId?: string;
}

/**
 * Response for successful checkout completion
 */
export interface CompleteCheckoutResponse {
  success: boolean;
  data: {
    order: {
      id: string;
      orderNumber: string;
      shopifyOrderId?: string;
      confirmationNumber?: string;
      email?: string;
      phone?: string;
      totalPrice: number;
      currency: string;
      status: string;
      estimatedDelivery?: string;
      products?: any[];
      pricing?: any;
      discount?: any;
      shippingAddress?: any;
      billingAddress?: any;
      shippingMethod?: any;
      paymentInfo?: any;
      timeline?: any;
      [key: string]: any; // Allow additional properties
    };
    payment: {
      status: 'succeeded' | 'requires_action' | 'processing';
      paymentIntentId: string;
      clientSecret?: string; // For 3D Secure on frontend
    };
  };
  message: string;
}

/**
 * Response when checkout requires additional action (3D Secure)
 */
export interface CheckoutRequiresActionResponse {
  success: true;
  requiresAction: true;
  data: {
    paymentIntentId: string;
    clientSecret: string;
    nextAction: {
      type: string;
      redirectUrl?: string;
    };
  };
  message: string;
}

// =============================================================================
// ERROR RESPONSES
// =============================================================================

/**
 * Standard error response
 */
export interface CheckoutErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Validation error response
 */
export interface ValidationErrorResponse {
  success: false;
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    fields: Array<{
      field: string;
      message: string;
    }>;
  };
}

// =============================================================================
// PAYMENT METHOD TYPES
// =============================================================================

/**
 * Request to add payment method
 */
export interface AddPaymentMethodRequest {
  stripePaymentMethodId: string; // Created on frontend with Stripe.js
  billingAddress: {
    address1: string;
    address2?: string;
    city: string;
    province: string;
    country: string;
    zip: string;
    firstName?: string;
    lastName?: string;
  };
  isDefault?: boolean;
}

/**
 * Payment method data for responses
 */
export interface PaymentMethodData {
  id: string;
  type: 'card' | 'google_pay' | 'apple_pay';
  displayName: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  billingAddress: {
    address1: string;
    address2?: string;
    city: string;
    province: string;
    country: string;
    zip: string;
  };
  isDefault: boolean;
  isExpired: boolean;
  createdAt: string;
}

/**
 * Response for add payment method
 */
export interface AddPaymentMethodResponse {
  success: boolean;
  data: {
    paymentMethod: PaymentMethodData;
  };
  message: string;
}

/**
 * Response for get payment methods
 */
export interface GetPaymentMethodsResponse {
  success: boolean;
  data: {
    paymentMethods: PaymentMethodData[];
    count: number;
    hasDefault: boolean;
  };
}

/**
 * Response for delete payment method
 */
export interface DeletePaymentMethodResponse {
  success: boolean;
  message: string;
}

/**
 * Response for set default payment method
 */
export interface SetDefaultPaymentMethodResponse {
  success: boolean;
  data: {
    paymentMethod: PaymentMethodData;
  };
  message: string;
}

// =============================================================================
// CART INTEGRATION
// =============================================================================

/**
 * Cart item from Shopify
 */
export interface CartItem {
  id: string;
  merchandiseId: string;
  productId: string;
  title: string;
  variantTitle: string;
  image: string | null;
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  quantityAvailable: number;
}

/**
 * Cart data structure
 */
export interface CartData {
  cartId: string;
  items: CartItem[];
  totalQuantity: number;
  subtotal: number;
  currency: string;
}

// =============================================================================
// SHOPIFY-HOSTED CHECKOUT HANDOFF (SaaS checkout v1)
// =============================================================================

export interface CheckoutHandoffRequest {
  /** Shopify Storefront cart ID */
  cartId: string;
  /**
   * ISO 3166-1 alpha-2 country code for localized checkout (e.g. 'US').
   * Validated here so an invalid value fails fast as a 4xx instead of
   * surfacing as a misleading Shopify-side cart lookup failure.
   * @pattern ^[A-Z]{2}$ country must be a 2-letter uppercase ISO 3166-1 alpha-2 code
   */
  country?: string;
}

export interface CheckoutHandoffData {
  /** Shopify-hosted checkout URL for the tenant store's cart */
  checkoutUrl: string;
  cartId: string;
  storeId: string;
  totalQuantity?: number;
  total?: number;
  currency?: string;
}

export interface CheckoutHandoffResponse {
  success: boolean;
  data: CheckoutHandoffData;
  message?: string;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if response requires action
 */
export function isRequiresActionResponse(
  response: CompleteCheckoutResponse | CheckoutRequiresActionResponse
): response is CheckoutRequiresActionResponse {
  return 'requiresAction' in response && response.requiresAction === true;
}

/**
 * Type guard to check if response is error
 */
export function isErrorResponse(
  response: any
): response is CheckoutErrorResponse | ValidationErrorResponse {
  return response.success === false && 'error' in response;
}
