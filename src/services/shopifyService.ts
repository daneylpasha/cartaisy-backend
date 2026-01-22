import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import axios, { AxiosInstance } from 'axios';
import { tenantConfig } from '../config/tenant';
import Product from '../models/Product';
import User from '../models/User';
import Order from '../models/Order';
import Store from '../models/Store';
import crypto from 'crypto';
import {
  IShopifyProduct,
  IShopifyCustomer,
  IAddress,
  IShippingInfo,
  IOrderLineItem,
  IMobileStatusHistory
} from '../types/index';
import { ApiError } from '../utils/errors';
import { decrypt } from '../utils/encryption';

/**
 * Default currency for new user preferences.
 * Configurable via STORE_CURRENCY environment variable.
 */
const DEFAULT_STORE_CURRENCY = process.env.STORE_CURRENCY || 'USD';

interface ShopifyResponse<T = any> {
  body: T;
  status: number;
  headers: Record<string, string>;
}

interface ShopifyProductResponse {
  products: any[];
}

interface ShopifyCustomerResponse {
  customers: any[];
}

interface ShopifyOrderResponse {
  orders: any[];
}

interface SyncResult {
  synced: number;
  errors: string[];
}

interface InventoryLevel {
  variantId: string;
  quantity: number;
  policy: string;
  tracked: boolean;
}

interface InventoryLevelsResponse {
  productId: string;
  totalQuantity: number;
  variants: InventoryLevel[];
}

// Initialize Shopify API - commented out to fix runtime error
// const shopify = shopifyApi({
//   apiKey: process.env.SHOPIFY_API_KEY || '',
//   apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
//   scopes: ['read_products', 'write_products', 'read_orders', 'write_orders'],
//   hostName: process.env.SHOPIFY_APP_URL || '',
//   apiVersion: ApiVersion.October23,
//   isEmbeddedApp: false
// });

// Shopify REST client
interface ShopifySession {
  shop: string;
  accessToken: string;
}

let currentSession: ShopifySession | null = null;

/**
 * Get Shopify session for API calls
 */
export const getShopifySession = () => {
  const { storeUrl, accessToken } = tenantConfig.shopify;
  
  if (!storeUrl || !accessToken) {
    throw new Error('Shopify credentials not configured');
  }

  // Remove protocol and trailing slash from store URL
  const shopName = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return {
    shop: shopName,
    accessToken: accessToken
  };
};

/**
 * Legacy client getter - simplified for deployment
 */
// Store-specific Shopify client cache
let cachedClient: { storeId: string; client: AxiosInstance } | null = null;

/**
 * Get Shopify Admin API client for a specific store
 * Uses store credentials from database
 */
