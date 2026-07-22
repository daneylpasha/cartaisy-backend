import { Types } from 'mongoose';
import Order, { IOrderDocument } from '../models/Order';
import Customer from '../models/Customer';
import Product from '../models/Product';
import CheckoutHandoff, { ICheckoutHandoff } from '../models/CheckoutHandoff';

/**
 * Shopify order webhook reconciliation (issue #76).
 *
 * Maps a verified Shopify order webhook payload to a local, store-scoped
 * Order and back to the CheckoutHandoff that started the Shopify-hosted
 * checkout, when one exists. Every lookup and write in this service is
 * scoped to the trusted webhook storeId resolved by
 * `resolveShopifyWebhookStore` - a Shopify order ID is only ever unique per
 * store (compound index { storeId, shopifyOrderId } on Order).
 *
 * Attribution rules (documented in docs/DECISIONS.md):
 * 1. Matched handoff with a customerId that belongs to the store -> Order.customer.
 * 2. Matched handoff with a guestSessionId -> guest order with that session.
 * 3. No handoff match -> store-scoped Customer email match -> Order.customer.
 * 4. Otherwise -> guest order with guestContact from the payload. Webhook
 *    order writes never create dashboard User or Customer records.
 */

export type OrderAttribution =
  | 'handoff-customer'
  | 'handoff-guest'
  | 'customer-email'
  | 'guest-fallback';

