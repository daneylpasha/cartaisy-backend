import { Document, Types } from 'mongoose';
import { Request } from 'express';

// =============================================================================
// COMMON TYPES
// =============================================================================

export type ObjectId = Types.ObjectId;
export type MongooseDocument<T> = Document<unknown, {}, T> & T;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: ValidationError[];
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    current: number;
    total: number;
    count: number;
    totalItems: number;
  };
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

// =============================================================================
// USER TYPES
// =============================================================================

export interface IAddress {
  label?: string; // Address name like "Home", "Lily 2, London", etc.
  type?: 'billing' | 'shipping' | 'both'; // Made optional, defaults to 'both'
  firstName?: string; // Optional - can derive from user profile
  lastName?: string; // Optional - can derive from user profile
  company?: string;
  address1: string; // Street address
  address2?: string; // Apartment/Suite
  city?: string; // Optional for some countries
  province: string; // State/Province
  country: string; // Country name
  countryCode?: string; // ISO country code like "GB", "US"
  zip: string; // Postcode
  phone?: string;
  deliveryInstructions?: string; // Max 300 characters
  isDefault?: boolean;
}

export interface IUserPreferences {
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  currency: string;
  language: string;
  wishlistItemsCount: number;
}

export interface IUserProfile {
  avatar?: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  interests: string[];
}

export interface IMarketingConsent {
  state: 'subscribed' | 'not_subscribed' | 'pending' | 'unsubscribed';
  optInLevel: 'single_opt_in' | 'confirmed_opt_in' | 'unknown';
  consentUpdatedAt: Date;
}

export interface IMarketing {
  acceptsMarketing: boolean;
  marketingOptInLevel: string;
  emailMarketingConsent: IMarketingConsent;
}

