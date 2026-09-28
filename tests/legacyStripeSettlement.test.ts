import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import Customer from '../src/models/Customer';
import Order from '../src/models/Order';
import Product from '../src/models/Product';
import Store from '../src/models/Store';
import { createOrder as createLegacyOrder } from '../src/controllers/orderController';
import { createMobileOrder, processPayment } from '../src/services/orderService';
import stripeService from '../src/services/stripeService';
import customerRoutes from '../src/routes/customerRoutes';
import { ApiError } from '../src/utils/errors';
import { isShopifyStorefrontCartGid } from '../src/utils/legacySettlement';
import { generateToken } from '../src/utils/jwt';

jest.mock('../src/services/firebaseNotificationService', () => ({
  FirebaseNotificationService: {
    sendOrderNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/services/emailService', () => ({
  EmailService: {
    sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    sendOrderCancellation: jest.fn().mockResolvedValue(undefined),
  },
}));

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/customer', customerRoutes);
  return app;
};

const productFixture = (storeId: unknown) => ({
  storeId,
  shopifyProductId: `shopify-${Math.random().toString(36).slice(2)}`,
  title: 'Owned Product',
  description: 'Product used for settlement fail-closed tests',
  handle: `owned-product-${Math.random().toString(36).slice(2)}`,
  status: 'active',
  price: 25,
  vendor: 'Test Vendor',
  productType: 'Test Type',
  tags: ['owned'],
  images: [{ url: 'https://example.com/product.jpg', alt: 'Product', position: 1 }],
  mobileDisplay: {
    thumbnailUrl: 'https://example.com/product-thumb.jpg',
    shortDescription: 'Settlement test product',
    isFeatured: false,
    priority: 1,
  },
  seo: {
    title: 'Owned Product',
    slug: `owned-product-${Math.random().toString(36).slice(2)}`,
    keywords: ['owned'],
  },
  inventoryTracking: { totalQuantity: 5, tracked: true, lowStockThreshold: 1, history: [] },
  analytics: { viewCount: 0, favoriteCount: 0, conversionRate: 0, averageTimeOnPage: 0, engagementScore: 0 },
  reviews: { count: 0, averageRating: 0, totalRating: 0 },
  variants: [
    {
      id: `variant-${Math.random().toString(36).slice(2)}`,
      title: 'Default',
      price: 25,
      inventory: { quantity: 5, tracked: true, policy: 'deny' },
      options: { option1: 'Default' },
    },
  ],
});

