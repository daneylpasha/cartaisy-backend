import mongoose from 'mongoose';
import CartActivity, { ICartActivity } from '../models/CartActivity';
import Customer from '../models/Customer';
import NotificationLog from '../models/NotificationLog';
import NotificationTemplate from '../models/NotificationTemplate';
import { FirebaseNotificationService, PushNotification, DeepLink } from './firebaseNotificationService';
import shopifyStorefront from './shopifyStorefrontService';

/**
 * Abandoned Cart Service
 *
 * Handles identification and notification of abandoned carts.
 * Works with CartActivity model to track cart state and notification history.
 */

export interface AbandonedCartSettings {
  enabled: boolean;
  abandonmentThresholdMinutes: number;
  quietHoursStart: number; // Hour in 24-hour format (e.g., 22 for 10 PM)
  quietHoursEnd: number; // Hour in 24-hour format (e.g., 8 for 8 AM)
  templateId?: string;
  maxNotificationsPerCart: number;
}

export interface AbandonedCartSummary {
  customerId: string;
  customerEmail: string;
  customerName: string | null;
  itemCount: number;
  cartTotal: number;
  currency: string;
  lastCartUpdate: Date;
  hoursSinceUpdate: number;
  notificationsSent: number;
}

export interface SendResult {
  customerId: string;
  success: boolean;
  error?: string;
}

// Default settings (TESTING MODE - revert for production)
const DEFAULT_SETTINGS: AbandonedCartSettings = {
  enabled: true,
  abandonmentThresholdMinutes: 3, // TESTING: was 60
  quietHoursStart: 0, // TESTING: was 22 (disabled for testing)
  quietHoursEnd: 0, // TESTING: was 8 (disabled for testing)
  maxNotificationsPerCart: 10, // TESTING: was 1
};

// In-memory store settings cache (per store)
const storeSettingsCache: Map<string, AbandonedCartSettings> = new Map();

/**
 * Get abandoned cart settings for a store
 */
export async function getAbandonedCartSettings(
  storeId: string
): Promise<AbandonedCartSettings> {
  // Check cache first
  if (storeSettingsCache.has(storeId)) {
    return storeSettingsCache.get(storeId)!;
  }

  // Load from database (Store.abandonedCartSettings)
  const Store = mongoose.model('Store');
  const store = await Store.findById(storeId).select('abandonedCartSettings').lean() as any;

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(store?.abandonedCartSettings || {}),
  };

  // Cache settings
  storeSettingsCache.set(storeId, settings);

  return settings;
}

/**
 * Update abandoned cart settings for a store
 */
export async function updateAbandonedCartSettings(
  storeId: string,
  updates: Partial<AbandonedCartSettings>
): Promise<AbandonedCartSettings> {
  const Store = mongoose.model('Store');

  // First get existing settings to preserve them
  const existingStore = await Store.findById(storeId).select('abandonedCartSettings').lean() as any;
  const existingSettings = existingStore?.abandonedCartSettings || {};

  // Merge: defaults -> existing -> updates
  const newSettings = {
    ...DEFAULT_SETTINGS,
    ...existingSettings,
    ...updates,
  };

  console.log(`🛒 [SETTINGS] Updating store ${storeId}:`, {
    existing: existingSettings,
    updates,
    final: newSettings,
  });

  const store = await Store.findByIdAndUpdate(
    storeId,
    { $set: { abandonedCartSettings: newSettings } },
    { new: true }
  ).select('abandonedCartSettings');

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(store?.abandonedCartSettings || {}),
  };

  // Update cache
  storeSettingsCache.set(storeId, settings);

  // Also clear cache to ensure fresh read on next request
  storeSettingsCache.delete(storeId);

  return settings;
}

/**
 * Clear settings cache (useful after updates)
 */
export function clearSettingsCache(storeId?: string): void {
  if (storeId) {
    storeSettingsCache.delete(storeId);
  } else {
    storeSettingsCache.clear();
  }
}

/**
 * Check if current time is within quiet hours
 */
