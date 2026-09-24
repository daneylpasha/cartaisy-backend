import crypto from 'crypto';
import { Types } from 'mongoose';
import AnalyticsEvent from '../models/AnalyticsEvent';
import AppSession from '../models/AppSession';
import CartActivity from '../models/CartActivity';
import CheckoutSession from '../models/CheckoutSession';
import Customer from '../models/Customer';
import DataExport from '../models/DataExport';
import Favorite from '../models/Favorite';
import GuestSession from '../models/GuestSession';
import NotificationEngagement from '../models/NotificationEngagement';
import Order from '../models/Order';
import PaymentMethod from '../models/PaymentMethod';
import ProductView from '../models/ProductView';
import SearchHistory from '../models/SearchHistory';
import Store from '../models/Store';
import ShopifyComplianceRequest, {
  IShopifyComplianceSummary,
  ShopifyComplianceStatus,
  ShopifyComplianceTopic,
} from '../models/ShopifyComplianceRequest';
import User from '../models/User';
import Wishlist from '../models/Wishlist';
import { tenantConfig } from '../config/tenant';
import { markShopifyAppUninstalled } from './shopifyOAuthService';

/**
 * Shopify mandatory compliance webhooks and app/uninstalled.
 *
 * Every query is scoped to the store resolved from the verified shop domain.
 * Payloads are read in memory to find that store's records. Email, phone,
 * names, and tokens are not written to the compliance record and are not logged.
 *
 * v1 customers/data_request records the request for ops. It does not email
 * the customer or the merchant. v1 redact anonymizes shopper PII and leaves
 * merchant accounts, the Store document, branding, and the product catalog.
 */

const CUSTOMER_ROLES = ['customer', 'premium_customer'] as const;
const REDACTED_ORDER_EMAIL = 'redacted@redacted.invalid';
const ID_LIST_LIMIT = 5000;

const REDACTED_ORDER_FIELDS = {
  email: REDACTED_ORDER_EMAIL,
  'guestContact.email': REDACTED_ORDER_EMAIL,
  'guestContact.phone': '',
  'guestContact.fullName': 'Redacted',
  'shippingAddress.firstName': 'Redacted',
  'shippingAddress.lastName': 'Customer',
  'shippingAddress.phone': '',
  'shippingAddress.address1': 'REDACTED',
  'shippingAddress.address2': '',
  'billingAddress.firstName': 'Redacted',
  'billingAddress.lastName': 'Customer',
  'billingAddress.phone': '',
  'billingAddress.address1': 'REDACTED',
  'billingAddress.address2': '',
  customerNotes: '',
  specialInstructions: '',
  merchantNotes: '',
  'deliveryPreferences.deliveryInstructions': '',
};

interface CustomerCompliancePayload {
  shopifyCustomerId: string | null;
  email: string | null;
  orderIds: string[];
  dataRequestId: string | null;
}

interface OwnedIds {
  userIds: Types.ObjectId[];
  customerIds: Types.ObjectId[];
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const readShopifyId = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 128) {
      return null;
    }
    return trimmed;
  }
  return null;
};

const readIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids: string[] = [];
  for (const entry of value) {
    if (ids.length >= ID_LIST_LIMIT) {
      break;
    }
    const id = readShopifyId(entry);
    if (id) {
      ids.push(id);
    }
  }
  return ids;
};

const readEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const email = value.trim().toLowerCase();
  if (!email.includes('@') || email.length > 320) {
    return null;
  }
  return email;
};

const parseCustomerPayload = (body: unknown, orderField: 'orders_requested' | 'orders_to_redact'): CustomerCompliancePayload => {
  const record = asRecord(body);
  const customer = asRecord(record?.customer);
  const dataRequest = asRecord(record?.data_request);
  return {
    shopifyCustomerId: readShopifyId(customer?.id),
    email: readEmail(customer?.email),
    orderIds: readIdList(record?.[orderField]),
    dataRequestId: readShopifyId(dataRequest?.id),
  };
};

