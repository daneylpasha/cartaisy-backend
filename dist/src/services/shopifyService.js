"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebhookSignature = exports.getShopifyWebhookSignature = exports.updateOrderStatus = exports.createOrder = exports.updateInventory = exports.getInventoryLevels = exports.syncOrders = exports.syncCustomers = exports.syncProduct = exports.syncProducts = exports.testShopifyConnection = exports.getShopifyClient = void 0;
const shopify_api_1 = __importDefault(require("@shopify/shopify-api"));
const tenant_1 = require("../config/tenant");
const Product_1 = __importDefault(require("../models/Product"));
const User_1 = __importDefault(require("../models/User"));
const Order_1 = __importDefault(require("../models/Order"));
const crypto_1 = __importDefault(require("crypto"));
// Shopify API client configuration
let shopifyClient = null;
/**
 * Initialize Shopify Admin API client using tenant configuration
 */
const getShopifyClient = () => {
    if (!shopifyClient) {
        const { storeUrl, accessToken, apiVersion } = tenant_1.tenantConfig.shopify;
        if (!storeUrl || !accessToken) {
            throw new Error('Shopify credentials not configured');
        }
        // Remove protocol and trailing slash from store URL
        const shopName = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        shopifyClient = new shopify_api_1.default.Clients.Rest({
            session: {
                shop: shopName,
                accessToken: accessToken
            }
        });
    }
    return shopifyClient;
};
exports.getShopifyClient = getShopifyClient;
/**
 * Test Shopify API connectivity
 */
const testShopifyConnection = async () => {
    try {
        const client = (0, exports.getShopifyClient)();
        const response = await client.get({
            path: 'shop'
        });
        return response.status === 200;
    }
    catch (error) {
        console.error('Shopify connection test failed:', error);
        return false;
    }
};
exports.testShopifyConnection = testShopifyConnection;
/**
 * Fetch all products from Shopify and sync with our Product model
 */
const syncProducts = async () => {
    const client = (0, exports.getShopifyClient)();
    const errors = [];
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
            });
            const products = response.body.products;
            if (!products || products.length === 0) {
                break;
            }
            for (const shopifyProduct of products) {
                try {
                    await (0, exports.syncProduct)(shopifyProduct.id.toString(), shopifyProduct);
                    synced++;
                }
                catch (error) {
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
    }
    catch (error) {
        console.error('Error syncing products from Shopify:', error);
        throw error;
    }
};
exports.syncProducts = syncProducts;
/**
 * Sync single product with enhanced mobile features
 */