export const getShopifyClientForStore = async (storeId: string): Promise<AxiosInstance | null> => {
  try {
    const store = await Store.findById(storeId).select('+shopify.accessToken');

    if (!store?.shopify?.accessToken || !store.shopify.shop || !store.shopify.isConnected) {
      console.log(`Store ${storeId} not connected to Shopify or missing credentials`);
      return null;
    }

    // Try to decrypt the access token, fallback to raw token if not encrypted
    let accessToken = store.shopify.accessToken;
    const isEncrypted = accessToken.includes(':') && accessToken.split(':').length === 3;

    if (isEncrypted) {
      try {
        accessToken = decrypt(store.shopify.accessToken);
      } catch (decryptError) {
        console.warn(`Failed to decrypt token for store ${storeId}, using raw token`);
      }
    }

    return axios.create({
      baseURL: `https://${store.shopify.shop}/admin/api/2024-01`,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  } catch (error) {
    console.error('Error creating Shopify client:', error);
    return null;
  }
};

/**
 * Get the first connected store's Shopify client (for backward compatibility)
 * This is used by sync functions that don't have a specific storeId
 */
export const getShopifyClient = async (): Promise<AxiosInstance | null> => {
  try {
    // Find first connected store
    const store = await Store.findOne({ 'shopify.isConnected': true }).select('+shopify.accessToken');

    if (!store?.shopify?.accessToken || !store.shopify.shop) {
      console.log('No connected Shopify store found');
      return null;
    }

    // Try to decrypt the access token, fallback to raw token if not encrypted
    let accessToken = store.shopify.accessToken;
    const isEncrypted = accessToken.includes(':') && accessToken.split(':').length === 3;

    if (isEncrypted) {
      try {
        accessToken = decrypt(store.shopify.accessToken);
      } catch (decryptError) {
        console.warn(`Failed to decrypt token, using raw token`);
      }
    }

    return axios.create({
      baseURL: `https://${store.shopify.shop}/admin/api/2024-01`,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  } catch (error) {
    console.error('Error creating Shopify client:', error);
    return null;
  }
};

/**
 * Test Shopify API connectivity
 */
export const testShopifyConnection = async (): Promise<boolean> => {
  try {
    const client = await getShopifyClient();
    if (!client) return false;

    const response = await client.get('/shop.json');
    return !!response.data?.shop;
  } catch (error) {
    console.error('Shopify connection test failed:', error);
    return false;
  }
};

/**
 * Verify which Shopify store is connected and return shop details
 * This helps debug when products don't match
 */
export const verifyShopifyStoreInfo = async (): Promise<{
  connected: boolean;
  databaseShop: string | null;
  databaseStoreId: string | null;
  shopifyShopInfo: {
    id: string;
    name: string;
    email: string;
    domain: string;
    myshopifyDomain: string;
  } | null;
  productCount: number | null;
}> => {
  try {
    const store = await Store.findOne({ 'shopify.isConnected': true }).select('shopify.shop');

    if (!store?.shopify?.shop) {
      return {
        connected: false,
        databaseShop: null,
        databaseStoreId: null,
        shopifyShopInfo: null,
        productCount: null
      };
    }

    const client = await getShopifyClient();
    if (!client) {
      return {
        connected: false,
        databaseShop: store.shopify.shop,
        databaseStoreId: store._id.toString(),
        shopifyShopInfo: null,
        productCount: null
      };
    }

    // Get shop info from Shopify API
    const shopResponse = await client.get('/shop.json');
    const shopInfo = shopResponse.data?.shop;

    // Get product count
    const countResponse = await client.get('/products/count.json');
    const productCount = countResponse.data?.count || 0;

    return {
      connected: true,
      databaseShop: store.shopify.shop,
      databaseStoreId: store._id.toString(),
      shopifyShopInfo: shopInfo ? {
        id: shopInfo.id?.toString(),
        name: shopInfo.name,
        email: shopInfo.email,
        domain: shopInfo.domain,
        myshopifyDomain: shopInfo.myshopify_domain
      } : null,
      productCount
    };
  } catch (error: any) {
    console.error('Error verifying Shopify store info:', error.response?.data || error.message);
    return {
      connected: false,
      databaseShop: null,
      databaseStoreId: null,
      shopifyShopInfo: null,
      productCount: null
    };
  }
};

/**
 * Get connected store info for debugging
 */
export const getConnectedStoreInfo = async (): Promise<{ shop: string; storeId: string } | null> => {
  try {
    const store = await Store.findOne({ 'shopify.isConnected': true }).select('shopify.shop');
    if (!store?.shopify?.shop) {
      return null;
    }
    return {
      shop: store.shopify.shop,
      storeId: store._id.toString()
    };
  } catch (error) {
    console.error('Error getting connected store info:', error);
    return null;
  }
};

/**
 * Fetch all products from Shopify and sync with our Product model
 */
export const syncProducts = async (): Promise<SyncResult> => {
  // First log which store we're syncing from
  const storeInfo = await getConnectedStoreInfo();
  console.log(`📦 [Sync] Connected store info:`, storeInfo);

  const client = await getShopifyClient();
  const errors: string[] = [];
  let synced = 0;
  const limit = 50;

  if (!client) {
    console.log('❌ No Shopify client available - store not connected');
    return { synced: 0, errors: ['No Shopify store connected'] };
  }

  try {
    // Fetch all products (removed status filter to get all including unpublished)
    let url = `/products.json?limit=${limit}`;
    let pageCount = 0;

    console.log(`📦 [Sync] Starting product sync from shop: ${storeInfo?.shop}...`);

    while (url) {
      pageCount++;
      console.log(`📦 [Sync] Fetching page ${pageCount}: ${url}`);

      const response = await client.get(url);
      const products = response.data?.products || [];

      console.log(`📦 [Sync] Page ${pageCount} returned ${products.length} products`);

      if (products.length === 0) {
        break;
      }

      for (const shopifyProduct of products) {
        try {
          await syncProduct(shopifyProduct.id.toString(), shopifyProduct);
          synced++;
        } catch (error) {
          const errorMsg = `Failed to sync product ${shopifyProduct.id}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Check for next page using Link header (axios stores headers in lowercase)
      const linkHeader = response.headers?.link || response.headers?.Link;
      console.log(`📦 [Sync] Link header: ${linkHeader || 'NONE'}`);

      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match) {
          // Extract just the endpoint path (e.g., /products.json?...) without the /admin/api/version prefix
          try {
            const nextUrl = new URL(match[1]);
            // Remove the /admin/api/XXXX-XX prefix since baseURL already has it
            const pathWithoutApiPrefix = nextUrl.pathname.replace(/^\/admin\/api\/\d{4}-\d{2}/, '');
            url = `${pathWithoutApiPrefix}${nextUrl.search}`;
            console.log(`[Sync] Next page URL: ${url}`);
          } catch {
            // Fallback: just get the query string part
            const queryMatch = match[1].match(/(\?.*)/);
            url = queryMatch ? `/products.json${queryMatch[1]}` : '';
          }
        } else {
          url = '';
        }
      } else {
        url = '';
      }
    }

    console.log(`✅ [Sync] Completed: ${synced} products synced across ${pageCount} page(s), ${errors.length} errors`);
    return { synced, errors };
  } catch (error: any) {
    console.error('Error syncing products from Shopify:', error.response?.data || error.message);
    errors.push(error.message || 'Unknown error');
    return { synced, errors };
  }
};

/**
 * Fetch inventory levels for variants using the Inventory Levels API
 * Required for Shopify API 2023-10+ where inventory_quantity is deprecated
 */
const fetchInventoryLevels = async (
  client: AxiosInstance,
  variants: any[]
): Promise<Map<string, number>> => {
  const inventoryMap = new Map<string, number>();

  try {
    // Get all inventory_item_ids from variants
    const inventoryItemIds = variants
      .map((v: any) => v.inventory_item_id)
      .filter((id: any) => id != null);

    if (inventoryItemIds.length === 0) {
      return inventoryMap;
    }

    // Fetch inventory levels (API allows up to 50 IDs per request)
    const batchSize = 50;
    for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
      const batch = inventoryItemIds.slice(i, i + batchSize);
      const idsParam = batch.join(',');

      const response = await client.get(`/inventory_levels.json?inventory_item_ids=${idsParam}`);
      const levels = response.data?.inventory_levels || [];

      // Sum up quantities across all locations for each inventory item
      for (const level of levels) {
        const itemId = level.inventory_item_id?.toString();
        if (itemId) {
          const currentQty = inventoryMap.get(itemId) || 0;
          inventoryMap.set(itemId, currentQty + (level.available || 0));
        }
      }
    }

    console.log(`📦 Fetched inventory levels for ${inventoryItemIds.length} items`);
  } catch (error: any) {
    console.error('Error fetching inventory levels:', error.response?.data || error.message);
  }

  return inventoryMap;
};

/**
 * Sync single product with enhanced mobile features
 */
export const syncProduct = async (productId: string, shopifyProduct?: IShopifyProduct): Promise<void> => {
  const client = await getShopifyClient();

  try {
    // Fetch product from Shopify if not provided
    if (!shopifyProduct && client) {
      const response = await client.get(`/products/${productId}.json`);
      shopifyProduct = response.data?.product;
    }

    if (!shopifyProduct) {
      throw new Error(`Product ${productId} not found`);
    }

    // Fetch accurate inventory levels using Inventory Levels API
    let inventoryLevels = new Map<string, number>();
    if (client && shopifyProduct.variants?.length > 0) {
      inventoryLevels = await fetchInventoryLevels(client, shopifyProduct.variants);
    }

    // Check if product already exists in our database
    let existingProduct = await Product.findOne({ shopifyProductId: productId });

    const productData: any = {
      shopifyProductId: productId,
      title: shopifyProduct.title,
      description: shopifyProduct.body_html || '',
      handle: shopifyProduct.handle,
      vendor: shopifyProduct.vendor || 'Unknown',
      productType: shopifyProduct.product_type || 'General',
      tags: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((tag: string) => tag.trim()) : [],
      status: shopifyProduct.status === 'active' ? 'active' as const : 'draft' as const,
      
      // Images
      images: shopifyProduct.images?.map((img: any) => ({
        url: img.src,
        alt: img.alt || shopifyProduct.title,
        position: img.position || 1,
        width: img.width,
        height: img.height
      })) || [],
      
      // Variants and pricing - using Inventory Levels API for accurate quantities
      variants: shopifyProduct.variants?.map((variant: any) => {
        const inventoryItemId = variant.inventory_item_id?.toString();
        // Get quantity from Inventory Levels API (accurate) or fallback to deprecated field
        const quantity = inventoryItemId && inventoryLevels.has(inventoryItemId)
          ? inventoryLevels.get(inventoryItemId)!
          : (variant.inventory_quantity || 0);

        return {
          id: variant.id.toString(),
          inventoryItemId,
          title: variant.title,
          price: parseFloat(variant.price),
          compareAtPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : undefined,
          sku: variant.sku,
          inventory: {
            quantity,
            policy: variant.inventory_policy,
            tracked: variant.inventory_management === 'shopify'
          },
          weight: variant.weight,
          weightUnit: variant.weight_unit || 'kg',
          options: {
            option1: variant.option1,
            option2: variant.option2,
            option3: variant.option3
          }
        };
      }) || [],
      
      // Set price from first variant
      price: shopifyProduct.variants?.[0] ? parseFloat(shopifyProduct.variants[0].price) : 0,
      compareAtPrice: shopifyProduct.variants?.[0]?.compare_at_price ? 
        parseFloat(shopifyProduct.variants[0].compare_at_price) : undefined,
      
      // SEO
      seo: {
        title: (shopifyProduct.title || '').substring(0, 60),
        slug: shopifyProduct.handle || shopifyProduct.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `product-${productId}`,
        description: shopifyProduct.body_html ?
          shopifyProduct.body_html.replace(/<[^>]*>/g, '').substring(0, 160) : '',
        keywords: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((tag: string) => tag.trim()) : []
      },
      
      // Inventory tracking - using accurate quantities from Inventory Levels API
      inventoryTracking: {
        totalQuantity: shopifyProduct.variants?.reduce((total: number, variant: any) => {
          const inventoryItemId = variant.inventory_item_id?.toString();
          const qty = inventoryItemId && inventoryLevels.has(inventoryItemId)
            ? inventoryLevels.get(inventoryItemId)!
            : (variant.inventory_quantity || 0);
          return total + qty;
        }, 0) || 0,
        tracked: shopifyProduct.variants?.some((variant: any) =>
          variant.inventory_management === 'shopify') || false,
        lowStockThreshold: 5,
        history: []
      },
      
      // Mobile display enhancements
      mobileDisplay: existingProduct?.mobileDisplay || {
        thumbnailUrl: shopifyProduct.images?.[0]?.src || '',
        priority: 1,
        isFeatured: false,
        shortDescription: shopifyProduct.body_html ? 
          shopifyProduct.body_html.replace(/<[^>]*>/g, '').substring(0, 100) + '...' : ''
      },
      
      // Analytics (preserve existing or initialize)
      analytics: existingProduct?.analytics || {
        viewCount: 0,
        favoriteCount: 0,
        conversionRate: 0,
        averageTimeOnPage: 0,
        conversionEvents: [],
        lastViewedAt: new Date()
      }
    };

    if (existingProduct) {
      // Update existing product
      Object.assign(existingProduct, productData);
      await existingProduct.save();
      console.log(`📦 Updated product: ${shopifyProduct.title}`);
    } else {
      // Create new product
      const newProduct = new Product(productData);
      await newProduct.save();
      console.log(`🆕 Created product: ${shopifyProduct.title}`);
    }

  } catch (error) {
    console.error(`Error syncing product ${productId}:`, error);
    throw error;
  }
};

/**
 * Import Shopify customers and merge with our User model
 */
export const syncCustomers = async (): Promise<SyncResult> => {
  const client = await getShopifyClient();
  const errors: string[] = [];
  let synced = 0;
  const limit = 50;

  if (!client) {
    console.log('❌ No Shopify client available - store not connected');
    return { synced: 0, errors: ['No Shopify store connected'] };
  }

  try {
    let url = `/customers.json?limit=${limit}`;

    while (url) {
      const response = await client.get(url);
      const customers = response.data?.customers || [];

      if (customers.length === 0) {
        break;
      }

      for (const shopifyCustomer of customers) {
        try {
          // Check if customer already exists
          let existingUser = await User.findOne({ email: shopifyCustomer.email });

          const customerData = {
            shopifyCustomerId: shopifyCustomer.id.toString(),
            name: `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim() || 'Shopify Customer',
            email: shopifyCustomer.email,
            phone: shopifyCustomer.phone,
            isVerified: shopifyCustomer.verified_email || false,

            // Addresses - provide default province if missing
            addresses: shopifyCustomer.addresses?.map((addr: any) => ({
              type: addr.default ? 'shipping' : 'billing',
              firstName: addr.first_name || '',
              lastName: addr.last_name || '',
              company: addr.company,
              address1: addr.address1 || '',
              address2: addr.address2,
              city: addr.city || '',
              province: addr.province || addr.province_code || 'N/A',
              country: addr.country || addr.country_code || '',
              zip: addr.zip || '',
              phone: addr.phone,
              isDefault: addr.default || false
            })) || [],

            // Preserve existing preferences or set defaults
            preferences: existingUser?.preferences || {
              notifications: { email: true, push: true, sms: false },
              currency: DEFAULT_STORE_CURRENCY,
              language: 'en',
              wishlistItemsCount: 0
            }
          };

          if (existingUser) {
            // Update existing user with Shopify data
            Object.assign(existingUser, customerData);
            await existingUser.save();
          } else {
            // Create new user with random password (they'll need to reset it)
            const randomPassword = crypto.randomBytes(16).toString('hex');
            const newUser = new User({
              ...customerData,
              password: randomPassword,
              role: 'customer',
              isActive: true,
              importedFromShopify: true
            });
            await newUser.save();
          }
          
          synced++;
        } catch (error) {
          const errorMsg = `Failed to sync customer ${shopifyCustomer.id}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Check for next page using Link header
      const linkHeader = response.headers?.link || response.headers?.Link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = match ? match[1].replace(/^https:\/\/[^\/]+/, '') : '';
      } else {
        url = '';
      }
    }

    console.log(`👥 Synced ${synced} customers from Shopify`);
    return { synced, errors };
  } catch (error: any) {
    console.error('Error syncing customers from Shopify:', error.response?.data || error.message);
    errors.push(error.message || 'Unknown error');
    return { synced, errors };
  }
};

/**
 * Import recent orders and enhance with our tracking system
 */
export const syncOrders = async (daysBack: number = 30): Promise<SyncResult> => {
  const client = await getShopifyClient();
  const errors: string[] = [];
  let synced = 0;

  if (!client) {
    console.log('❌ No Shopify client available - store not connected');
    return { synced: 0, errors: ['No Shopify store connected'] };
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const limit = 50;

  try {
    let url = `/orders.json?status=any&created_at_min=${startDate.toISOString()}&limit=${limit}`;

    while (url) {
      const response = await client.get(url);
      const orders = response.data?.orders || [];

      if (orders.length === 0) {
        break;
      }

      for (const shopifyOrder of orders) {
        try {
          // Check if order already exists
          let existingOrder = await Order.findOne({ shopifyOrderId: shopifyOrder.id.toString() });

          if (!existingOrder) {
            // Find user by email
            const user = await User.findOne({ email: shopifyOrder.email });

            if (!user) {
              console.warn(`User not found for order ${shopifyOrder.order_number}, skipping...`);
              continue;
            }

            // Create new order with enhanced tracking
            const orderData = {
              shopifyOrderId: shopifyOrder.id.toString(),
              shopifyOrderNumber: shopifyOrder.order_number.toString(),
              orderNumber: shopifyOrder.name || shopifyOrder.order_number.toString(),
              user: user._id,
              email: shopifyOrder.email,

              lineItems: shopifyOrder.line_items?.map((item: any) => ({
                productId: item.product_id?.toString(),
                variantId: item.variant_id?.toString(),
                quantity: item.quantity,
                price: parseFloat(item.price),
                title: item.title,
                sku: item.sku
              })) || [],

              subtotalPrice: parseFloat(shopifyOrder.subtotal_price),
              totalTax: parseFloat(shopifyOrder.total_tax),
              totalPrice: parseFloat(shopifyOrder.total_price),
              currency: shopifyOrder.currency,

              billingAddress: mapShopifyAddress(shopifyOrder.billing_address),
              shippingAddress: mapShopifyAddress(shopifyOrder.shipping_address),

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

              // Enhanced mobile status
              mobileStatus: {
                current: mapToMobileStatus(shopifyOrder.fulfillment_status),
                history: [{
                  status: 'placed',
                  timestamp: new Date(shopifyOrder.created_at),
                  note: 'Order placed in Shopify'
                }],
                estimatedDelivery: shopifyOrder.shipping_lines?.[0]?.delivery_date ?
                  new Date(shopifyOrder.shipping_lines[0].delivery_date) : undefined
              },

              placedAt: new Date(shopifyOrder.created_at),
              processedAt: shopifyOrder.processed_at ? new Date(shopifyOrder.processed_at) : undefined,

              source: 'web',
              channel: 'website'
            };

            const newOrder = new Order(orderData);
            await newOrder.save();
            synced++;
          }
        } catch (error) {
          const errorMsg = `Failed to sync order ${shopifyOrder.id}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Check for next page using Link header
      const linkHeader = response.headers?.link || response.headers?.Link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = match ? match[1].replace(/^https:\/\/[^\/]+/, '') : '';
      } else {
        url = '';
      }
    }

    console.log(`📋 Synced ${synced} orders from Shopify`);
    return { synced, errors };
  } catch (error: any) {
    console.error('Error syncing orders from Shopify:', error.response?.data || error.message);
    errors.push(error.message || 'Unknown error');
    return { synced, errors };
  }
};

/**
 * Get real-time inventory levels for a product
 */
export const getInventoryLevels = async (productId: string): Promise<InventoryLevelsResponse> => {
  const client = await getShopifyClient();

  if (!client) {
    throw new Error('No Shopify store connected');
  }

  try {
    const response = await client.get(`/products/${productId}.json`);
    const product = response.data?.product;

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    const inventoryLevels = product.variants?.map((variant: any) => ({
      variantId: variant.id.toString(),
      quantity: variant.inventory_quantity || 0,
      policy: variant.inventory_policy,
      tracked: variant.inventory_management === 'shopify'
    })) || [];

    return {
      productId,
      totalQuantity: inventoryLevels.reduce((total: number, level: any) => total + level.quantity, 0),
      variants: inventoryLevels
    };
  } catch (error: any) {
    console.error(`Error getting inventory levels for product ${productId}:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * Update Shopify inventory for a variant using Inventory Levels API
 * Uses inventory_item_id and location_id for accurate inventory updates
 */
export const updateInventory = async (inventoryItemId: string, quantity: number, locationId?: string): Promise<void> => {
  const client = await getShopifyClient();

  if (!client) {
    throw new Error('No Shopify store connected');
  }

  try {
    // If no location provided, get the first/primary location
    let targetLocationId = locationId;
    if (!targetLocationId) {
      const locationsResponse = await client.get('/locations.json');
      const locations = locationsResponse.data?.locations || [];
      if (locations.length === 0) {
        throw new Error('No locations found in Shopify store');
      }
      targetLocationId = locations[0].id.toString();
    }

    // Use set endpoint to update inventory level
    await client.post('/inventory_levels/set.json', {
      inventory_item_id: inventoryItemId,
      location_id: targetLocationId,
      available: quantity
    });

    console.log(`📦 Updated inventory for item ${inventoryItemId} at location ${targetLocationId}: ${quantity}`);
  } catch (error: any) {
    console.error(`Error updating inventory for item ${inventoryItemId}:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * Create order in Shopify from mobile app
 */
export const createOrder = async (orderData: {
  email: string;
  lineItems: IOrderLineItem[];
  shippingAddress: IAddress;
  billingAddress: IAddress;
  specialInstructions?: string;
}): Promise<any> => {
  const client = await getShopifyClient();

  if (!client) {
    throw new Error('No Shopify store connected');
  }

  try {
    const shopifyOrderData = {
      order: {
        email: orderData.email,
        financial_status: 'pending',
        line_items: orderData.lineItems.map((item: any) => ({
          variant_id: item.variantId,
          quantity: item.quantity
        })),
        shipping_address: {
          first_name: orderData.shippingAddress.firstName,
          last_name: orderData.shippingAddress.lastName,
          address1: orderData.shippingAddress.address1,
          address2: orderData.shippingAddress.address2,
          city: orderData.shippingAddress.city,
          province: orderData.shippingAddress.province,
          country: orderData.shippingAddress.country,
          zip: orderData.shippingAddress.zip,
          phone: orderData.shippingAddress.phone
        },
        billing_address: {
          first_name: orderData.billingAddress.firstName,
          last_name: orderData.billingAddress.lastName,
          address1: orderData.billingAddress.address1,
          address2: orderData.billingAddress.address2,
          city: orderData.billingAddress.city,
          province: orderData.billingAddress.province,
          country: orderData.billingAddress.country,
          zip: orderData.billingAddress.zip,
          phone: orderData.billingAddress.phone
        },
        note: orderData.specialInstructions,
        tags: 'mobile-app'
      }
    };

    const response = await client.post('/orders.json', shopifyOrderData);
    return response.data?.order;
  } catch (error: any) {
    console.error('Error creating order in Shopify:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Update order status and sync
 */
export const updateOrderStatus = async (shopifyOrderId: string, status: string): Promise<void> => {
  const client = await getShopifyClient();

  if (!client) {
    throw new Error('No Shopify store connected');
  }

  try {
    await client.put(`/orders/${shopifyOrderId}.json`, {
      order: {
        id: shopifyOrderId,
        fulfillment_status: status
      }
    });

    console.log(`📋 Updated order ${shopifyOrderId} status to: ${status}`);
  } catch (error: any) {
    console.error(`Error updating order status for ${shopifyOrderId}:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * Generate and verify webhook signature for Shopify webhooks
 */
export const getShopifyWebhookSignature = (body: string, secret: string): string => {
  return crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
};

/**
 * Verify webhook signature
 */
export const verifyWebhookSignature = (body: string, signature: string, secret: string): boolean => {
  const expectedSignature = getShopifyWebhookSignature(body, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

// Helper functions for mapping Shopify data to our models

function mapShopifyAddress(shopifyAddress: any, type: 'billing' | 'shipping' = 'shipping'): IAddress | null {
  if (!shopifyAddress) return null;
  
  return {
    type,
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
}

function mapShopifyFinancialStatus(status: string): string {
  const statusMap: { [key: string]: string } = {
    'pending': 'pending',
    'authorized': 'authorized',
    'partially_paid': 'partially_paid',
    'paid': 'paid',
    'partially_refunded': 'partially_refunded',
    'refunded': 'refunded',
    'voided': 'voided'
  };
  
  return statusMap[status] || 'pending';
}

function mapShopifyFulfillmentStatus(status: string): string {
  const statusMap: { [key: string]: string } = {
    'fulfilled': 'fulfilled',
    'partial': 'partial',
    'restocked': 'restocked'
  };
  
  return statusMap[status] || 'unfulfilled';
}

function mapToMobileStatus(fulfillmentStatus: string): string {
  const statusMap: { [key: string]: string } = {
    'fulfilled': 'delivered',
    'partial': 'shipped',
    'restocked': 'returned'
  };
  
  return statusMap[fulfillmentStatus] || 'confirmed';
}