const requireStoreId = (storeId: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(storeId)) {
    throw new Error('Invalid compliance store id');
  }
  return new Types.ObjectId(storeId);
};

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

const hashKey = (value: string): string => {
  const secret = tenantConfig.shopify.webhookSecret;
  if (secret) {
    return crypto.createHmac('sha256', secret).update(value).digest('hex');
  }
  return crypto.createHash('sha256').update(value).digest('hex');
};

const customerRedactExternalId = (payload: CustomerCompliancePayload): string | null => {
  if (payload.shopifyCustomerId) {
    return `customer:${payload.shopifyCustomerId}`;
  }
  if (payload.orderIds.length > 0) {
    return `orders:${hashKey([...payload.orderIds].sort().join(','))}`;
  }
  if (payload.email) {
    return `email:${hashKey(payload.email)}`;
  }
  return null;
};

const deletedCount = (result: { deletedCount?: number }): number => result.deletedCount || 0;

const findOwnedIds = async (
  storeId: Types.ObjectId,
  payload: CustomerCompliancePayload
): Promise<OwnedIds> => {
  const identity: Record<string, unknown>[] = [];
  if (payload.shopifyCustomerId) {
    identity.push({ shopifyCustomerId: payload.shopifyCustomerId });
  }
  if (payload.email) {
    identity.push({ email: payload.email });
  }

  const users = identity.length === 0
    ? []
    : await User.find({
      storeId,
      role: { $in: CUSTOMER_ROLES },
      $or: identity,
    }).select('_id');

  const customers = payload.email
    ? await Customer.find({ storeId, email: payload.email }).select('_id')
    : [];

  return {
    userIds: users.map((user) => user._id as Types.ObjectId),
    customerIds: customers.map((customer) => customer._id as Types.ObjectId),
  };
};

const anonymizeUsers = async (storeId: Types.ObjectId, userIds: Types.ObjectId[]): Promise<number> => {
  if (userIds.length === 0) {
    return 0;
  }

  const result = await User.bulkWrite(userIds.map((userId) => ({
    updateOne: {
      filter: {
        _id: userId,
        storeId,
        role: { $in: CUSTOMER_ROLES },
      },
      update: {
        $set: {
          email: `redacted+${userId.toString()}@redacted.invalid`,
          name: 'Redacted Customer',
          phone: '',
          addresses: [],
          isActive: false,
          'profile.avatar': '',
          'profile.interests': [],
        },
        $unset: {
          shopifyCustomerId: '',
          googleSub: '',
          stripeCustomerId: '',
          'profile.dateOfBirth': '',
          'profile.gender': '',
        },
      },
    },
  })));

  return result.modifiedCount || 0;
};

const orderMatch = (
  storeId: Types.ObjectId,
  payload: CustomerCompliancePayload,
  owned: OwnedIds
): Record<string, unknown> | null => {
  const clauses: Record<string, unknown>[] = [];
  if (payload.email) {
    clauses.push({ email: payload.email });
    clauses.push({ 'guestContact.email': payload.email });
  }
  if (payload.orderIds.length > 0) {
    clauses.push({ shopifyOrderId: { $in: payload.orderIds } });
  }
  if (owned.userIds.length > 0) {
    clauses.push({ user: { $in: owned.userIds } });
  }
  if (owned.customerIds.length > 0) {
    clauses.push({ customer: { $in: owned.customerIds } });
  }
  if (clauses.length === 0) {
    return null;
  }
  return { storeId, $or: clauses };
};

const anonymizeOrders = async (filter: Record<string, unknown>): Promise<number> => {
  const result = await Order.updateMany(filter, {
    $set: REDACTED_ORDER_FIELDS,
    $unset: {
      'shipping.trackingNumber': '',
      'shipping.trackingUrl': '',
    },
  });
  return result.modifiedCount || 0;
};