const syncProduct = async (productId, shopifyProduct) => {
    const client = (0, exports.getShopifyClient)();
    try {
        // Fetch product from Shopify if not provided
        if (!shopifyProduct) {
            const response = await client.get({
                path: `products/${productId}`
            });
            shopifyProduct = response.body.product;
        }
        // Check if product already exists in our database
        let existingProduct = await Product_1.default.findOne({ shopifyProductId: productId });
        const productData = {
            shopifyProductId: productId,
            title: shopifyProduct.title,
            description: shopifyProduct.body_html || '',
            handle: shopifyProduct.handle,
            vendor: shopifyProduct.vendor || 'Unknown',
            productType: shopifyProduct.product_type || 'General',
            tags: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((tag) => tag.trim()) : [],
            status: shopifyProduct.status === 'active' ? 'active' : 'draft',
            // Images
            images: shopifyProduct.images?.map((img) => ({
                url: img.src,
                alt: img.alt || shopifyProduct.title,
                position: img.position || 1,
                width: img.width,
                height: img.height
            })) || [],
            // Variants and pricing
            variants: shopifyProduct.variants?.map((variant) => ({
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
                keywords: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((tag) => tag.trim()) : []
            },
            // Inventory tracking
            inventoryTracking: {
                totalQuantity: shopifyProduct.variants?.reduce((total, variant) => total + (variant.inventory_quantity || 0), 0) || 0,
                tracked: shopifyProduct.variants?.some((variant) => variant.inventory_management === 'shopify') || false,
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
        }
        else {
            // Create new product
            const newProduct = new Product_1.default(productData);
            await newProduct.save();
            console.log(`🆕 Created product: ${shopifyProduct.title}`);
        }
    }
    catch (error) {
        console.error(`Error syncing product ${productId}:`, error);
        throw error;
    }
};
exports.syncProduct = syncProduct;
/**
 * Import Shopify customers and merge with our User model
 */
const syncCustomers = async () => {
    const client = (0, exports.getShopifyClient)();
    const errors = [];
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
            });
            const customers = response.body.customers;
            if (!customers || customers.length === 0) {
                break;
            }
            for (const shopifyCustomer of customers) {
                try {
                    // Check if customer already exists
                    let existingUser = await User_1.default.findOne({ email: shopifyCustomer.email });
                    const customerData = {
                        shopifyCustomerId: shopifyCustomer.id.toString(),
                        name: `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim(),
                        email: shopifyCustomer.email,
                        phone: shopifyCustomer.phone,
                        isVerified: shopifyCustomer.verified_email || false,
                        // Addresses
                        addresses: shopifyCustomer.addresses?.map((addr) => ({
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
                    }
                    else {
                        // Create new user (without password - they'll need to set one)
                        const newUser = new User_1.default({
                            ...customerData,
                            role: 'customer',
                            isActive: true
                        });
                        await newUser.save();
                    }
                    synced++;
                }
                catch (error) {
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
    }
    catch (error) {
        console.error('Error syncing customers from Shopify:', error);
        throw error;
    }
};
exports.syncCustomers = syncCustomers;
/**
 * Import recent orders and enhance with our tracking system
 */
const syncOrders = async (daysBack = 30) => {
    const client = (0, exports.getShopifyClient)();
    const errors = [];
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
        });
        const orders = response.body.orders;
        for (const shopifyOrder of orders) {
            try {
                // Check if order already exists
                let existingOrder = await Order_1.default.findOne({ shopifyOrderId: shopifyOrder.id.toString() });
                if (!existingOrder) {
                    // Find user by email
                    const user = await User_1.default.findOne({ email: shopifyOrder.email });
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
                        lineItems: shopifyOrder.line_items?.map((item) => ({
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
                    const newOrder = new Order_1.default(orderData);
                    await newOrder.save();
                    synced++;
                }
            }
            catch (error) {
                const errorMsg = `Failed to sync order ${shopifyOrder.id}: ${error instanceof Error ? error.message : String(error)}`;
                console.error(errorMsg);
                errors.push(errorMsg);
            }
        }
        console.log(`📋 Synced ${synced} orders from Shopify`);
        return { synced, errors };
    }
    catch (error) {
        console.error('Error syncing orders from Shopify:', error);
        throw error;
    }
};
exports.syncOrders = syncOrders;
/**
 * Get real-time inventory levels for a product
 */
const getInventoryLevels = async (productId) => {
    const client = (0, exports.getShopifyClient)();
    try {
        const response = await client.get({
            path: `products/${productId}`
        });
        const product = response.body.product;
        const inventoryLevels = product.variants?.map((variant) => ({
            variantId: variant.id.toString(),
            quantity: variant.inventory_quantity || 0,
            policy: variant.inventory_policy,
            tracked: variant.inventory_management === 'shopify'
        })) || [];
        return {
            productId,
            totalQuantity: inventoryLevels.reduce((total, level) => total + level.quantity, 0),
            variants: inventoryLevels
        };
    }
    catch (error) {
        console.error(`Error getting inventory levels for product ${productId}:`, error);
        throw error;
    }
};
exports.getInventoryLevels = getInventoryLevels;
/**
 * Update Shopify inventory for a variant
 */
const updateInventory = async (variantId, quantity) => {
    const client = (0, exports.getShopifyClient)();
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
    }
    catch (error) {
        console.error(`Error updating inventory for variant ${variantId}:`, error);
        throw error;
    }
};
exports.updateInventory = updateInventory;
/**
 * Create order in Shopify from mobile app
 */
const createOrder = async (orderData) => {
    const client = (0, exports.getShopifyClient)();
    try {
        const shopifyOrderData = {
            order: {
                email: orderData.email,
                financial_status: 'pending',
                line_items: orderData.lineItems.map((item) => ({
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
        });
        return response.body.order;
    }
    catch (error) {
        console.error('Error creating order in Shopify:', error);
        throw error;
    }
};
exports.createOrder = createOrder;
/**
 * Update order status and sync
 */
const updateOrderStatus = async (shopifyOrderId, status) => {
    const client = (0, exports.getShopifyClient)();
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
    }
    catch (error) {
        console.error(`Error updating order status for ${shopifyOrderId}:`, error);
        throw error;
    }
};
exports.updateOrderStatus = updateOrderStatus;
/**
 * Generate and verify webhook signature for Shopify webhooks
 */
const getShopifyWebhookSignature = (body, secret) => {
    return crypto_1.default
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');
};
exports.getShopifyWebhookSignature = getShopifyWebhookSignature;
/**
 * Verify webhook signature
 */
const verifyWebhookSignature = (body, signature, secret) => {
    const expectedSignature = (0, exports.getShopifyWebhookSignature)(body, secret);
    return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};
exports.verifyWebhookSignature = verifyWebhookSignature;
// Helper functions for mapping Shopify data to our models
function mapShopifyAddress(shopifyAddress) {
    if (!shopifyAddress)
        return null;
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
}
function mapShopifyFinancialStatus(status) {
    const statusMap = {
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
function mapShopifyFulfillmentStatus(status) {
    const statusMap = {
        'fulfilled': 'fulfilled',
        'partial': 'partial',
        'restocked': 'restocked'
    };
    return statusMap[status] || 'unfulfilled';
}
function mapToMobileStatus(fulfillmentStatus) {
    const statusMap = {
        'fulfilled': 'delivered',
        'partial': 'shipped',
        'restocked': 'returned'
    };
    return statusMap[fulfillmentStatus] || 'confirmed';
}
//# sourceMappingURL=shopifyService.js.map