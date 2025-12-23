import mongoose from 'mongoose';
import Customer from '../models/Customer';
import Order from '../models/Order';
import PaymentMethod from '../models/PaymentMethod';
import SearchHistory from '../models/SearchHistory';
import ProductView from '../models/ProductView';
import CartActivity from '../models/CartActivity';
import AuditLog from '../models/AuditLog';
import NotificationEngagement from '../models/NotificationEngagement';
import DataExport, { IDataExport, ExportStatus } from '../models/DataExport';

/**
 * Data Export Service
 *
 * GDPR-compliant service for exporting user data.
 * Collects all user data across the system and packages it into a structured JSON format.
 */

// Data export schema version for future compatibility
const EXPORT_SCHEMA_VERSION = '1.0.0';

// Data categories that can be exported
export type DataCategory =
  | 'profile'
  | 'addresses'
  | 'orders'
  | 'payment_methods'
  | 'search_history'
  | 'product_views'
  | 'cart_activity'
  | 'notification_preferences'
  | 'device_info'
  | 'audit_logs'
  | 'notification_engagement';

/**
 * Exported user data structure
 */
export interface UserDataExport {
  schemaVersion: string;
  exportedAt: string;
  customerId: string;
  storeId: string;
  dataCategories: DataCategory[];

  profile: {
    email: string;
    name?: string;
    phone?: string;
    gender?: string;
    dateOfBirth?: string;
    country?: string;
    avatar?: string;
    isVerified: boolean;
    createdAt: string;
    lastLoginAt?: string;
  };

  addresses: Array<{
    label?: string;
    type?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    address1: string;
    address2?: string;
    city?: string;
    province: string;
    country: string;
    countryCode?: string;
    zip?: string;
    isDefault: boolean;
  }>;

  orders: Array<{
    orderNumber: string;
    placedAt: string;
    status: string;
    financialStatus: string;
    fulfillmentStatus: string;
    lineItems: Array<{
      title: string;
      sku?: string;
      quantity: number;
      price: number;
    }>;
    subtotalPrice: number;
    shippingCost: number;
    discount: number;
    totalTax: number;
    totalPrice: number;
    currency: string;
    shippingAddress?: {
      firstName: string;
      lastName?: string;
      address1: string;
      address2?: string;
      city: string;
      province: string;
      country: string;
      zip: string;
    };
    billingAddress?: {
      firstName: string;
      lastName?: string;
      address1: string;
      address2?: string;
      city: string;
      province: string;
      country: string;
      zip: string;
    };
    customerRating?: {
      overallRating: number;
      comment?: string;
      ratedAt: string;
    };
  }>;

  paymentMethods: Array<{
    type: string;
    card?: {
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
    };
    billingAddress?: {
      city: string;
      province: string;
      country: string;
      zip: string;
    };
    isDefault: boolean;
    createdAt: string;
  }>;

  searchHistory: Array<{
    query: string;
    searchType?: string;
    resultsCount: number;
    searchedAt: string;
  }>;

  productViews: Array<{
    productHandle?: string;
    viewedAt: string;
    viewDuration?: number;
    viewContext?: string;
    searchQuery?: string;
    interactions: {
      addedToWishlist: boolean;
      addedToCart: boolean;
    };
  }>;

  cartActivity: {
    lastCartUpdate?: string;
    lastCheckoutInitiated?: string;
    hasCompletedCheckout: boolean;
    checkoutCompletedAt?: string;
  } | null;

  notificationPreferences: {
    pushEnabled: boolean;
    orderUpdates: boolean;
    promotions: boolean;
    newProducts: boolean;
    email: boolean;
    sms: boolean;
  };

  deviceInfo: Array<{
    platform: string;
    deviceId?: string;
    lastUsed: string;
    active: boolean;
    registeredAt: string;
  }>;

  auditLogs: Array<{
    action: string;
    endpoint: string;
    method: string;
    statusCode: number;
    timestamp: string;
  }>;

  notificationEngagement: Array<{
    type: string;
    timestamp: string;
    devicePlatform?: string;
    clickTarget?: string;
  }>;
}

/**
 * Collect profile data
 */
async function collectProfileData(customer: any): Promise<UserDataExport['profile']> {
  return {
    email: customer.email,
    name: customer.name,
    phone: customer.phone,
    gender: customer.gender,
    dateOfBirth: customer.dateOfBirth?.toISOString(),
    country: customer.country,
    avatar: customer.avatar,
    isVerified: customer.isVerified,
    createdAt: customer.createdAt.toISOString(),
    lastLoginAt: customer.lastLoginAt?.toISOString(),
  };
}

/**
 * Collect addresses
 */