const deleteOwnedRecords = async (storeId: Types.ObjectId, owned: OwnedIds): Promise<number> => {
  const { userIds, customerIds } = owned;
  if (userIds.length === 0 && customerIds.length === 0) {
    return 0;
  }

  const tasks: Promise<{ deletedCount?: number }>[] = [];
  const ownerIds = [...userIds, ...customerIds];
  tasks.push(PaymentMethod.deleteMany({ userId: { $in: ownerIds } }));

  const personClauses = [
    ...(userIds.length > 0 ? [{ user: { $in: userIds } }] : []),
    ...(customerIds.length > 0 ? [{ customer: { $in: customerIds } }] : []),
  ];
  if (personClauses.length > 0) {
    tasks.push(Wishlist.deleteMany({ $or: personClauses }));
    tasks.push(ProductView.deleteMany({ $or: personClauses }));
  }

  const favoriteClauses = [
    ...(userIds.length > 0 ? [{ userId: { $in: userIds } }] : []),
    ...(customerIds.length > 0 ? [{ customerId: { $in: customerIds } }] : []),
  ];
  if (favoriteClauses.length > 0) {
    tasks.push(Favorite.deleteMany({ $or: favoriteClauses }));
  }

  const searchClauses = [
    ...(userIds.length > 0 ? [{ userId: { $in: userIds } }] : []),
    ...(customerIds.length > 0 ? [{ customerId: { $in: customerIds } }] : []),
  ];
  if (searchClauses.length > 0) {
    tasks.push(SearchHistory.deleteMany({ storeId, $or: searchClauses }));
  }

  if (customerIds.length > 0) {
    tasks.push(CartActivity.deleteMany({ storeId, customerId: { $in: customerIds } }));
    tasks.push(NotificationEngagement.deleteMany({ storeId, customerId: { $in: customerIds } }));
    tasks.push(DataExport.deleteMany({ storeId, customerId: { $in: customerIds } }));
    tasks.push(AppSession.deleteMany({ storeId, customerId: { $in: customerIds } }));
  }

  if (userIds.length > 0) {
    tasks.push(AnalyticsEvent.deleteMany({ storeId, userId: { $in: userIds } }));
  }

  const checkoutClauses = [
    ...(userIds.length > 0 ? [{ userId: { $in: userIds } }] : []),
    ...(customerIds.length > 0 ? [{ customerId: { $in: customerIds } }] : []),
  ];
  if (checkoutClauses.length > 0) {
    tasks.push(CheckoutSession.deleteMany({ $or: checkoutClauses }));
  }

  const results = await Promise.all(tasks);
  return results.reduce((total, result) => total + deletedCount(result), 0);
};

const clearGuestCheckout = async (
  storeId: Types.ObjectId,
  email: string | null,
  allInStore: boolean
): Promise<number> => {
  const filter = allInStore
    ? { storeId, guestCheckout: { $exists: true } }
    : email
      ? { storeId, 'guestCheckout.email': email }
      : null;
  if (!filter) {
    return 0;
  }
  const result = await GuestSession.updateMany(filter, { $unset: { guestCheckout: '' } });
  return result.modifiedCount || 0;
};

const upsertReceipt = async (input: {
  storeId: Types.ObjectId;
  shopDomain: string;
  topic: ShopifyComplianceTopic;
  externalId: string;
  status: ShopifyComplianceStatus;
  shopifyCustomerId?: string | null;
  shopifyOrderIds?: string[];
  matchedUserIds?: string[];
  matchedCustomerIds?: string[];
  summary: IShopifyComplianceSummary;
}): Promise<void> => {
  await ShopifyComplianceRequest.updateOne(
    { storeId: input.storeId, topic: input.topic, externalId: input.externalId },
    {
      $set: {
        status: input.status,
        summary: input.summary,
        shopDomain: input.shopDomain,
      },
      $setOnInsert: {
        storeId: input.storeId,
        topic: input.topic,
        externalId: input.externalId,
        shopifyCustomerId: input.shopifyCustomerId || undefined,
        shopifyOrderIds: input.shopifyOrderIds || [],
        matchedUserIds: input.matchedUserIds || [],
        matchedCustomerIds: input.matchedCustomerIds || [],
        receivedAt: new Date(),
      },
    },
    { upsert: true }
  );
};