describe('legacy Stripe settlement is fail-closed', () => {
  const originalSaasMode = process.env.SAAS_MODE;
  const originalMultiTenantMode = process.env.MULTI_TENANT_MODE;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalSaasMode === undefined) {
      delete process.env.SAAS_MODE;
    } else {
      process.env.SAAS_MODE = originalSaasMode;
    }
    if (originalMultiTenantMode === undefined) {
      delete process.env.MULTI_TENANT_MODE;
    } else {
      process.env.MULTI_TENANT_MODE = originalMultiTenantMode;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('Storefront cart GID', () => {
    test.each([
      'gid://shopify/Cart/c1-abc123',
      'gid://shopify/Cart/Z2NwLXVzLWVhc3QxOjAxSEs5?key=abc_def-123',
    ])('accepts %s', (cartId) => {
      expect(isShopifyStorefrontCartGid(cartId)).toBe(true);
    });

    test.each([
      new Types.ObjectId().toString(),
      'guest-session-1',
      'gid://shopify/Product/1',
      'gid://shopify/Cart/',
      'gid://shopify/Cart/token?foo=bar',
      'GID://SHOPIFY/cart/not-canonical',
    ])('rejects %s', (cartId) => {
      expect(isShopifyStorefrontCartGid(cartId)).toBe(false);
    });
  });

  describe('Stripe money movement', () => {
    test.each([
      ['SAAS_MODE', 'true'],
      ['MULTI_TENANT_MODE', 'on'],
    ])('payment intents and refunds fail closed when %s=%s', async (envVar, value) => {
      process.env[envVar] = value;

      await expect(
        stripeService.createPaymentIntent(1000, 'usd', 'cus_test', 'pm_test')
      ).rejects.toBeInstanceOf(ApiError);
      await expect(
        stripeService.createPlatformPayPaymentIntent(1000, 'usd', 'pm_test')
      ).rejects.toThrow('Native checkout is disabled');
      await expect(
        stripeService.confirmPaymentIntent('pi_test')
      ).rejects.toThrow('Native checkout is disabled');
      await expect(stripeService.createRefund('pi_test')).rejects.toThrow(
        'Native checkout is disabled'
      );
    });
  });

  describe('unused local settlement helpers', () => {
    test('createMobileOrder and processPayment fail closed in SaaS mode', async () => {
      process.env.SAAS_MODE = 'true';

      await expect(
        createMobileOrder('user-1', {
          items: [],
          billingAddress: {} as any,
          shippingAddress: {} as any,
          shippingMethod: 'Standard',
          paymentToken: 'tok_test',
        })
      ).rejects.toThrow('Native checkout is disabled');

      await expect(
        processPayment({
          amount: 10,
          currency: 'USD',
          paymentToken: 'tok_test',
          userId: 'user-1',
          email: 'shopper@example.com',
        })
      ).rejects.toThrow('Native checkout is disabled');
    });

    test('unrouted legacy createOrder fails closed in production', async () => {
      process.env.NODE_ENV = 'production';
      const json = jest.fn();
      const res = { status: jest.fn().mockReturnValue({ json }) } as any;

      await createLegacyOrder({} as any, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        success: false,
        message: 'Native checkout is disabled; use the Shopify-hosted checkout handoff',
      });
    });
  });

  describe('POST /customer/orders', () => {
    const app = buildTestApp();

    const placeOrder = async () => {
      const suffix = Math.random().toString(36).slice(2);
      const store = await Store.create({
        name: 'Store A',
        slug: `store-a-${suffix}`,
        shopify: { shop: `store-a-${suffix}.myshopify.com`, isConnected: true },
      });
      const product = await Product.create(productFixture(store._id));
      const customer = await Customer.create({
        storeId: store._id,
        email: `customer-${suffix}@example.com`,
        password: 'password123',
        isActive: true,
        isVerified: true,
        addresses: [
          {
            firstName: 'Test',
            lastName: 'Customer',
            address1: '123 Test St',
            city: 'Test City',
            province: 'CA',
            country: 'US',
            zip: '94105',
            isDefault: true,
          },
        ],
        wishlist: [],
        cart: { items: [], updatedAt: new Date() },
        preferences: {
          notifications: { email: true, push: true, sms: false, promotions: true, orderUpdates: true },
        },
        deviceTokens: [],
        notificationPreferences: {
          pushEnabled: true,
          orderUpdates: true,
          promotions: true,
          newProducts: true,
        },
        subscribedToTopics: [],
        orderCount: 0,
        totalSpent: 0,
      });

      const response = await request(app)
        .post('/customer/orders')
        .set('Authorization', `Bearer ${generateToken(customer._id.toString())}`)
        .send({
          lineItems: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddressId: 0,
          shipping: { method: 'Standard', cost: 0 },
        });

      return { response, product, storeId: store._id };
    };

    test('fails closed in SaaS mode without creating an order or changing inventory', async () => {
      process.env.SAAS_MODE = 'true';
      const { response, product, storeId } = await placeOrder();

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        status: 'error',
        message: 'Native checkout is disabled; use the Shopify-hosted checkout handoff',
      });
      expect(await Order.countDocuments({ storeId })).toBe(0);
      const reloaded = await Product.findById(product._id).lean();
      expect(reloaded?.inventoryTracking.totalQuantity).toBe(5);
    });

    test('does not fail closed outside SaaS/production', async () => {
      delete process.env.SAAS_MODE;
      delete process.env.MULTI_TENANT_MODE;
      const { response } = await placeOrder();

      // The settlement gate must stay off here. A later validation error is
      // the existing local-order path, not a 403 from this issue.
      expect(response.status).not.toBe(403);
      expect(response.body.message).not.toBe(
        'Native checkout is disabled; use the Shopify-hosted checkout handoff'
      );
    });
  });
});