function collectAddresses(customer: any): UserDataExport['addresses'] {
  return (customer.addresses || []).map((addr: any) => ({
    label: addr.label,
    type: addr.type,
    firstName: addr.firstName,
    lastName: addr.lastName,
    phone: addr.phone,
    address1: addr.address1,
    address2: addr.address2,
    city: addr.city,
    province: addr.province,
    country: addr.country,
    countryCode: addr.countryCode,
    zip: addr.zip,
    isDefault: addr.isDefault,
  }));
}

/**
 * Collect order history
 */
async function collectOrders(
  customerId: string | mongoose.Types.ObjectId
): Promise<UserDataExport['orders']> {
  const orders = await Order.find({ customer: customerId })
    .sort({ placedAt: -1 })
    .lean();

  return orders.map((order: any) => ({
    orderNumber: order.orderNumber,
    placedAt: order.placedAt?.toISOString() || order.createdAt?.toISOString(),
    status: order.mobileStatus?.current || 'unknown',
    financialStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    lineItems: (order.lineItems || []).map((item: any) => ({
      title: item.title,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
    })),
    subtotalPrice: order.subtotalPrice,
    shippingCost: order.shippingCost || 0,
    discount: order.discount || 0,
    totalTax: order.totalTax,
    totalPrice: order.totalPrice,
    currency: order.currency,
    shippingAddress: order.shippingAddress
      ? {
          firstName: order.shippingAddress.firstName,
          lastName: order.shippingAddress.lastName,
          address1: order.shippingAddress.address1,
          address2: order.shippingAddress.address2,
          city: order.shippingAddress.city,
          province: order.shippingAddress.province,
          country: order.shippingAddress.country,
          zip: order.shippingAddress.zip,
        }
      : undefined,
    billingAddress: order.billingAddress
      ? {
          firstName: order.billingAddress.firstName,
          lastName: order.billingAddress.lastName,
          address1: order.billingAddress.address1,
          address2: order.billingAddress.address2,
          city: order.billingAddress.city,
          province: order.billingAddress.province,
          country: order.billingAddress.country,
          zip: order.billingAddress.zip,
        }
      : undefined,
    customerRating: order.customerRating
      ? {
          overallRating: order.customerRating.overallRating,
          comment: order.customerRating.comment,
          ratedAt: order.customerRating.ratedAt?.toISOString(),
        }
      : undefined,
  }));
}

/**
 * Collect payment methods (masked for security)
 */
async function collectPaymentMethods(
  customerId: string | mongoose.Types.ObjectId
): Promise<UserDataExport['paymentMethods']> {
  // PaymentMethod uses userId field
  const paymentMethods = await PaymentMethod.find({ userId: customerId }).lean();

  return paymentMethods.map((pm: any) => ({
    type: pm.type,
    card: pm.card
      ? {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.expMonth,
          expYear: pm.card.expYear,
        }
      : undefined,
    billingAddress: pm.billingAddress
      ? {
          city: pm.billingAddress.city,
          province: pm.billingAddress.province,
          country: pm.billingAddress.country,
          zip: pm.billingAddress.zip,
        }
      : undefined,
    isDefault: pm.isDefault,
    createdAt: pm.createdAt?.toISOString(),
  }));
}

/**
 * Collect search history
 */
async function collectSearchHistory(
  customerId: string | mongoose.Types.ObjectId
): Promise<UserDataExport['searchHistory']> {
  const searches = await SearchHistory.find({ customerId })
    .sort({ createdAt: -1 })
    .limit(500) // Limit to last 500 searches
    .lean();

  return searches.map((search: any) => ({
    query: search.query,
    searchType: search.searchType,
    resultsCount: search.resultsCount,
    searchedAt: search.createdAt?.toISOString(),
  }));
}

/**
 * Collect product views
 */
async function collectProductViews(
  customerId: string | mongoose.Types.ObjectId
): Promise<UserDataExport['productViews']> {
  const views = await ProductView.find({ customer: customerId })
    .sort({ viewedAt: -1 })
    .limit(500) // Limit to last 500 views
    .lean();

  return views.map((view: any) => ({
    productHandle: view.productHandle,
    viewedAt: view.viewedAt?.toISOString(),
    viewDuration: view.viewDuration,
    viewContext: view.viewContext,
    searchQuery: view.searchQuery,
    interactions: {
      addedToWishlist: view.interactions?.addedToWishlist || false,
      addedToCart: view.interactions?.addedToCart || false,
    },
  }));
}

/**
 * Collect cart activity
 */