/**
 * Record a customers/data_request for ops. Replay of the same Shopify
 * data_request id does not create a second record.
 */
export const recordCustomerDataRequest = async (
  storeId: string,
  shopDomain: string,
  body: unknown
): Promise<void> => {
  const storeObjectId = requireStoreId(storeId);
  const payload = parseCustomerPayload(body, 'orders_requested');
  if (!payload.dataRequestId) {
    console.warn(`Shopify customers/data_request missing data_request id (store: ${storeId})`);
    return;
  }

  const externalId = `request:${payload.dataRequestId}`;
  const existing = await ShopifyComplianceRequest.findOne({
    storeId: storeObjectId,
    topic: 'customers/data_request',
    externalId,
  }).select('_id');
  if (existing) {
    return;
  }

  const owned = await findOwnedIds(storeObjectId, payload);
  const orderFilter = orderMatch(storeObjectId, payload, owned);
  const orderCount = orderFilter ? await Order.countDocuments(orderFilter) : 0;

  try {
    await ShopifyComplianceRequest.create({
      storeId: storeObjectId,
      shopDomain,
      topic: 'customers/data_request',
      externalId,
      shopifyCustomerId: payload.shopifyCustomerId || undefined,
      shopifyOrderIds: payload.orderIds,
      matchedUserIds: owned.userIds.map((id) => id.toString()),
      matchedCustomerIds: owned.customerIds.map((id) => id.toString()),
      status: 'recorded',
      summary: { matchedOrderCount: orderCount },
      receivedAt: new Date(),
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return;
    }
    throw error;
  }

  console.log(
    `Shopify customers/data_request recorded for store ${storeId} (users: ${owned.userIds.length}, customers: ${owned.customerIds.length}, orders: ${orderCount})`
  );
};

/**
 * Redact one Shopify customer's store-scoped PII. Safe to run again.
 */
export const redactCustomer = async (
  storeId: string,
  shopDomain: string,
  body: unknown
): Promise<void> => {
  const storeObjectId = requireStoreId(storeId);
  const payload = parseCustomerPayload(body, 'orders_to_redact');
  const externalId = customerRedactExternalId(payload);
  if (!externalId) {
    console.warn(`Shopify customers/redact had no customer, email, or orders (store: ${storeId})`);
    return;
  }

  const owned = await findOwnedIds(storeObjectId, payload);
  const usersRedacted = await anonymizeUsers(storeObjectId, owned.userIds);
  const customerResult = owned.customerIds.length === 0
    ? { deletedCount: 0 }
    : await Customer.deleteMany({ _id: { $in: owned.customerIds }, storeId: storeObjectId });
  const orderFilter = orderMatch(storeObjectId, payload, owned);
  const ordersRedacted = orderFilter ? await anonymizeOrders(orderFilter) : 0;
  const guestSessionsRedacted = await clearGuestCheckout(storeObjectId, payload.email, false);
  const relatedRecordsDeleted = await deleteOwnedRecords(storeObjectId, owned);

  const summary: IShopifyComplianceSummary = {
    usersRedacted,
    customersDeleted: deletedCount(customerResult),
    ordersRedacted,
    guestSessionsRedacted,
    relatedRecordsDeleted,
  };

  await upsertReceipt({
    storeId: storeObjectId,
    shopDomain,
    topic: 'customers/redact',
    externalId,
    status: 'redacted',
    shopifyCustomerId: payload.shopifyCustomerId,
    shopifyOrderIds: payload.orderIds,
    matchedUserIds: owned.userIds.map((id) => id.toString()),
    matchedCustomerIds: owned.customerIds.map((id) => id.toString()),
    summary,
  });

  console.log(
    `Shopify customers/redact completed for store ${storeId} (users: ${usersRedacted}, orders: ${ordersRedacted})`
  );
};

/**
 * Erase shopper PII for the whole store, then clear any remaining Shopify
 * credentials locally. Does not delete the Store, merchant users, branding,
 * or product catalog.
 */
export const redactShop = async (storeId: string, shopDomain: string): Promise<void> => {
  const storeObjectId = requireStoreId(storeId);
  const users = await User.find({
    storeId: storeObjectId,
    role: { $in: CUSTOMER_ROLES },
  }).select('_id');
  const customers = await Customer.find({ storeId: storeObjectId }).select('_id');
  const owned: OwnedIds = {
    userIds: users.map((user) => user._id as Types.ObjectId),
    customerIds: customers.map((customer) => customer._id as Types.ObjectId),
  };

  const usersRedacted = await anonymizeUsers(storeObjectId, owned.userIds);
  const customerResult = await Customer.deleteMany({ storeId: storeObjectId });
  const ordersRedacted = await anonymizeOrders({ storeId: storeObjectId });
  const guestSessionsRedacted = await clearGuestCheckout(storeObjectId, null, true);
  const relatedRecordsDeleted = await deleteOwnedRecords(storeObjectId, owned);
  const searchResult = await SearchHistory.deleteMany({ storeId: storeObjectId });
  const appSessionResult = await AppSession.deleteMany({ storeId: storeObjectId });
  const analyticsResult = await AnalyticsEvent.deleteMany({
    storeId: storeObjectId,
    $or: [
      { userId: { $exists: true } },
      { 'eventData.searchQuery': { $exists: true, $nin: [null, ''] } },
      { 'location.city': { $exists: true } },
      { deviceId: { $exists: true } },
    ],
  });

  const stillConnected = await Store.findById(storeId).select('shopify.isConnected');
  let credentialsCleared = false;
  if (stillConnected?.shopify?.isConnected !== true) {
    await markShopifyAppUninstalled(storeId);
    credentialsCleared = true;
  }

  await upsertReceipt({
    storeId: storeObjectId,
    shopDomain,
    topic: 'shop/redact',
    externalId: 'shop',
    status: 'redacted',
    summary: {
      usersRedacted,
      customersDeleted: deletedCount(customerResult),
      ordersRedacted,
      guestSessionsRedacted,
      relatedRecordsDeleted: relatedRecordsDeleted
        + deletedCount(searchResult)
        + deletedCount(appSessionResult)
        + deletedCount(analyticsResult),
      credentialsCleared,
    },
  });

  console.log(`Shopify shop/redact completed for store ${storeId} (users: ${usersRedacted}, orders: ${ordersRedacted})`);
};

/**
 * Clear Shopify credentials for app/uninstalled without calling Shopify.
 *
 * A retry that arrives after the merchant has connected again is ignored
 * when `X-Shopify-Triggered-At` is older than `shopify.connectedAt`.
 */
export const recordAppUninstalled = async (
  storeId: string,
  shopDomain: string,
  triggeredAt?: Date | null
): Promise<void> => {
  const storeObjectId = requireStoreId(storeId);
  const current = await Store.findById(storeId).select('shopify.isConnected shopify.connectedAt');
  const connectedAt = current?.shopify?.connectedAt;
  const reconnectedAfterEvent = Boolean(
    triggeredAt
    && !Number.isNaN(triggeredAt.getTime())
    && current?.shopify?.isConnected === true
    && connectedAt
    && connectedAt.getTime() > triggeredAt.getTime()
  );

  if (!reconnectedAfterEvent) {
    await markShopifyAppUninstalled(storeId);
  }

  await upsertReceipt({
    storeId: storeObjectId,
    shopDomain,
    topic: 'app/uninstalled',
    externalId: 'app',
    status: 'uninstalled',
    summary: { credentialsCleared: !reconnectedAfterEvent },
  });
  console.log(
    reconnectedAfterEvent
      ? `Shopify app/uninstalled ignored for store ${storeId}: reconnected after the event`
      : `Shopify app/uninstalled cleared credentials for store ${storeId}`
  );
};
