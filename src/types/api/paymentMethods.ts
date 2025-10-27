/**
 * Stored Payment Methods API Types
 * Used by TSOA controllers for OpenAPI/Swagger generation
 * Note: Prefix "Stored" to avoid conflicts with checkout payment method types
 */

/**
 * Stored payment method card details
 */
export interface StoredPaymentCard {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  country?: string;
}

/**
 * Stored payment method object (sanitized from Stripe)
 */
export interface StoredPaymentMethod {
  id: string;
  type: string;
  card?: StoredPaymentCard;
  isDefault: boolean;
  created: number;
  allow_redisplay?: string;
}

/**
 * Store payment method request
 */
export interface StorePaymentMethodRequest {
  paymentMethodId: string; // Created by Stripe SDK on frontend
  setAsDefault?: boolean;
}

/**
 * Store payment method response
 */
export interface StorePaymentMethodResponse {
  success: boolean;
  message: string;
  data?: {
    paymentMethod: StoredPaymentMethod;
  };
}

/**
 * List stored payment methods response
 */
export interface ListStoredPaymentMethodsResponse {
  success: boolean;
  data: {
    paymentMethods: StoredPaymentMethod[];
    defaultPaymentMethodId?: string;
    count: number;
  };
}

/**
 * Delete stored payment method response
 */
export interface DeleteStoredPaymentMethodResponse {
  success: boolean;
  message: string;
}

/**
 * Update default payment method request
 */
export interface UpdateDefaultPaymentMethodRequest {
  paymentMethodId: string;
}

/**
 * Update default payment method response
 */
export interface UpdateDefaultPaymentMethodResponse {
  success: boolean;
  message: string;
  data?: {
    paymentMethodId: string;
  };
}

/**
 * Get default stored payment method response
 */
export interface GetDefaultStoredPaymentMethodResponse {
  success: boolean;
  data?: {
    paymentMethod: StoredPaymentMethod;
  };
  message?: string;
}