async function collectCartActivity(
  storeId: string | mongoose.Types.ObjectId,
  customerId: string | mongoose.Types.ObjectId
): Promise<UserDataExport['cartActivity']> {
  const activity = await CartActivity.findOne({ storeId, customerId }).lean();

  if (!activity) return null;

  return {
    lastCartUpdate: (activity as any).lastCartUpdate?.toISOString(),
    lastCheckoutInitiated: (activity as any).lastCheckoutInitiated?.toISOString(),
    hasCompletedCheckout: (activity as any).hasCompletedCheckout,
    checkoutCompletedAt: (activity as any).checkoutCompletedAt?.toISOString(),
  };
}

/**
 * Collect notification preferences
 */
function collectNotificationPreferences(customer: any): UserDataExport['notificationPreferences'] {
  const prefs = customer.notificationPreferences || {};
  const legacyPrefs = customer.preferences?.notifications || {};

  return {
    pushEnabled: prefs.pushEnabled ?? true,
    orderUpdates: prefs.orderUpdates ?? legacyPrefs.orderUpdates ?? true,
    promotions: prefs.promotions ?? legacyPrefs.promotions ?? true,
    newProducts: prefs.newProducts ?? false,
    email: legacyPrefs.email ?? true,
    sms: legacyPrefs.sms ?? false,
  };
}

/**
 * Collect device info (tokens are excluded for security)
 */
function collectDeviceInfo(customer: any): UserDataExport['deviceInfo'] {
  return (customer.deviceTokens || []).map((device: any) => ({
    platform: device.platform,
    deviceId: device.deviceId,
    lastUsed: device.lastUsed?.toISOString(),
    active: device.active,
    registeredAt: device.createdAt?.toISOString(),
  }));
}

/**
 * Collect audit logs for this user
 */
async function collectAuditLogs(
  customerId: string
): Promise<UserDataExport['auditLogs']> {
  const logs = await AuditLog.find({ userId: customerId })
    .sort({ timestamp: -1 })
    .limit(1000) // Limit to last 1000 entries
    .lean();

  return logs.map((log: any) => ({
    action: log.action,
    endpoint: log.endpoint,
    method: log.method,
    statusCode: log.statusCode,
    timestamp: log.timestamp?.toISOString(),
  }));
}

/**
 * Collect notification engagement data
 */
async function collectNotificationEngagement(
  customerId: string | mongoose.Types.ObjectId
): Promise<UserDataExport['notificationEngagement']> {
  const engagements = await NotificationEngagement.find({ customerId })
    .sort({ timestamp: -1 })
    .limit(500)
    .lean();

  return engagements.map((eng: any) => ({
    type: eng.type,
    timestamp: eng.timestamp?.toISOString(),
    devicePlatform: eng.deviceInfo?.platform,
    clickTarget: eng.clickTarget,
  }));
}

/**
 * Collect all user data for export
 */
export async function collectUserData(
  storeId: string | mongoose.Types.ObjectId,
  customerId: string | mongoose.Types.ObjectId
): Promise<UserDataExport> {
  // Get customer document
  const customer = await Customer.findOne({
    _id: customerId,
    storeId,
  }).lean();

  if (!customer) {
    throw new Error('Customer not found');
  }

  // Collect all data in parallel where possible
  const [
    orders,
    paymentMethods,
    searchHistory,
    productViews,
    cartActivity,
    auditLogs,
    notificationEngagement,
  ] = await Promise.all([
    collectOrders(customerId),
    collectPaymentMethods(customerId),
    collectSearchHistory(customerId),
    collectProductViews(customerId),
    collectCartActivity(storeId, customerId),
    collectAuditLogs(customerId.toString()),
    collectNotificationEngagement(customerId),
  ]);

  // Build the complete export
  const dataCategories: DataCategory[] = [
    'profile',
    'addresses',
    'notification_preferences',
    'device_info',
  ];

  if (orders.length > 0) dataCategories.push('orders');
  if (paymentMethods.length > 0) dataCategories.push('payment_methods');
  if (searchHistory.length > 0) dataCategories.push('search_history');
  if (productViews.length > 0) dataCategories.push('product_views');
  if (cartActivity) dataCategories.push('cart_activity');
  if (auditLogs.length > 0) dataCategories.push('audit_logs');
  if (notificationEngagement.length > 0) dataCategories.push('notification_engagement');

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    customerId: customerId.toString(),
    storeId: storeId.toString(),
    dataCategories,

    profile: await collectProfileData(customer),
    addresses: collectAddresses(customer),
    orders,
    paymentMethods,
    searchHistory,
    productViews,
    cartActivity,
    notificationPreferences: collectNotificationPreferences(customer),
    deviceInfo: collectDeviceInfo(customer),
    auditLogs,
    notificationEngagement,
  };
}

/**
 * Create a new export request
 */
