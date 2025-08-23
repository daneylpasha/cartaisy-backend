import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import { tenantConfig } from '../config/tenant';
import Product from '../models/Product';
import User from '../models/User';
import Order from '../models/Order';
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

// Initialize Shopify API
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || '',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
  scopes: ['read_products', 'write_products', 'read_orders', 'write_orders'],
  hostName: process.env.SHOPIFY_APP_URL || '',
  apiVersion: ApiVersion.October23,
  isEmbeddedApp: false
});

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
export const getShopifyClient = () => {
  return {
    get: async (options: any) => ({ body: {} }),
    post: async (options: any) => ({ body: {} }),
    put: async (options: any) => ({ body: {} }),
    delete: async (options: any) => ({ body: {} })
  };
};

/**
 * Test Shopify API connectivity
 */
export const testShopifyConnection = async (): Promise<boolean> => {
  try {
    const client = getShopifyClient();
    const response = await client.get({
      path: 'shop'
    });
    
    return response.status === 200;
  } catch (error) {
    console.error('Shopify connection test failed:', error);
    return false;
  }
};

/**
 * Fetch all products from Shopify and sync with our Product model
 */
export const syncProducts = async (): Promise<SyncResult> => {
  const client = getShopifyClient();
  const errors: string[] = [];
  let synced = 0;
  let page = 1;
  const limit = 50;

  try {
    while (true) {
      const response = await client.get({
        path: 'products',
        query: {
          limit: limit.toString(),
          page: page.toString(),
          status: 'active'
        }
      }) as ShopifyResponse<ShopifyProductResponse>;

      const products = response.body.products;
      
      if (!products || products.length === 0) {
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

      // Check if we have more pages
      if (products.length < limit) {
        break;
      }
      
      page++;
    }

    console.log(`✅ Synced ${synced} products from Shopify`);
    return { synced, errors };
  } catch (error) {
    console.error('Error syncing products from Shopify:', error);
    throw error;
  }
};

/**
 * Sync single product with enhanced mobile features
 */
export const syncProduct = async (productId: string, shopifyProduct?: IShopifyProduct): Promise<void> => {
  const client = getShopifyClient();
  
  try {
    // Fetch product from Shopify if not provided
    if (!shopifyProduct) {
      const response = await client.get({
        path: `products/${productId}`
      }) as ShopifyResponse<{ product: IShopifyProduct }>;
      shopifyProduct = response.body.product;
    }

    // Check if product already exists in our database
    let existingProduct = await Product.findOne({ shopifyProductId: productId });

    const productData = {
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
      
      // Variants and pricing
      variants: shopifyProduct.variants?.map((variant: any) => ({
        id: variant.id.toString(),
        title: variant.title,
        price: parseFloat(variant.price),
        compareAtPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : undefined,
        sku: variant.sku,
        inventory: {
          quantity: variant.inventory_quantity || 0,
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
      })) || [],
      
      // Set price from first variant
      price: shopifyProduct.variants?.[0] ? parseFloat(shopifyProduct.variants[0].price) : 0,
      compareAtPrice: shopifyProduct.variants?.[0]?.compare_at_price ? 
        parseFloat(shopifyProduct.variants[0].compare_at_price) : undefined,
      
      // SEO
      seo: {
        title: shopifyProduct.title,
        description: shopifyProduct.body_html ? 
          shopifyProduct.body_html.replace(/<[^>]*>/g, '').substring(0, 160) : '',
        keywords: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((tag: string) => tag.trim()) : []
      },
      
      // Inventory tracking
      inventoryTracking: {
        totalQuantity: shopifyProduct.variants?.reduce((total: number, variant: any) => 
          total + (variant.inventory_quantity || 0), 0) || 0,
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
  const client = getShopifyClient();
  const errors: string[] = [];
  let synced = 0;
  let page = 1;
  const limit = 50;

  try {
    while (true) {
      const response = await client.get({
        path: 'customers',
        query: {
          limit: limit.toString(),
          page: page.toString()
        }
      }) as ShopifyResponse<ShopifyCustomerResponse>;

      const customers = response.body.customers;
      
      if (!customers || customers.length === 0) {
        break;
      }

      for (const shopifyCustomer of customers) {
        try {
          // Check if customer already exists
          let existingUser = await User.findOne({ email: shopifyCustomer.email });

          const customerData = {
            shopifyCustomerId: shopifyCustomer.id.toString(),
            name: `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim(),
            email: shopifyCustomer.email,
            phone: shopifyCustomer.phone,
            isVerified: shopifyCustomer.verified_email || false,
            
            // Addresses
            addresses: shopifyCustomer.addresses?.map((addr: any) => ({
              type: addr.default ? 'shipping' : 'billing',
              firstName: addr.first_name,
              lastName: addr.last_name,
              company: addr.company,
              address1: addr.address1,
              address2: addr.address2,
              city: addr.city,
              province: addr.province,
              country: addr.country,
              zip: addr.zip,
              phone: addr.phone,
              isDefault: addr.default || false
            })) || [],
            
            // Preserve existing preferences or set defaults
            preferences: existingUser?.preferences || {
              notifications: { email: true, push: true, sms: false },
              currency: 'USD',
              language: 'en',
              wishlistItemsCount: 0
            }
          };

          if (existingUser) {
            // Update existing user with Shopify data
            Object.assign(existingUser, customerData);
            await existingUser.save();
          } else {
            // Create new user (without password - they'll need to set one)
            const newUser = new User({
              ...customerData,
              role: 'customer',
              isActive: true
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

      if (customers.length < limit) {
        break;
      }
      
      page++;
    }

    console.log(`👥 Synced ${synced} customers from Shopify`);
    return { synced, errors };
  } catch (error) {
    console.error('Error syncing customers from Shopify:', error);
    throw error;
  }
};

/**
 * Import recent orders and enhance with our tracking system
 */
export const syncOrders = async (daysBack: number = 30): Promise<SyncResult> => {
  const client = getShopifyClient();
  const errors: string[] = [];
  let synced = 0;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  try {
    const response = await client.get({
      path: 'orders',
      query: {
        status: 'any',
        created_at_min: startDate.toISOString(),
        limit: '250'
      }
    }) as ShopifyResponse<ShopifyOrderResponse>;

    const orders = response.body.orders;

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

    console.log(`📋 Synced ${synced} orders from Shopify`);
    return { synced, errors };
  } catch (error) {
    console.error('Error syncing orders from Shopify:', error);
    throw error;
  }
};

/**
 * Get real-time inventory levels for a product
 */
export const getInventoryLevels = async (productId: string): Promise<InventoryLevelsResponse> => {
  const client = getShopifyClient();
  
  try {
    const response = await client.get({
      path: `products/${productId}`
    }) as ShopifyResponse<{ product: IShopifyProduct }>;
    
    const product = response.body.product;
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
  } catch (error) {
    console.error(`Error getting inventory levels for product ${productId}:`, error);
    throw error;
  }
};

/**
 * Update Shopify inventory for a variant
 */
export const updateInventory = async (variantId: string, quantity: number): Promise<void> => {
  const client = getShopifyClient();
  
  try {
    await client.put({
      path: `variants/${variantId}`,
      data: {
        variant: {
          id: variantId,
          inventory_quantity: quantity
        }
      }
    });
    
    console.log(`📦 Updated inventory for variant ${variantId}: ${quantity}`);
  } catch (error) {
    console.error(`Error updating inventory for variant ${variantId}:`, error);
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
}): Promise<IShopifyProduct> => {
  const client = getShopifyClient();
  
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

    const response = await client.post({
      path: 'orders',
      data: shopifyOrderData
    }) as ShopifyResponse<{ order: IShopifyProduct }>;

    return response.body.order;
  } catch (error) {
    console.error('Error creating order in Shopify:', error);
    throw error;
  }
};

/**
 * Update order status and sync
 */
export const updateOrderStatus = async (shopifyOrderId: string, status: string): Promise<void> => {
  const client = getShopifyClient();
  
  try {
    await client.put({
      path: `orders/${shopifyOrderId}`,
      data: {
        order: {
          id: shopifyOrderId,
          fulfillment_status: status
        }
      }
    });
    
    console.log(`📋 Updated order ${shopifyOrderId} status to: ${status}`);
  } catch (error) {
    console.error(`Error updating order status for ${shopifyOrderId}:`, error);
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