export function isQuietHours(
  quietHoursStart: number,
  quietHoursEnd: number,
  timezone: string = 'UTC'
): boolean {
  const now = new Date();

  // Get current hour in the specified timezone
  let currentHour: number;
  try {
    currentHour = parseInt(
      now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: timezone })
    );
  } catch {
    // Fallback to UTC if timezone is invalid
    currentHour = now.getUTCHours();
  }

  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (quietHoursStart > quietHoursEnd) {
    return currentHour >= quietHoursStart || currentHour < quietHoursEnd;
  }

  // Handle same-day quiet hours (e.g., 14:00 to 16:00)
  return currentHour >= quietHoursStart && currentHour < quietHoursEnd;
}

/**
 * Identify abandoned carts for a store
 */
export async function identifyAbandonedCarts(
  storeId: string,
  abandonedAfterMinutes: number = 60
): Promise<AbandonedCartSummary[]> {
  const abandonedThreshold = new Date(Date.now() - abandonedAfterMinutes * 60 * 1000);
  // TESTING: 5 min cooldown (was 24 hours = 24 * 60 * 60 * 1000)
  const notificationCooldown = new Date(Date.now() - 5 * 60 * 1000);

  console.log(`🛒 [ABANDONED] Checking store ${storeId} with threshold ${abandonedAfterMinutes} min (before ${abandonedThreshold.toISOString()})`);

  // First check - how many cart activities exist for this store?
  const totalActivities = await CartActivity.countDocuments({
    storeId: new mongoose.Types.ObjectId(storeId),
  });
  console.log(`🛒 [ABANDONED] Total CartActivity records for store: ${totalActivities}`);

  // Check with just basic criteria
  const withItems = await CartActivity.countDocuments({
    storeId: new mongoose.Types.ObjectId(storeId),
    itemCount: { $gt: 0 },
    hasCompletedCheckout: false,
  });
  console.log(`🛒 [ABANDONED] Carts with items & not completed: ${withItems}`);

  // Find cart activities that match abandonment criteria
  const activities = await CartActivity.find({
    storeId: new mongoose.Types.ObjectId(storeId),
    itemCount: { $gt: 0 },
    hasCompletedCheckout: false,
    lastCartUpdate: { $lt: abandonedThreshold },
    $or: [
      { lastCheckoutInitiated: { $exists: false } },
      { lastCheckoutInitiated: null },
      { lastCheckoutInitiated: { $lt: abandonedThreshold } },
    ],
  })
    .populate('customerId', 'email name deviceTokens notificationPreferences')
    .lean();

  console.log(`🛒 [ABANDONED] Activities matching time criteria: ${activities.length}`);

  // Filter and transform results
  const abandonedCarts: AbandonedCartSummary[] = [];

  for (const activity of activities) {
    const customer = activity.customerId as any;

    if (!customer || !customer._id) {
      console.log(`🛒 [ABANDONED] Skipping: no customer data`);
      continue;
    }

    // Check if customer has push notifications enabled (default to true if not set)
    const pushEnabled = customer.notificationPreferences?.pushEnabled !== false;
    if (!pushEnabled) {
      console.log(`🛒 [ABANDONED] Skipping ${customer.email}: push disabled`);
      continue;
    }

    // Check notification cooldown (24 hours)
    if (
      activity.lastAbandonedCartNotificationSent &&
      activity.lastAbandonedCartNotificationSent > notificationCooldown
    ) {
      console.log(`🛒 [ABANDONED] Skipping ${customer.email}: notification sent recently`);
      continue;
    }

    // Check if customer has device tokens (don't require active flag)
    const deviceTokens = customer.deviceTokens || [];
    if (deviceTokens.length === 0) {
      console.log(`🛒 [ABANDONED] Skipping ${customer.email}: no device tokens`);
      continue;
    }
    console.log(`🛒 [ABANDONED] Found eligible cart for ${customer.email}: ${activity.itemCount} items, $${activity.cartTotal}`);

    const hoursSinceUpdate = Math.round(
      (Date.now() - new Date(activity.lastCartUpdate).getTime()) / (1000 * 60 * 60)
    );

    abandonedCarts.push({
      customerId: customer._id.toString(),
      customerEmail: customer.email,
      customerName: customer.name || null,
      itemCount: activity.itemCount,
      cartTotal: activity.cartTotal,
      currency: activity.currency,
      lastCartUpdate: activity.lastCartUpdate,
      hoursSinceUpdate,
      notificationsSent: activity.abandonedCartNotificationCount,
    });
  }

  return abandonedCarts;
}

