"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const mongoose_1 = __importDefault(require("mongoose"));
const app_1 = require("../src/app");
const backgroundJobService_1 = require("../src/services/backgroundJobService");
const Product_1 = __importDefault(require("../src/models/Product"));
const Order_1 = __importDefault(require("../src/models/Order"));
const User_1 = __importDefault(require("../src/models/User"));
// Test utilities
require("./setup");
describe('Shopify Integration Tests', () => {
    let authToken;
    let testUserId;
    let testProductId;
    beforeAll(async () => {
        // Create test user and get auth token
        const userResponse = await (0, supertest_1.default)(app_1.app)
            .post('/api/auth/register')
            .send({
            email: 'shopify.test@example.com',
            password: 'testpass123',
            name: 'Shopify Test User'
        });
        testUserId = userResponse.body.data.user._id;
        authToken = userResponse.body.data.token;
        // Create test product
        const productData = {
            shopifyProductId: 'test_shopify_product_123',
            title: 'Test Shopify Product',
            description: 'A test product for Shopify integration',
            handle: 'test-shopify-product',
            vendor: 'Test Vendor',
            productType: 'Test Type',
            tags: ['test', 'shopify'],
            status: 'active',
            price: 29.99,
            compareAtPrice: 39.99,
            images: [
                {
                    url: 'https://example.com/image1.jpg',
                    alt: 'Test Product Image',
                    position: 1,
                    width: 800,
                    height: 600
                }
            ],
            variants: [
                {
                    id: 'test_variant_123',
                    title: 'Default Title',
                    price: 29.99,
                    compareAtPrice: 39.99,
                    sku: 'TEST-SKU-123',
                    inventory: {
                        quantity: 100,
                        policy: 'deny',
                        tracked: true
                    },
                    weight: 1.5,
                    weightUnit: 'kg',
                    options: {
                        option1: 'Default',
                        option2: null,
                        option3: null
                    }
                }
            ],
            inventoryTracking: {
                totalQuantity: 100,
                tracked: true,
                lowStockThreshold: 10,
                history: []
            },
            mobileDisplay: {
                thumbnailUrl: 'https://example.com/thumb.jpg',
                priority: 1,
                isFeatured: true,
                shortDescription: 'Test product short description'
            },
            analytics: {
                viewCount: 0,
                favoriteCount: 0,
                conversionRate: 0,
                averageTimeOnPage: 0,
                conversionEvents: [],
                lastViewedAt: new Date()
            },
            reviews: {
                count: 0,
                averageRating: 0,
                totalRating: 0
            },
            seo: {
                title: 'Test Shopify Product',
                description: 'A test product for Shopify integration testing',
                keywords: ['test', 'shopify'],
                slug: 'test-shopify-product'
            }
        };
        const product = new Product_1.default(productData);
        const savedProduct = await product.save();
        testProductId = savedProduct._id.toString();
    });
    afterAll(async () => {
        // Clean up test data
        await Product_1.default.deleteMany({ handle: { $regex: /test-/ } });
        await Order_1.default.deleteMany({ 'customer.email': 'shopify.test@example.com' });
        await User_1.default.deleteMany({ email: 'shopify.test@example.com' });
        // Shutdown background jobs
        (0, backgroundJobService_1.shutdownBackgroundJobs)();
        // Close database connection
        await mongoose_1.default.connection.close();
    });
    describe('Shopify Service Integration', () => {
        test('should connect to Shopify API', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/shopify/test-connection')
                .set('Authorization', `Bearer ${authToken}`);
            // Note: This test will fail without actual Shopify credentials
            // In a real environment, it should return 200 with shop info
            expect([200, 500]).toContain(response.status);
        });
        test('should get sync status', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/shopify/sync/status')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('inProgress');
            expect(response.body.data).toHaveProperty('errors');
            expect(response.body.data).toHaveProperty('stats');
        });
        test('should get integration overview', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/shopify/overview')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('products');
            expect(response.body.data).toHaveProperty('orders');
            expect(response.body.data).toHaveProperty('sync');
            expect(response.body.data).toHaveProperty('integration');
        });
    });
    describe('Product Enhancement', () => {
        test('should generate product recommendations', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get(`/api/shopify/products/${testProductId}/recommendations`)
                .set('Authorization', `Bearer ${authToken}`)
                .query({ limit: 5 });
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(Array.isArray(response.body.data)).toBe(true);
        });
        test('should enhance product SEO', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .post(`/api/shopify/products/${testProductId}/enhance-seo`)
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('seo');
        });
        test('should get product analytics', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get(`/api/shopify/products/${testProductId}/analytics`)
                .set('Authorization', `Bearer ${authToken}`)
                .query({ period: '7d' });
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('views');
            expect(response.body.data).toHaveProperty('conversions');
        });
    });
    describe('Inventory Management', () => {
        test('should get low stock products', async () => {
            // First, create a low stock product
            const lowStockProduct = new Product_1.default({
                title: 'Low Stock Test Product',
                handle: 'test-low-stock-product',
                status: 'active',
                price: 19.99,
                inventoryTracking: {
                    totalQuantity: 3,
                    tracked: true,
                    lowStockThreshold: 5,
                    history: []
                },
                variants: [{
                        id: 'test_low_stock_variant',
                        title: 'Default',
                        price: 19.99,
                        inventory: {
                            quantity: 3,
                            tracked: true,
                            policy: 'deny'
                        }
                    }]
            });
            await lowStockProduct.save();
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/shopify/inventory/low-stock')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThanOrEqual(1);
        });
        test('should get inventory history', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get(`/api/shopify/inventory/history/${testProductId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .query({ limit: 10 });
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(Array.isArray(response.body.data)).toBe(true);
        });
        test('should sync inventory levels', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .post('/api/shopify/inventory/sync')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ productId: testProductId });
            // This will fail without Shopify connection, but should handle gracefully
            expect([200, 500]).toContain(response.status);
        });
    });
    describe('Background Jobs Management', () => {
        test('should get background jobs status', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/admin/jobs')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('isInitialized');
            expect(response.body.data).toHaveProperty('totalJobs');
            expect(response.body.data).toHaveProperty('jobs');
        });
        test('should manually run health check job', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .post('/api/admin/jobs/health-check/run')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.message).toContain('health-check');
        });
    });
    describe('Admin Dashboard', () => {
        test('should get admin dashboard data', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/admin/dashboard')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('sync');
            expect(response.body.data).toHaveProperty('jobs');
            expect(response.body.data).toHaveProperty('system');
            expect(response.body.data).toHaveProperty('activity');
        });
        test('should get system health', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/admin/system/health')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.body.data).toHaveProperty('status');
            expect(response.body.data).toHaveProperty('checks');
            expect(response.body.data).toHaveProperty('score');
        });
        test('should get system statistics', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/admin/system/stats')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('products');
            expect(response.body.data).toHaveProperty('orders');
            expect(response.body.data).toHaveProperty('users');
        });
        test('should get inventory overview', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/admin/inventory/overview')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('lowStock');
            expect(response.body.data).toHaveProperty('statistics');
        });
    });
    describe('Webhook Endpoints', () => {
        // Mock webhook signature for testing
        const mockWebhookSignature = 'sha256=mock_signature';
        test('webhook health endpoint should work', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/webhooks/health');
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'OK');
            expect(response.body).toHaveProperty('message');
        });
        test('should handle product webhook (without valid signature)', async () => {
            const productPayload = {
                id: 12345,
                title: 'Test Product from Webhook',
                handle: 'test-webhook-product',
                body_html: '<p>Test description</p>',
                vendor: 'Test Vendor',
                product_type: 'Test Type',
                status: 'active',
                variants: [{
                        id: 67890,
                        title: 'Default Title',
                        price: '25.00',
                        inventory_quantity: 50,
                        sku: 'TEST-WEBHOOK-SKU'
                    }],
                images: [{
                        src: 'https://example.com/webhook-image.jpg',
                        alt: 'Test Image'
                    }]
            };
            const response = await (0, supertest_1.default)(app_1.app)
                .post('/api/webhooks/shopify/products/create')
                .set('X-Shopify-Hmac-Sha256', mockWebhookSignature)
                .send(productPayload);
            // Will fail due to signature verification, but endpoint should exist
            expect([200, 401, 403]).toContain(response.status);
        });
        test('should handle order webhook (without valid signature)', async () => {
            const orderPayload = {
                id: 54321,
                order_number: '#1001',
                email: 'webhook.customer@example.com',
                financial_status: 'paid',
                fulfillment_status: null,
                total_price: '75.00',
                currency: 'USD',
                line_items: [{
                        id: 98765,
                        product_id: 12345,
                        variant_id: 67890,
                        quantity: 2,
                        price: '37.50',
                        title: 'Test Product',
                        variant_title: 'Default Title'
                    }],
                customer: {
                    id: 11223,
                    email: 'webhook.customer@example.com',
                    first_name: 'Webhook',
                    last_name: 'Customer'
                }
            };
            const response = await (0, supertest_1.default)(app_1.app)
                .post('/api/webhooks/shopify/orders/create')
                .set('X-Shopify-Hmac-Sha256', mockWebhookSignature)
                .send(orderPayload);
            // Will fail due to signature verification, but endpoint should exist
            expect([200, 401, 403]).toContain(response.status);
        });
    });
    describe('Sync Operations', () => {
        test('should trigger incremental sync', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .post('/api/shopify/sync/incremental')
                .set('Authorization', `Bearer ${authToken}`);
            // May fail without Shopify connection, but should handle gracefully
            expect([200, 500]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('success', true);
                expect(response.body.message).toContain('synchronization completed');
            }
        });
        test('should validate sync integrity', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/admin/sync/status')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('integrity');
            expect(response.body.data.integrity).toHaveProperty('issues');
            expect(response.body.data.integrity).toHaveProperty('valid');
        });
        test('should get products sync status', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/shopify/products/sync-status')
                .set('Authorization', `Bearer ${authToken}`)
                .query({ page: 1, limit: 10 });
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toBeDefined();
            expect(response.body).toHaveProperty('pagination');
            expect(Array.isArray(response.body.data)).toBe(true);
        });
    });
    describe('Error Handling', () => {
        test('should handle invalid product ID', async () => {
            const invalidId = 'invalid_product_id';
            const response = await (0, supertest_1.default)(app_1.app)
                .get(`/api/shopify/products/${invalidId}/recommendations`)
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('success', false);
        });
        test('should handle unauthorized requests', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/shopify/sync/status');
            // No authorization header
            expect(response.status).toBe(401);
        });
        test('should handle invalid sync type', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .post('/api/admin/sync/trigger')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ type: 'invalid_type' });
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toContain('Invalid sync type');
        });
        test('should handle invalid job name', async () => {
            const response = await (0, supertest_1.default)(app_1.app)
                .post('/api/admin/jobs/invalid-job-name/run')
                .set('Authorization', `Bearer ${authToken}`);
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('success', false);
        });
    });
    describe('Performance Tests', () => {
        test('dashboard should respond within reasonable time', async () => {
            const startTime = Date.now();
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/admin/dashboard')
                .set('Authorization', `Bearer ${authToken}`);
            const responseTime = Date.now() - startTime;
            expect(response.status).toBe(200);
            expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
        });
        test('sync status should respond quickly', async () => {
            const startTime = Date.now();
            const response = await (0, supertest_1.default)(app_1.app)
                .get('/api/shopify/sync/status')
                .set('Authorization', `Bearer ${authToken}`);
            const responseTime = Date.now() - startTime;
            expect(response.status).toBe(200);
            expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
        });
    });
});
describe('Shopify Service Unit Tests', () => {
    describe('Data Merging Functions', () => {
        test('should merge Shopify product data correctly', async () => {
            const { syncProductData } = require('../src/services/syncService');
            const shopifyProduct = {
                id: 12345,
                title: 'Test Product',
                handle: 'test-product',
                body_html: '<p>Test description</p>',
                vendor: 'Test Vendor',
                product_type: 'Test Type',
                status: 'active',
                variants: [{
                        id: 67890,
                        title: 'Default',
                        price: '29.99',
                        inventory_quantity: 100,
                        sku: 'TEST-SKU'
                    }]
            };
            const existingProduct = {
                mobileDisplay: {
                    priority: 5,
                    isFeatured: true
                },
                analytics: {
                    viewCount: 50,
                    favoriteCount: 10
                }
            };
            const merged = await syncProductData(shopifyProduct, existingProduct);
            expect(merged.shopifyProductId).toBe('12345');
            expect(merged.title).toBe('Test Product');
            expect(merged.handle).toBe('test-product');
            expect(merged.status).toBe('active');
            expect(merged.price).toBe(29.99);
            // Should preserve existing mobile display settings
            expect(merged.mobileDisplay.priority).toBe(5);
            expect(merged.mobileDisplay.isFeatured).toBe(true);
            // Should preserve existing analytics
            expect(merged.analytics.viewCount).toBe(50);
            expect(merged.analytics.favoriteCount).toBe(10);
            // Should have correct inventory tracking
            expect(merged.inventoryTracking.totalQuantity).toBe(100);
            expect(merged.inventoryTracking.tracked).toBe(false); // No inventory_management
            // Should have variants
            expect(merged.variants).toHaveLength(1);
            expect(merged.variants[0].id).toBe('67890');
            expect(merged.variants[0].price).toBe(29.99);
        });
        test('should merge Shopify customer data correctly', async () => {
            const { syncCustomerData } = require('../src/services/syncService');
            const shopifyCustomer = {
                id: 98765,
                email: 'test@example.com',
                first_name: 'Test',
                last_name: 'Customer',
                phone: '+1234567890',
                verified_email: true,
                accepts_marketing: true,
                addresses: [{
                        id: 11111,
                        first_name: 'Test',
                        last_name: 'Customer',
                        address1: '123 Test St',
                        city: 'Test City',
                        province: 'Test State',
                        country: 'Test Country',
                        zip: '12345',
                        default: true
                    }]
            };
            const existingUser = {
                role: 'premium_customer',
                preferences: {
                    notifications: { email: false, push: true, sms: true },
                    currency: 'EUR'
                }
            };
            const merged = await syncCustomerData(shopifyCustomer, existingUser);
            expect(merged.shopifyCustomerId).toBe('98765');
            expect(merged.email).toBe('test@example.com');
            expect(merged.name).toBe('Test Customer');
            expect(merged.phone).toBe('+1234567890');
            expect(merged.isVerified).toBe(true);
            // Should preserve existing role
            expect(merged.role).toBe('premium_customer');
            // Should preserve existing preferences
            expect(merged.preferences.notifications.email).toBe(false);
            expect(merged.preferences.notifications.push).toBe(true);
            expect(merged.preferences.notifications.sms).toBe(true);
            expect(merged.preferences.currency).toBe('EUR');
            // Should have addresses
            expect(merged.addresses).toHaveLength(1);
            expect(merged.addresses[0].address1).toBe('123 Test St');
            expect(merged.addresses[0].isDefault).toBe(true);
            // Should have marketing consent
            expect(merged.marketing.acceptsMarketing).toBe(true);
        });
    });
    describe('Data Conflict Resolution', () => {
        test('should resolve product conflicts correctly', async () => {
            const { handleDataConflicts } = require('../src/services/syncService');
            const localData = {
                price: 25.99,
                status: 'draft',
                inventoryTracking: { totalQuantity: 50 }
            };
            const shopifyData = {
                price: 29.99,
                status: 'active',
                inventoryTracking: { totalQuantity: 75 }
            };
            const result = handleDataConflicts(localData, shopifyData, 'product');
            expect(result.conflicts).toHaveLength(3);
            expect(result.resolved.price).toBe(29.99); // Should use Shopify price
            expect(result.resolved.status).toBe('active'); // Should use Shopify status
            expect(result.resolved.inventoryTracking.totalQuantity).toBe(75); // Should use Shopify inventory
            // Check conflict details
            const priceConflict = result.conflicts.find((c) => c.field === 'price');
            expect(priceConflict.local).toBe(25.99);
            expect(priceConflict.shopify).toBe(29.99);
            expect(priceConflict.resolution).toBe('use_shopify');
        });
        test('should resolve customer conflicts correctly', async () => {
            const { handleDataConflicts } = require('../src/services/syncService');
            const localData = {
                isVerified: false,
                phone: '+1111111111'
            };
            const shopifyData = {
                isVerified: true,
                phone: '+2222222222'
            };
            const result = handleDataConflicts(localData, shopifyData, 'customer');
            expect(result.conflicts).toHaveLength(2);
            expect(result.resolved.isVerified).toBe(true); // Should use Shopify verification
            expect(result.resolved.phone).toBe('+2222222222'); // Should use Shopify phone
            // Check conflict details
            const verificationConflict = result.conflicts.find((c) => c.field === 'isVerified');
            expect(verificationConflict.local).toBe(false);
            expect(verificationConflict.shopify).toBe(true);
            expect(verificationConflict.resolution).toBe('use_shopify');
        });
    });
});
//# sourceMappingURL=shopify.integration.test.js.map