export async function createExportRequest(
  storeId: string | mongoose.Types.ObjectId,
  customerId: string | mongoose.Types.ObjectId,
  requestedBy: 'customer' | 'merchant',
  requestedByUserId?: string | mongoose.Types.ObjectId
): Promise<IDataExport> {
  // Rate limiting disabled for now
  // TODO: Re-enable rate limiting in production if needed
  // const rateCheck = await DataExport.canRequestExport(customerId);
  // if (!rateCheck.canRequest) {
  //   const error: any = new Error(
  //     `Export request limit reached. Next available at: ${rateCheck.nextAvailableAt?.toISOString()}`
  //   );
  //   error.nextAvailableAt = rateCheck.nextAvailableAt;
  //   throw error;
  // }

  // Create the export request
  const exportRequest = await DataExport.create({
    storeId: new mongoose.Types.ObjectId(storeId.toString()),
    customerId: new mongoose.Types.ObjectId(customerId.toString()),
    requestedBy,
    requestedByUserId: requestedByUserId
      ? new mongoose.Types.ObjectId(requestedByUserId.toString())
      : undefined,
    status: 'pending',
    requestedAt: new Date(),
  });

  return exportRequest;
}

/**
 * Process an export request
 * This should be called asynchronously (e.g., via a job queue)
 */
export async function processExportRequest(exportId: string | mongoose.Types.ObjectId): Promise<{
  success: boolean;
  error?: string;
  data?: UserDataExport;
}> {
  const exportRequest = await DataExport.findById(exportId);

  if (!exportRequest) {
    return { success: false, error: 'Export request not found' };
  }

  if (exportRequest.status !== 'pending') {
    return { success: false, error: `Export is already ${exportRequest.status}` };
  }

  try {
    // Update status to processing
    exportRequest.status = 'processing';
    exportRequest.processingStartedAt = new Date();
    await exportRequest.save();

    // Collect all user data
    const userData = await collectUserData(exportRequest.storeId, exportRequest.customerId);

    // Convert to JSON string to calculate size
    const jsonData = JSON.stringify(userData, null, 2);
    const fileSize = Buffer.byteLength(jsonData, 'utf8');

    // Update export request with completion details
    exportRequest.status = 'completed';
    exportRequest.completedAt = new Date();
    exportRequest.fileSize = fileSize;
    exportRequest.dataCategories = userData.dataCategories;
    exportRequest.schemaVersion = EXPORT_SCHEMA_VERSION;
    exportRequest.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Expires in 7 days

    // In a production environment, you would upload the JSON to cloud storage
    // and store the URL in exportRequest.fileUrl
    // For now, we'll return the data directly

    await exportRequest.save();

    return { success: true, data: userData };
  } catch (error: any) {
    // Mark as failed
    exportRequest.status = 'failed';
    exportRequest.errorMessage = error.message || 'Unknown error during export';
    await exportRequest.save();

    console.error(`Error processing export ${exportId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get export status for a customer
 */
export async function getExportStatus(
  customerId: string | mongoose.Types.ObjectId
): Promise<{
  latestExport: IDataExport | null;
  canRequestNew: boolean;
  nextAvailableAt?: Date;
}> {
  const [latestExport, rateCheck] = await Promise.all([
    DataExport.getLatestExport(customerId),
    DataExport.canRequestExport(customerId),
  ]);

  return {
    latestExport,
    canRequestNew: rateCheck.canRequest,
    nextAvailableAt: rateCheck.nextAvailableAt,
  };
}

/**
 * Get all exports for a customer
 */
export async function getCustomerExports(
  customerId: string | mongoose.Types.ObjectId,
  options: { limit?: number; offset?: number } = {}
): Promise<{ exports: IDataExport[]; total: number }> {
  const { limit = 10, offset = 0 } = options;

  const [exports, total] = await Promise.all([
    DataExport.find({ customerId })
      .sort({ requestedAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    DataExport.countDocuments({ customerId }),
  ]);

  return { exports: exports as unknown as IDataExport[], total };
}

/**
 * Get all exports for a store (admin view)
 */
export async function getStoreExports(
  storeId: string | mongoose.Types.ObjectId,
  options: {
    limit?: number;
    offset?: number;
    status?: ExportStatus;
  } = {}
): Promise<{ exports: IDataExport[]; total: number }> {
  const { limit = 20, offset = 0, status } = options;

  const query: any = { storeId };
  if (status) {
    query.status = status;
  }

  const [exports, total] = await Promise.all([
    DataExport.find(query)
      .sort({ requestedAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate('customerId', 'email name')
      .lean(),
    DataExport.countDocuments(query),
  ]);

  return { exports: exports as unknown as IDataExport[], total };
}