/**
 * Build notification content for abandoned cart
 */
async function buildNotificationContent(
  storeId: string,
  cart: AbandonedCartSummary,
  templateId?: string
): Promise<PushNotification> {
  // Deep link to cart for abandoned cart notifications
  const cartDeepLink: DeepLink = {
    type: 'cart',
  };

  // Try to use template if provided
  if (templateId) {
    try {
      const template = await NotificationTemplate.findOne({
        _id: templateId,
        storeId: new mongoose.Types.ObjectId(storeId),
        isActive: true,
      });

      if (template) {
        // Replace variables in template
        let title = template.title;
        let body = template.body;

        const variables: Record<string, string> = {
          '{{itemCount}}': cart.itemCount.toString(),
          '{{cartTotal}}': cart.cartTotal.toFixed(2),
          '{{currency}}': cart.currency,
          '{{customerName}}': cart.customerName || 'there',
        };

        for (const [key, value] of Object.entries(variables)) {
          title = title.replace(new RegExp(key, 'g'), value);
          body = body.replace(new RegExp(key, 'g'), value);
        }

        return {
          title,
          body,
          imageUrl: (template as any).image,
          deepLink: (template as any).deepLink || cartDeepLink,
          data: {
            type: 'abandoned_cart',
            action: 'open_cart',
            itemCount: cart.itemCount.toString(),
            cartTotal: cart.cartTotal.toString(),
          },
        };
      }
    } catch (error) {
      console.error('Error loading notification template:', error);
    }
  }

  // Default notification content
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: cart.currency,
  }).format(cart.cartTotal);

  return {
    title: 'You left something behind!',
    body:
      cart.itemCount === 1
        ? `Your cart with 1 item (${formattedTotal}) is waiting for you.`
        : `Your cart with ${cart.itemCount} items (${formattedTotal}) is waiting for you.`,
    deepLink: cartDeepLink,
    data: {
      type: 'cart', // Changed from 'abandoned_cart' for deep link compatibility
      notificationType: 'abandoned_cart', // Keep original type for tracking
      action: 'open_cart',
      itemCount: cart.itemCount.toString(),
      cartTotal: cart.cartTotal.toString(),
    },
  };
}

/**
 * Send abandoned cart notification to a single customer
 */
