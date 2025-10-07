/**
 * Cart item input for adding to cart
 */
export interface CartItemInput {
  merchandiseId: string;
  quantity: number;
}

/**
 * Cart line item details
 */
export interface CartLineItem {
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
 * Cart data
 */
export interface CartData {
  cartId: string;
  items: CartLineItem[];
  totalQuantity: number;
  subtotal: number;
  currency: string;
}

/**
 * Cart API response
 */
export interface CartResponse {
  success: boolean;
  data: CartData;
}

/**
 * Cart create request body
 */
export interface CartCreateRequest {
  items?: CartItemInput[];
}

/**
 * Add items to cart request body
 */
export interface AddItemsRequest {
  items: CartItemInput[];
}

/**
 * Update item quantity request body
 */
export interface UpdateItemQuantityRequest {
  quantity: number;
}

/**
 * Clear cart response
 */
export interface ClearCartResponse {
  success: boolean;
  message: string;
}