export interface IUser extends Document {
  _id: ObjectId;
  storeId: ObjectId;
  shopifyCustomerId?: string;
  stripeCustomerId?: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  isVerified: boolean;
  isActive: boolean;
  role: 'super_admin' | 'admin' | 'customer' | 'moderator' | 'premium_customer';
  invitedBy?: ObjectId;
  inviteToken?: string;
  inviteExpiresAt?: Date;
  addresses: IAddress[];
  preferences: IUserPreferences;
  profile: IUserProfile;
  marketing: IMarketing;
  lastLoginAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// STORE & MULTI-TENANCY TYPES
// =============================================================================

export interface IShopifyConnection {
  shop: string;
  accessToken: string;
  scope: string;
  isConnected: boolean;
  connectedAt?: Date;
  lastSyncAt?: Date;
}

export interface IStorePlan {
  type: 'free' | 'starter' | 'pro' | 'enterprise';
  maxMembers: number;
  expiresAt?: Date;
}

export interface IStoreSettings {
  timezone: string;
  currency: string;
  language?: string;
}

export interface IStore extends Document {
  _id: ObjectId;
  name: string;
  slug: string;
  shopify: IShopifyConnection;
  plan: IStorePlan;
  settings: IStoreSettings;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// PRODUCT TYPES
// =============================================================================

export interface IProductImage {
  url: string;
  alt: string;
  position: number;
  width?: number;
  height?: number;
}

export interface IVariantOptions {
  option1?: string;
  option2?: string;
  option3?: string;
}

export interface IVariantInventory {
  quantity: number;
  policy?: 'deny' | 'continue';
  tracked: boolean;
}

export interface IProductVariant {
  id: string;
  inventoryItemId?: string; // Shopify inventory_item_id for inventory adjustments
  title: string;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  inventory: IVariantInventory;
  weight?: number;
  weightUnit?: string;
  options: IVariantOptions;
}

export interface IInventoryHistoryEntry {
  date: Date;
  change: number;
  newQuantity: number;
  reason: 'sale' | 'restock' | 'adjustment' | 'return' | 'shopify_sync' | 'manual_update' | 'order_cancelled' | 'order_placed';
  note?: string;
}

export interface IInventoryTracking {
  totalQuantity: number;
  tracked: boolean;
  lowStockThreshold: number;
  history: IInventoryHistoryEntry[];
}

export interface IMobileDisplay {
  thumbnailUrl: string;
  priority: number;
  isFeatured: boolean;
  shortDescription: string;
}

export interface IConversionEvent {
  type: 'view_to_cart' | 'cart_to_purchase' | 'view_to_purchase';
  userId?: ObjectId;
  sessionId?: string;
  timestamp: Date;
  value?: number;
}

export interface IProductAnalytics {
  viewCount: number;
  favoriteCount: number;
  conversionRate: number;
  averageTimeOnPage: number;
  conversionEvents: IConversionEvent[];
  lastViewedAt: Date;
  engagementScore?: number;
  lastCalculated?: Date;
}

export interface IProductReviews {
  count: number;
  averageRating: number;
  totalRating: number;
}

export interface IProductSEO {
  title: string;
  description: string;
  keywords: string[];
  slug: string;
}

export interface IProduct extends Document {
  _id: ObjectId;
  shopifyProductId?: string;
  title: string;
  description: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: 'active' | 'draft' | 'archived';
  price: number;
  compareAtPrice?: number;
  images: IProductImage[];
  variants: IProductVariant[];
  inventoryTracking: IInventoryTracking;
  mobileDisplay: IMobileDisplay;
  analytics: IProductAnalytics;
  reviews: IProductReviews;
  seo: IProductSEO;
  category?: ObjectId | IProductCategory; // Reference to product category
  sku?: string;
  weight?: number;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// ORDER TYPES
// =============================================================================

export interface ILineItem {
  productId: ObjectId;
  variantId?: string;
  title: string;
  variantTitle?: string;
  quantity: number;
  price: number;
  totalPrice: number;
  sku?: string;
}

export interface IShippingAddress extends Omit<IAddress, 'type'> {
  name?: string;
}

export interface IOrderCustomer {
  userId?: ObjectId;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface IOrderTotals {
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
}

export interface IMobileStatusHistory {
  status: string;
  timestamp: Date;
  note?: string;
}

export interface IMobileStatus {
  current: 'placed' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  history: IMobileStatusHistory[];
  estimatedDelivery?: Date;
  trackingNumber?: string;
  trackingUrl?: string;
}

export interface IPaymentDetails {
  method: 'stripe' | 'paypal' | 'shopify_payments' | 'cash_on_delivery';
  status: 'pending' | 'authorized' | 'captured' | 'failed' | 'cancelled' | 'refunded';
  transactionId?: string;
  gatewayTransactionId?: string;
  amount: number;
  currency: string;
  processedAt?: Date;
}


// =============================================================================
// REVIEW TYPES
// =============================================================================

export interface IProductReviewReport {
  reportedBy: ObjectId;
  reason: string;
  description?: string;
  reportedAt: Date;
}

export interface IProductReview extends Document {
  _id: ObjectId;
  productId: ObjectId;
  userId: ObjectId;
  rating: number;
  title: string;
  content: string;
  verified: boolean;
  helpful: number;
  reported: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'spam';
  pros?: string[];
  cons?: string[];
  wouldRecommend?: boolean;
  reports?: IProductReviewReport[];
  adminNotes?: string;
  moderatedAt?: Date;
  moderatedBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// WISHLIST TYPES
// =============================================================================

export interface IWishlistItem {
  productId: ObjectId;
  variantId?: string;
  addedAt: Date;
  note?: string;
}

export interface IWishlist extends Document {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  items: IWishlistItem[];
  isPublic: boolean;
  totalValue?: number; // Virtual property - calculated from items
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// CATEGORY TYPES
// =============================================================================

export interface IProductCategory extends Document {
  _id: ObjectId;
  name: string;
  slug: string;
  description?: string;
  parentId?: ObjectId;
  image?: string;
  isActive: boolean;
  sortOrder: number;
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// SEARCH & TRACKING TYPES
// =============================================================================

export interface ISearchHistory extends Document {
  _id: ObjectId;
  userId?: ObjectId;
  sessionId?: string;
  query: string;
  resultsCount: number;
  selectedProductId?: ObjectId;
  createdAt: Date;
}

export interface IProductView extends Document {
  _id: ObjectId;
  productId: ObjectId;
  userId?: ObjectId;
  sessionId?: string;
  viewedAt: Date;
  source: 'search' | 'category' | 'recommendation' | 'direct' | 'wishlist';
  referrer?: string;
}

// =============================================================================
// SHOPIFY INTEGRATION TYPES
// =============================================================================

export interface IShopifyProduct {
  id: number;
  title: string;
  body_html?: string;
  vendor: string;
  product_type: string;
  created_at: string;
  handle: string;
  updated_at: string;
  published_at?: string;
  template_suffix?: string;
  status: 'active' | 'archived' | 'draft';
  published_scope: string;
  tags: string;
  admin_graphql_api_id: string;
  variants: IShopifyVariant[];
  options: IShopifyOption[];
  images: IShopifyImage[];
  image?: IShopifyImage;
}

export interface IShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku?: string;
  position: number;
  inventory_policy: 'deny' | 'continue';
  compare_at_price?: string;
  fulfillment_service: string;
  inventory_management?: string;
  option1?: string;
  option2?: string;
  option3?: string;
  created_at: string;
  updated_at: string;
  taxable: boolean;
  barcode?: string;
  grams: number;
  image_id?: number;
  weight: number;
  weight_unit: string;
  inventory_item_id: number;
  inventory_quantity: number;
  old_inventory_quantity: number;
  requires_shipping: boolean;
  admin_graphql_api_id: string;
}

export interface IShopifyOption {
  id: number;
  product_id: number;
  name: string;
  position: number;
  values: string[];
}

export interface IShopifyImage {
  id: number;
  product_id: number;
  position: number;
  created_at: string;
  updated_at: string;
  alt?: string;
  width: number;
  height: number;
  src: string;
  variant_ids: number[];
  admin_graphql_api_id: string;
}

export interface IShopifyCustomer {
  id: number;
  email: string;
  accepts_marketing: boolean;
  created_at: string;
  updated_at: string;
  first_name?: string;
  last_name?: string;
  orders_count: number;
  state: string;
  total_spent: string;
  last_order_id?: number;
  note?: string;
  verified_email: boolean;
  multipass_identifier?: string;
  tax_exempt: boolean;
  phone?: string;
  tags: string;
  last_order_name?: string;
  currency: string;
  addresses: IShopifyAddress[];
  accepts_marketing_updated_at: string;
  marketing_opt_in_level?: string;
  tax_exemptions: string[];
  email_marketing_consent?: IShopifyMarketingConsent;
  sms_marketing_consent?: IShopifyMarketingConsent;
  admin_graphql_api_id: string;
  default_address?: IShopifyAddress;
}

export interface IShippingInfo {
  carrier: string;
  method: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: Date;
  cost: number;
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
}

// =============================================================================
// ORDER TYPES
// =============================================================================

export interface IOrderLineItem {
  productId: ObjectId;
  variantId?: string;
  quantity: number;
  price: number;
  title: string;
  sku?: string;
  image?: string;
  properties?: Map<string, string>;
}

export interface IOrderAddress {
  firstName: string;
  lastName?: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
}

export interface IOrderShipping {
  method: string;
  cost: number;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
}

export interface IMobileStatusHistory {
  status: string;
  timestamp: Date;
  note?: string | undefined;
  location?: string | undefined;
}

export interface IOrderNotification {
  type: 'push' | 'email' | 'sms';
  title: string;
  message: string;
  sentAt: Date;
  status: 'sent' | 'delivered' | 'failed';
  deliveredAt?: Date;
}

export interface IOrderRating {
  overallRating: number;
  deliveryRating?: number;
  packagingRating?: number;
  productQualityRating?: number;
  customerServiceRating?: number;
  comment?: string;
  ratedAt: Date;
}

export interface ISupportTicket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: Date;
  lastUpdated: Date;
}

export interface IReturnItem {
  lineItemId: string;
  quantity: number;
  reason: string;
}

export interface IReturnExchange {
  id: string;
  type: 'return' | 'exchange';
  status: 'requested' | 'approved' | 'rejected' | 'processing' | 'completed';
  reason: string;
  items: IReturnItem[];
  requestedAt: Date;
  processedAt?: Date;
  refundAmount?: number;
}

export interface IHelpRequest {
  id: string;
  reason: 'item_damaged' | 'wrong_item' | 'order_not_received' | 'missing_items' | 'tracking_info' | 'other';
  otherText?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: Date;
  resolvedAt?: Date;
  adminNotes?: string;
}

export interface IOrder extends Document {
  _id: ObjectId;
  storeId?: ObjectId;
  shopifyOrderId?: string;
  shopifyOrderNumber?: string;
  shopifyDraftOrderId?: string;
  orderNumber: string;
  confirmationNumber?: string;
  user?: ObjectId;
  customer?: ObjectId;
  isGuestOrder?: boolean;
  guestSessionId?: string;
  guestContact?: {
    email?: string;
    phone?: string;
    fullName?: string;
  };
  email: string;
  lineItems: IOrderLineItem[];
  subtotalPrice: number;
  shippingCost?: number;
  discount?: number;
  totalTax: number;
  tax?: number;
  totalPrice: number;
  currency: string;
  paymentMethod?: 'stripe' | 'shopify' | 'paypal' | 'cash' | 'other';
  paymentMethodType?: 'card' | 'apple_pay' | 'google_pay' | 'link' | 'other';
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  billingAddress: IOrderAddress;
  shippingAddress: IOrderAddress;
  shipping: IOrderShipping;
  financialStatus: 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'partially_refunded' | 'refunded' | 'voided';
  fulfillmentStatus: 'unfulfilled' | 'partial' | 'fulfilled' | 'restocked' | 'cancelled';
  mobileStatus: {
    current: 'placed' | 'confirmed' | 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned';
    history: IMobileStatusHistory[];
    estimatedDelivery?: Date;
    deliveryInstructions?: string;
  };
  notifications: IOrderNotification[];
  notificationPreferences: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    smsEnabled: boolean;
  };
  customerRating?: IOrderRating;
  supportTickets: ISupportTicket[];
  returns: IReturnExchange[];
  helpRequests: IHelpRequest[];
  specialInstructions?: string;
  customerNotes?: string;
  merchantNotes?: string;
  deliveryPreferences: {
    timeSlot?: string;
    deliveryDate?: Date;
    leaveAtDoor?: boolean;
    requireSignature?: boolean;
    deliveryInstructions?: string;
  };
  source: 'mobile' | 'web' | 'api' | 'pos';
  channel: 'app' | 'website' | 'marketplace' | 'social';
  campaignId?: string;
  tags?: string[];
  placedAt: Date;
  processedAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// SHOPIFY INTEGRATION TYPES
// =============================================================================

export interface IShopifyAddress {
  id: number;
  customer_id: number;
  first_name?: string;
  last_name?: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
  name: string;
  province_code?: string;
  country_code: string;
  country_name: string;
  default: boolean;
}

export interface IShopifyMarketingConsent {
  state: 'not_subscribed' | 'pending' | 'subscribed' | 'unsubscribed' | 'redacted';
  opt_in_level: 'single_opt_in' | 'confirmed_opt_in' | 'unknown';
  consent_updated_at?: string;
}

export interface IShopifyOrder {
  id: number;
  admin_graphql_api_id: string;
  app_id?: number;
  browser_ip?: string;
  buyer_accepts_marketing: boolean;
  cancel_reason?: string;
  cancelled_at?: string;
  cart_token?: string;
  checkout_id?: number;
  checkout_token?: string;
  client_details?: unknown;
  closed_at?: string;
  confirmed: boolean;
  contact_email?: string;
  created_at: string;
  currency: string;
  current_subtotal_price: string;
  current_subtotal_price_set: IShopifyPriceSet;
  current_total_discounts: string;
  current_total_discounts_set: IShopifyPriceSet;
  current_total_duties_set?: IShopifyPriceSet;
  current_total_price: string;
  current_total_price_set: IShopifyPriceSet;
  current_total_tax: string;
  current_total_tax_set: IShopifyPriceSet;
  customer_locale?: string;
  device_id?: number;
  discount_codes: IShopifyDiscountCode[];
  email: string;
  estimated_taxes: boolean;
  financial_status: 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'partially_refunded' | 'refunded' | 'voided';
  fulfillment_status?: 'fulfilled' | 'null' | 'partial' | 'restocked';
  gateway?: string;
  landing_site?: string;
  landing_site_ref?: string;
  location_id?: number;
  name: string;
  note?: string;
  note_attributes: unknown[];
  number: number;
  order_number: number;
  order_status_url: string;
  original_total_duties_set?: IShopifyPriceSet;
  payment_gateway_names: string[];
  phone?: string;
  presentment_currency: string;
  processed_at: string;
  processing_method: string;
  reference?: string;
  referring_site?: string;
  source_identifier?: string;
  source_name: string;
  source_url?: string;
  subtotal_price: string;
  subtotal_price_set: IShopifyPriceSet;
  tags: string;
  tax_lines: IShopifyTaxLine[];
  taxes_included: boolean;
  test: boolean;
  token: string;
  total_discounts: string;
  total_discounts_set: IShopifyPriceSet;
  total_line_items_price: string;
  total_line_items_price_set: IShopifyPriceSet;
  total_outstanding: string;
  total_price: string;
  total_price_set: IShopifyPriceSet;
  total_price_usd: string;
  total_shipping_price_set: IShopifyPriceSet;
  total_tax: string;
  total_tax_set: IShopifyPriceSet;
  total_tip_received: string;
  total_weight: number;
  updated_at: string;
  user_id?: number;
  billing_address?: IShopifyAddress;
  customer?: IShopifyCustomer;
  discount_applications: unknown[];
  fulfillments: unknown[];
  line_items: IShopifyLineItem[];
  payment_details?: unknown;
  payment_terms?: unknown;
  refunds: unknown[];
  shipping_address?: IShopifyAddress;
  shipping_lines: IShopifyShippingLine[];
}

export interface IShopifyPriceSet {
  shop_money: IShopifyPrice;
  presentment_money: IShopifyPrice;
}

export interface IShopifyPrice {
  amount: string;
  currency_code: string;
}

export interface IShopifyDiscountCode {
  code: string;
  amount: string;
  type: 'fixed_amount' | 'percentage' | 'shipping';
}

export interface IShopifyTaxLine {
  price: string;
  rate: number;
  title: string;
  price_set: IShopifyPriceSet;
}

export interface IShopifyLineItem {
  id: number;
  admin_graphql_api_id: string;
  fulfillable_quantity: number;
  fulfillment_service: string;
  fulfillment_status?: string;
  gift_card: boolean;
  grams: number;
  name: string;
  origin_location?: unknown;
  price: string;
  price_set: IShopifyPriceSet;
  product_exists: boolean;
  product_id: number;
  properties: unknown[];
  quantity: number;
  requires_shipping: boolean;
  sku?: string;
  taxable: boolean;
  title: string;
  total_discount: string;
  total_discount_set: IShopifyPriceSet;
  variant_id: number;
  variant_inventory_management?: string;
  variant_title?: string;
  vendor: string;
  tax_lines: IShopifyTaxLine[];
  duties: unknown[];
  discount_allocations: unknown[];
}

export interface IShopifyShippingLine {
  id: number;
  carrier_identifier?: string;
  code?: string;
  delivery_category?: string;
  discounted_price: string;
  discounted_price_set: IShopifyPriceSet;
  phone?: string;
  price: string;
  price_set: IShopifyPriceSet;
  requested_fulfillment_service_id?: string;
  source: string;
  title: string;
  tax_lines: IShopifyTaxLine[];
  discount_allocations: unknown[];
}

// =============================================================================
// EXPRESS REQUEST EXTENSIONS
// =============================================================================

export interface AuthenticatedRequest<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown
> extends Request<TParams, unknown, TBody, TQuery> {
  user?: {
    _id: any; // Using any for ObjectId compatibility across different mongoose imports
    id?: string; // Convenience getter for _id.toString()
    storeId?: any;
    email: string;
    role: string; // Flexible for different role types
    name: string;
    isActive: boolean;
    isVerified?: boolean;
    phone?: string;
    profile?: IUserProfile;
    addresses?: IAddress[];
    preferences?: IUserPreferences;
    createdAt?: Date;
    lastLoginAt?: Date;
  };
  sessionID?: string;
}

// Simplified AuthRequest for middleware that only needs basic user info
export interface AuthRequest extends Request {
  user?: {
    _id: any; // Using any for ObjectId compatibility
    id?: string;
    storeId?: any;
    email: string;
    role: string;
    name: string;
    isActive: boolean;
  };
  storeId?: string;
}

export interface PaginatedRequest<TQuery = unknown> extends AuthenticatedRequest {
  query: TQuery & PaginationQuery;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

export interface IStoreConfig {
  name: string;
  domain: string;
  logoUrl: string;
  primaryColor: string;
  currency: string;
  timezone: string;
  country: string;
  description: string;
}

export interface IShopifyConfig {
  storeUrl: string;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  webhookSecret: string;
  scopes: string;
  apiVersion: string;
  webhookUrl: string;
  enableSync: boolean;
  syncInterval: number;
  maxRetries: number;
  rateLimitDelay: number;
}

export interface IDatabaseConfig {
  mongodbUri: string;
  connectionTimeout: number;
  maxPoolSize: number;
  minPoolSize: number;
}

export interface IEmailConfig {
  fromName: string;
  fromAddress: string;
  replyTo: string;
  serviceType: string;
  serviceApiKey: string;
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    secure: boolean;
  };
}

export interface ISecurityConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  enableSocialLogin: boolean;
  googleClientId: string;
  googleClientSecret: string;
  facebookAppId: string;
  facebookAppSecret: string;
  enableTwoFactor: boolean;
  passwordMinLength: number;
  sessionTimeout: number;
}

export interface ITenantConfig {
  store: IStoreConfig;
  shopify: IShopifyConfig;
  database: IDatabaseConfig;
  email: IEmailConfig;
  security: ISecurityConfig;
  features: Record<string, boolean>;
  jobs: Record<string, string | boolean>;
  api: {
    baseUrl: string;
    version: string;
    frontendUrl: string;
    adminEmail: string;
    port: number;
    nodeEnv: string;
  };
}

// =============================================================================
// SERVICE RESPONSE TYPES
// =============================================================================

export interface IServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: string[];
}

export interface ISyncResult {
  synced: number;
  errors: string[];
  skipped?: number;
  updated?: number;
  created?: number;
}

export interface ISyncStatus {
  lastFullSync?: Date;
  lastIncrementalSync?: Date;
  inProgress: boolean;
  errors: string[];
  stats: {
    productsSync: number;
    customersSync: number;
    ordersSync: number;
  };
}

export interface IInventoryReservation {
  orderId: string;
  quantity: number;
  reservedAt: Date;
  expiresAt: Date;
}

export interface IBackgroundJobStats {
  lastRun: Date;
  runCount: number;
  successCount: number;
  errorCount: number;
  averageDuration: number;
  lastError?: string;
}

export interface IJobRegistry {
  [jobName: string]: {
    task: unknown;
    stats: IBackgroundJobStats;
    isRunning: boolean;
  };
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type WithTimestamps<T> = T & {
  createdAt: Date;
  updatedAt: Date;
};

// Export all interfaces as a namespace for easier importing
export * as Types from './index';