export async function sendAbandonedCartNotification(
  storeId: string,
  cart: AbandonedCartSummary,
  settings: AbandonedCartSettings
): Promise<SendResult> {
  try {
    console.log(`🛒 [ABANDONED] Sending notification to ${cart.customerEmail}, notificationsSent: ${cart.notificationsSent}, max: ${settings.maxNotificationsPerCart}`);

    // Check max notifications limit
    if (cart.notificationsSent >= settings.maxNotificationsPerCart) {
      console.log(`🛒 [ABANDONED] Skip: max notifications reached (${cart.notificationsSent}/${settings.maxNotificationsPerCart})`);
      return {
        customerId: cart.customerId,
        success: false,
        error: 'Max notifications limit reached',
      };
    }

    // Get customer with shopifyCartId to verify cart from Shopify
    const customer = await Customer.findById(cart.customerId).select('deviceTokens shopifyCartId');

    // Verify cart from Shopify before sending notification, using the
    // store's own Storefront credentials (the global client is gated off in
    // production/SaaS mode and must not decide which shop is queried)
    if (customer?.shopifyCartId) {
      try {
        const cartResponse = await shopifyStorefront.getCartForStore(storeId, customer.shopifyCartId);
        const shopifyCart = cartResponse?.data?.cart;
        const actualItemCount = shopifyCart?.lines?.edges?.length || 0;

        console.log(`🛒 [ABANDONED] Shopify cart verification for ${cart.customerEmail}: ${actualItemCount} items (cached: ${cart.itemCount})`);

        if (actualItemCount === 0) {
          // Cart is empty in Shopify - update CartActivity and skip notification
          const storeObjectId = new mongoose.Types.ObjectId(storeId);
          await CartActivity.updateCartActivity(storeObjectId, cart.customerId, {
            shopifyCartId: customer.shopifyCartId,
            itemCount: 0,
            cartTotal: 0,
            currency: cart.currency,
          });

          console.log(`🛒 [ABANDONED] Skip: cart is actually empty in Shopify, updated CartActivity`);
          return {
            customerId: cart.customerId,
            success: false,
            error: 'Cart is empty (verified from Shopify)',
          };
        }

        // Update cart data with fresh info from Shopify
        const actualTotal = parseFloat(shopifyCart?.estimatedCost?.subtotalAmount?.amount || '0');
        if (actualItemCount !== cart.itemCount || actualTotal !== cart.cartTotal) {
          cart.itemCount = actualItemCount;
          cart.cartTotal = actualTotal;
          console.log(`🛒 [ABANDONED] Updated cart data from Shopify: ${actualItemCount} items, $${actualTotal}`);
        }
      } catch (shopifyError) {
        console.error(`🛒 [ABANDONED] Error verifying cart from Shopify:`, shopifyError);
        // Continue with cached data if Shopify verification fails
      }
    }

    if (!customer) {
      console.log(`🛒 [ABANDONED] Skip: customer not found`);
      return {
        customerId: cart.customerId,
        success: false,
        error: 'Customer not found',
      };
    }

    const deviceTokens = customer.getActiveDeviceTokens();
    console.log(`🛒 [ABANDONED] Customer ${cart.customerEmail} has ${deviceTokens.length} active device tokens`);

    if (deviceTokens.length === 0) {
      console.log(`🛒 [ABANDONED] Skip: no active device tokens`);
      return {
        customerId: cart.customerId,
        success: false,
        error: 'No active device tokens',
      };
    }

    // Build notification content
    const notification = await buildNotificationContent(storeId, cart, settings.templateId);

    // Send via Firebase
    const result = await FirebaseNotificationService.sendToDevices(deviceTokens, notification);

    // Log the notification
    await NotificationLog.create({
      storeId: new mongoose.Types.ObjectId(storeId),
      title: notification.title,
      body: notification.body,
      data: notification.data,
      imageUrl: notification.imageUrl,
      deepLink: notification.deepLink,
      segment: 'abandoned_cart',
      customSegmentCriteria: {
        customerId: cart.customerId,
        itemCount: cart.itemCount,
        cartTotal: cart.cartTotal,
      },
      status: result.failureCount === 0 ? 'sent' : result.successCount > 0 ? 'partial' : 'failed',
      sentAt: new Date(),
      targetCount: result.targetCount,
      successCount: result.successCount,
      failureCount: result.failureCount,
      failedTokens: result.failedTokens,
    });

    // Mark notification as sent in CartActivity
    await CartActivity.markNotificationSent(cart.customerId);

    // Cleanup invalid tokens
    if (result.invalidTokens.length > 0) {
      await FirebaseNotificationService.removeInvalidTokens(result.invalidTokens);
    }

    return {
      customerId: cart.customerId,
      success: result.successCount > 0,
      error: result.successCount === 0 ? 'All sends failed' : undefined,
    };
  } catch (error: any) {
    console.error(`Error sending abandoned cart notification to ${cart.customerId}:`, error);
    return {
      customerId: cart.customerId,
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Process abandoned carts for a store
 * Main function called by the scheduler
 */
export async function processAbandonedCartsForStore(
  storeId: string
): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}> {
  const result = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    // Get store settings
    const settings = await getAbandonedCartSettings(storeId);

    // Check if feature is enabled
    if (!settings.enabled) {
      return result;
    }

    // Get store timezone
    const Store = mongoose.model('Store');
    const store = await Store.findById(storeId).select('settings.timezone').lean() as any;
    const timezone = store?.settings?.timezone || 'UTC';

    // Check quiet hours
    if (isQuietHours(settings.quietHoursStart, settings.quietHoursEnd, timezone)) {
      console.log(`🛒 [ABANDONED] Store ${storeId}: Skipping during quiet hours`);
      return result;
    }

    // Identify abandoned carts
    const abandonedCarts = await identifyAbandonedCarts(
      storeId,
      settings.abandonmentThresholdMinutes
    );

    result.processed = abandonedCarts.length;

    if (abandonedCarts.length === 0) {
      return result;
    }

    console.log(`🛒 [ABANDONED] Store ${storeId}: Found ${abandonedCarts.length} abandoned carts`);

    // Send notifications (with rate limiting - max 10 per batch)
    const batch = abandonedCarts.slice(0, 10);

    for (const cart of batch) {
      const sendResult = await sendAbandonedCartNotification(storeId, cart, settings);

      if (sendResult.success) {
        result.sent++;
      } else if (sendResult.error?.includes('Max notifications')) {
        result.skipped++;
      } else {
        result.failed++;
        result.errors.push(`${cart.customerEmail}: ${sendResult.error}`);
      }

      // Small delay between sends to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(
      `🛒 [ABANDONED] Store ${storeId}: Sent ${result.sent}, Failed ${result.failed}, Skipped ${result.skipped}`
    );

    return result;
  } catch (error: any) {
    console.error(`Error processing abandoned carts for store ${storeId}:`, error);
    result.errors.push(error.message || 'Unknown error');
    return result;
  }
}

/**
 * Get list of currently abandoned carts for admin review
 */
export async function getAbandonedCartsForAdmin(
  storeId: string,
  options: {
    limit?: number;
    offset?: number;
    minHoursAbandoned?: number;
  } = {}
): Promise<{
  carts: AbandonedCartSummary[];
  total: number;
}> {
  const { limit = 20, offset = 0, minHoursAbandoned = 1 } = options;

  const settings = await getAbandonedCartSettings(storeId);
  const abandonedThreshold = new Date(
    Date.now() - Math.max(minHoursAbandoned * 60, settings.abandonmentThresholdMinutes) * 60 * 1000
  );

  // Count total
  const total = await CartActivity.countDocuments({
    storeId: new mongoose.Types.ObjectId(storeId),
    itemCount: { $gt: 0 },
    hasCompletedCheckout: false,
    lastCartUpdate: { $lt: abandonedThreshold },
  });

  // Get paginated results
  const activities = await CartActivity.find({
    storeId: new mongoose.Types.ObjectId(storeId),
    itemCount: { $gt: 0 },
    hasCompletedCheckout: false,
    lastCartUpdate: { $lt: abandonedThreshold },
  })
    .populate('customerId', 'email name')
    .sort({ lastCartUpdate: -1 })
    .skip(offset)
    .limit(limit)
    .lean();

  const carts: AbandonedCartSummary[] = activities.map((activity: any) => {
    const customer = activity.customerId as any;
    const hoursSinceUpdate = Math.round(
      (Date.now() - new Date(activity.lastCartUpdate).getTime()) / (1000 * 60 * 60)
    );

    return {
      customerId: customer?._id?.toString() || activity.customerId.toString(),
      customerEmail: customer?.email || 'Unknown',
      customerName: customer?.name || null,
      itemCount: activity.itemCount,
      cartTotal: activity.cartTotal,
      currency: activity.currency,
      lastCartUpdate: activity.lastCartUpdate,
      hoursSinceUpdate,
      notificationsSent: activity.abandonedCartNotificationCount,
    };
  });

  return { carts, total };
}