export interface ReconcileResult {
  /** The store-scoped local order, or null when the payload is unprocessable. */
  order: IOrderDocument | null;
  /** True when this call created the order (false for duplicate webhooks). */
  created: boolean;
  /** The matched checkout handoff, if any. */
  handoff: ICheckoutHandoff | null;
  attribution: OrderAttribution | null;
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Extract the bare cart token from a Storefront cart GID
 * (gid://shopify/Cart/<token>?key=...). Returns the input unchanged when it
 * is not a cart GID.
 */
export const extractShopifyCartToken = (cartId: string): string => {
  const match = cartId.match(/^gid:\/\/shopify\/Cart\/([^?]+)/i);
  return match ? match[1] : cartId;
};

/**
 * Find the checkout handoff that produced this Shopify order, scoped to the
 * trusted store. The handoff stores the full Storefront cart GID while the
 * order webhook carries bare cart/checkout tokens, so the token segment is
 * matched. Handoffs already reconciled to a DIFFERENT order are never
 * reused; one reconciled to the SAME order still matches so duplicate
 * webhooks stay idempotent.
 */
export const findMatchingHandoff = async (
  storeId: string,
  shopifyOrder: any
): Promise<ICheckoutHandoff | null> => {
  const shopifyOrderId = shopifyOrder?.id?.toString();
  const tokens = [shopifyOrder?.cart_token, shopifyOrder?.checkout_token]
    .filter((token): token is string => typeof token === 'string' && token.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  const cartMatchers = tokens.flatMap(token => {
    const escaped = escapeRegExp(token);
    return [
      { shopifyCartId: token },
      // Anchored prefix regex stays on the { storeId, shopifyCartId } index
      { shopifyCartId: { $regex: `^gid://shopify/Cart/${escaped}(\\?|$)` } },
    ];
  });

  return CheckoutHandoff.findOne({
    storeId,
    $and: [
      { $or: cartMatchers },
      {
        $or: [
          { status: { $ne: 'reconciled' } },
          ...(shopifyOrderId ? [{ shopifyOrderId }] : []),
        ],
      },
    ],
  }).sort({ createdAt: -1 });
};

export const mapShopifyAddress = (shopifyAddress: any): any => {
  if (!shopifyAddress) return null;

  return {
    firstName: shopifyAddress.first_name,
    lastName: shopifyAddress.last_name,
    company: shopifyAddress.company,
    address1: shopifyAddress.address1,
    address2: shopifyAddress.address2,
    city: shopifyAddress.city,
    province: shopifyAddress.province,
    country: shopifyAddress.country,
    zip: shopifyAddress.zip,
    phone: shopifyAddress.phone
  };
};

export const mapShopifyFinancialStatus = (status: string): any => {
  const statusMap: { [key: string]: any } = {
    'pending': 'pending',
    'authorized': 'authorized',
    'partially_paid': 'partially_paid',
    'paid': 'paid',
    'partially_refunded': 'partially_refunded',
    'refunded': 'refunded',
    'voided': 'voided'
  };

  return statusMap[status] || 'pending';
};

export const mapShopifyFulfillmentStatus = (status: string): any => {
  const statusMap: { [key: string]: any } = {
    'fulfilled': 'fulfilled',
    'partial': 'partial',
    'restocked': 'restocked'
  };

  return statusMap[status] || 'unfulfilled';
};

export const mapToMobileStatus = (fulfillmentStatus: string): any => {
  const statusMap: { [key: string]: any } = {
    'fulfilled': 'delivered',
    'partial': 'shipped',
    'restocked': 'returned'
  };

  return statusMap[fulfillmentStatus] || 'confirmed';
};

interface Attribution {
  type: OrderAttribution;
  customerId?: Types.ObjectId;
  guestSessionId?: string;
}

const resolveAttribution = async (
  storeId: string,
  handoff: ICheckoutHandoff | null,
  email: string | null
): Promise<Attribution> => {
  if (handoff?.customerId) {
    // Handoff storeId always equals the trusted storeId (store-scoped query),
    // but re-verify the customer still belongs to this store before linking
    const customer = await Customer.findOne({
      _id: handoff.customerId,
      storeId,
    })
      .select('_id')
      .lean();

    if (customer) {
      return { type: 'handoff-customer', customerId: handoff.customerId };
    }
  }

  if (handoff?.guestSessionId) {
    return { type: 'handoff-guest', guestSessionId: handoff.guestSessionId };
  }

  if (email) {
    // Store-scoped only: the same email in another store must never match
    const customer = await Customer.findOne({
      storeId,
      email: email.toLowerCase(),
    })
      .select('_id')
      .lean();

    if (customer) {
      return { type: 'customer-email', customerId: customer._id as Types.ObjectId };
    }
  }

  return { type: 'guest-fallback' };
};

/**
 * Map Shopify line items to order line items. `productId` is the LOCAL
 * Product reference, so it is resolved store-scoped from the Shopify product
 * ID (one query for the whole order) and left unset when the product is not
 * synced locally; the raw Shopify IDs are kept on their dedicated fields.
 */
const resolveLineItems = async (
  storeId: string,
  shopifyOrder: any
): Promise<Record<string, any>[]> => {
  const items: any[] = shopifyOrder.line_items || [];

  const shopifyProductIds = [
    ...new Set(
      items
        .map(item => item.product_id?.toString())
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const localProducts = shopifyProductIds.length
    ? await Product.find({ storeId, shopifyProductId: { $in: shopifyProductIds } })
        .select('_id shopifyProductId')
        .lean()
    : [];
  const localProductIds = new Map(
    localProducts.map(product => [product.shopifyProductId, product._id])
  );

  return items.map(item => ({
    productId: item.product_id
      ? localProductIds.get(item.product_id.toString())
      : undefined,
    shopifyProductId: item.product_id?.toString(),
    shopifyVariantId: item.variant_id?.toString(),
    variantId: item.variant_id?.toString(),
    quantity: item.quantity,
    price: parseFloat(item.price),
    title: item.title,
    sku: item.sku
  }));
};

/**
 * Address fields Shopify does not require for every country. When a
 * webhook-sourced order lacks one of these, we store it as absent and log a
 * warning (not an error) rather than dropping the order (issue #126).
 */
const OPTIONAL_ADDRESS_FIELDS = ['province', 'zip', 'phone'] as const;

const warnAbsentAddressFields = (
  storeId: string,
  shopifyOrderId: string,
  orderData: Record<string, any>
): void => {
  for (const key of ['billingAddress', 'shippingAddress'] as const) {
    const address = orderData[key];
    if (!address) continue;
    const absent = OPTIONAL_ADDRESS_FIELDS.filter(field => !address[field]);
    if (absent.length > 0) {
      console.warn(
        `⚠️ Shopify order ${shopifyOrderId} ${key} is missing ${absent.join(', ')}; ` +
          `stored as absent (store: ${storeId})`
      );
    }
  }
};

const buildOrderData = (
  storeId: string,
  shopifyOrder: any,
  email: string,
  attribution: Attribution,
  lineItems: Record<string, any>[]
): Record<string, any> => {
  const orderData: Record<string, any> = {
    storeId,
    shopifyOrderId: shopifyOrder.id.toString(),
    shopifyOrderNumber: shopifyOrder.order_number?.toString(),
    orderNumber: shopifyOrder.name || shopifyOrder.order_number?.toString(),
    email,

    lineItems,

    subtotalPrice: parseFloat(shopifyOrder.subtotal_price),
    totalTax: parseFloat(shopifyOrder.total_tax),
    totalPrice: parseFloat(shopifyOrder.total_price),
    currency: shopifyOrder.currency,

    billingAddress: mapShopifyAddress(shopifyOrder.billing_address),
    // Digital/no-ship Shopify orders carry no shipping address, but the
    // schema requires one; fall back to billing so they still reconcile
    shippingAddress: mapShopifyAddress(shopifyOrder.shipping_address)
      || mapShopifyAddress(shopifyOrder.billing_address),

    shipping: {
      method: shopifyOrder.shipping_lines?.[0]?.title || 'Standard',
      cost: shopifyOrder.shipping_lines?.[0] ?
        parseFloat(shopifyOrder.shipping_lines[0].price) : 0,
      carrier: shopifyOrder.shipping_lines?.[0]?.carrier_identifier,
      trackingNumber: shopifyOrder.tracking_number,
      trackingUrl: shopifyOrder.tracking_url
    },

    financialStatus: mapShopifyFinancialStatus(shopifyOrder.financial_status),
    fulfillmentStatus: mapShopifyFulfillmentStatus(shopifyOrder.fulfillment_status),

    mobileStatus: {
      current: 'confirmed',
      history: [{
        status: 'placed',
        timestamp: new Date(shopifyOrder.created_at),
        note: 'Order received from Shopify'
      }]
    },

    placedAt: new Date(shopifyOrder.created_at),
    source: 'web',
    channel: 'website',

    notificationPreferences: {
      pushEnabled: true,
      emailEnabled: true,
      smsEnabled: false
    }
  };

  if (attribution.customerId) {
    orderData.customer = attribution.customerId;
  } else {
    orderData.isGuestOrder = true;
    if (attribution.guestSessionId) {
      orderData.guestSessionId = attribution.guestSessionId;
    }
    // Guest orders require a fullName; fall back through every name source
    // in the payload and finally to the email so a nameless order can still
    // be stored instead of failing validation into Shopify's retry pipeline
    const fullName =
      [
        shopifyOrder.billing_address?.first_name,
        shopifyOrder.billing_address?.last_name,
      ].filter(Boolean).join(' ') ||
      [
        shopifyOrder.shipping_address?.first_name,
        shopifyOrder.shipping_address?.last_name,
      ].filter(Boolean).join(' ') ||
      [
        shopifyOrder.customer?.first_name,
        shopifyOrder.customer?.last_name,
      ].filter(Boolean).join(' ') ||
      email;

    orderData.guestContact = {
      email,
      phone: shopifyOrder.billing_address?.phone || shopifyOrder.shipping_address?.phone,
      fullName,
    };
  }

  return orderData;
};

/**
 * Create or update the local Order for a verified Shopify order webhook,
 * scoped to the trusted store, and mark the matching CheckoutHandoff as
 * reconciled. Idempotent: a duplicate webhook finds the existing
 * { storeId, shopifyOrderId } order and returns it unchanged, and a
 * concurrent duplicate insert is caught by the compound unique index.
 */
export const reconcileShopifyOrder = async (
  storeId: string,
  shopifyOrder: any
): Promise<ReconcileResult> => {
  const shopifyOrderId = shopifyOrder?.id?.toString();
  if (!shopifyOrderId) {
    console.warn(`⚠️ Shopify order webhook without an order id; skipping (store: ${storeId})`);
    return { order: null, created: false, handoff: null, attribution: null };
  }

  const [existingOrder, handoff] = await Promise.all([
    Order.findOne({ storeId, shopifyOrderId }),
    findMatchingHandoff(storeId, shopifyOrder),
  ]);

  let order = existingOrder;
  let created = false;
  let attribution: OrderAttribution | null = null;

  // Mark the document as webhook-sourced so the Order address schema relaxes
  // province/zip/phone validation (issue #76): any address Shopify accepted is
  // storable. Set on the loaded order too, so subsequent update/paid saves of a
  // sparse-address order re-validate under the same relaxed rules.
  if (order) {
    order.$locals.webhookSourced = true;
  }

  if (!order) {
    const email: string | null =
      shopifyOrder.email || shopifyOrder.contact_email || shopifyOrder.customer?.email || null;

    if (!email) {
      // An Order requires an email; a payload without one can never succeed
      // on retry, so record nothing and let the handler acknowledge it
      console.warn(
        `⚠️ Unmatched Shopify order ${shopifyOrderId} has no email; not stored (store: ${storeId})`
      );
      return { order: null, created: false, handoff, attribution: null };
    }

    const [resolved, lineItems] = await Promise.all([
      resolveAttribution(storeId, handoff, email),
      resolveLineItems(storeId, shopifyOrder),
    ]);
    attribution = resolved.type;

    const orderData = buildOrderData(storeId, shopifyOrder, email, resolved, lineItems);
    warnAbsentAddressFields(storeId, shopifyOrderId, orderData);

    const newOrder = new Order(orderData);
    // Webhook-sourced: relax province/zip/phone validation (see above)
    newOrder.$locals.webhookSourced = true;

    try {
      await newOrder.save();
      order = newOrder;
      created = true;
    } catch (error: any) {
      if (error?.code === 11000) {
        // Concurrent duplicate webhook lost the race to the compound unique
        // index { storeId, shopifyOrderId }; fall back to the winner's order.
        // The refetch is a fresh document with empty $locals, so re-mark it
        // webhook-sourced: the controller saves it again (paid/status
        // transitions), and a sparse Shopify address must stay storable under
        // the relaxed rules instead of failing strict validation (issue #126).
        order = await Order.findOne({ storeId, shopifyOrderId });
        if (!order) throw error;
        order.$locals.webhookSourced = true;
      } else if (error?.name === 'ValidationError') {
        // A payload that fails schema validation can never succeed on
        // retry: log it clearly and let the handler acknowledge with 200
        // instead of 500-looping in Shopify's retry pipeline
        console.warn(
          `⚠️ Shopify order ${shopifyOrderId} failed validation and was not stored (store: ${storeId}):`,
          error.message
        );
        return { order: null, created: false, handoff, attribution };
      } else {
        throw error;
      }
    }

    if (attribution === 'guest-fallback' && !handoff) {
      console.warn(
        `⚠️ Unmatched Shopify order ${shopifyOrderId} stored store-scoped as a guest order (store: ${storeId})`
      );
    }
  }

  // Mark the handoff reconciled (idempotent: re-marking with the same order
  // is a no-op, and a handoff reconciled to a different order never matches)
  if (order && handoff && handoff.shopifyOrderId !== shopifyOrderId) {
    handoff.status = 'reconciled';
    handoff.reconciledAt = new Date();
    handoff.shopifyOrderId = shopifyOrderId;
    handoff.orderId = order._id as Types.ObjectId;
    await handoff.save();
  }

  return { order: order as IOrderDocument, created, handoff, attribution };
};
