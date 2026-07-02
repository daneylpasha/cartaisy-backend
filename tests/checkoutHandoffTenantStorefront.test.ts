import { Types } from 'mongoose';

jest.mock('../src/services/shopifyStorefrontService', () => ({
  __esModule: true,
  default: {
    getCheckoutUrlForStore: jest.fn(),
    getCart: jest.fn(),
    getCartForStore: jest.fn(),
    createCart: jest.fn(),
    createCartForStore: jest.fn(),
    updateCartBuyerIdentity: jest.fn(),
    applyDiscountCodes: jest.fn(),
  },
}));

jest.mock('../src/services/stripeService', () => ({
  __esModule: true,
  default: {},
}));

import { CheckoutController } from '../src/controllers/checkoutController';
import shopifyStorefront from '../src/services/shopifyStorefrontService';
import CheckoutHandoff from '../src/models/CheckoutHandoff';
import { ApiError } from '../src/utils/errors';

const mockedStorefront = shopifyStorefront as jest.Mocked<typeof shopifyStorefront>;

const STORE_A = new Types.ObjectId().toString();
const STORE_B = new Types.ObjectId().toString();
const CART_ID = 'gid://shopify/Cart/test-cart-123';
const CHECKOUT_URL = 'https://store-a.myshopify.com/cart/c/test-cart-123?key=abc';

const cartPayload = (overrides: Record<string, unknown> = {}) => ({
  data: {
    cart: {
      id: CART_ID,
      checkoutUrl: CHECKOUT_URL,
      totalQuantity: 2,
      estimatedCost: { totalAmount: { amount: '42.00', currencyCode: 'USD' } },
      ...overrides,
    },
  },
});

const expectNoGlobalStorefrontCalls = () => {
  expect(mockedStorefront.getCart).not.toHaveBeenCalled();
  expect(mockedStorefront.createCart).not.toHaveBeenCalled();
  expect(mockedStorefront.updateCartBuyerIdentity).not.toHaveBeenCalled();
  expect(mockedStorefront.applyDiscountCodes).not.toHaveBeenCalled();
};

describe('Shopify-hosted checkout handoff (SaaS checkout v1)', () => {
  const originalSaasMode = process.env.SAAS_MODE;
  const originalMultiTenantMode = process.env.MULTI_TENANT_MODE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SAAS_MODE = originalSaasMode;
    process.env.MULTI_TENANT_MODE = originalMultiTenantMode;
    delete process.env.SAAS_MODE;
    delete process.env.MULTI_TENANT_MODE;
  });

  afterAll(() => {
    process.env.SAAS_MODE = originalSaasMode;
    process.env.MULTI_TENANT_MODE = originalMultiTenantMode;
  });

  describe('checkout handoff', () => {
    test('returns the tenant checkoutUrl using only the store-scoped helper', async () => {
      mockedStorefront.getCheckoutUrlForStore.mockResolvedValue(cartPayload());
      const controller = new CheckoutController();

      const response = await controller.checkoutHandoff(
        { cartId: CART_ID, country: 'US' },
        STORE_A,
        {}
      );

      expect(response.success).toBe(true);
      expect(response.data).toEqual({
        checkoutUrl: CHECKOUT_URL,
        cartId: CART_ID,
        storeId: STORE_A,
        totalQuantity: 2,
        total: 42,
        currency: 'USD',
      });
      expect(mockedStorefront.getCheckoutUrlForStore).toHaveBeenCalledWith(STORE_A, CART_ID, 'US');
      expectNoGlobalStorefrontCalls();
    });

    test('persists non-sensitive handoff metadata with storeId', async () => {
      mockedStorefront.getCheckoutUrlForStore.mockResolvedValue(cartPayload());
      const controller = new CheckoutController();

      await controller.checkoutHandoff({ cartId: CART_ID }, STORE_A, {});

      const handoff = await CheckoutHandoff.findOne({ shopifyCartId: CART_ID });
      expect(handoff).not.toBeNull();
      expect(handoff!.storeId.toString()).toBe(STORE_A);
      expect(handoff!.source).toBe('public');
      expect(handoff!.checkoutUrl).toBe(CHECKOUT_URL);
    });

    test('authenticated customer store context wins over a mismatched header (wrong-store protection)', async () => {
      mockedStorefront.getCheckoutUrlForStore.mockResolvedValue(cartPayload());
      const controller = new CheckoutController();
      const customerId = new Types.ObjectId().toString();

      await controller.checkoutHandoff(
        { cartId: CART_ID },
        STORE_B, // attacker/stale header pointing at another store
        { customer: { id: customerId, storeId: STORE_A } }
      );

      expect(mockedStorefront.getCheckoutUrlForStore).toHaveBeenCalledWith(
        STORE_A,
        CART_ID,
        undefined
      );

      const handoff = await CheckoutHandoff.findOne({ shopifyCartId: CART_ID });
      expect(handoff!.storeId.toString()).toBe(STORE_A);
      expect(handoff!.source).toBe('customer');
      expect(handoff!.customerId!.toString()).toBe(customerId);
    });

    test('missing store context fails safely without any Storefront call', async () => {
      const controller = new CheckoutController();

      await expect(
        controller.checkoutHandoff({ cartId: CART_ID }, undefined, {})
      ).rejects.toThrow(ApiError);

      expect(mockedStorefront.getCheckoutUrlForStore).not.toHaveBeenCalled();
      expectNoGlobalStorefrontCalls();
    });

    test('malformed store id fails safely without any Storefront call', async () => {
      const controller = new CheckoutController();

      await expect(
        controller.checkoutHandoff({ cartId: CART_ID }, 'not-an-object-id', {})
      ).rejects.toThrow('Invalid Store ID format');

      expect(mockedStorefront.getCheckoutUrlForStore).not.toHaveBeenCalled();
    });

    test('missing cart id fails safely', async () => {
      const controller = new CheckoutController();

      await expect(
        controller.checkoutHandoff({ cartId: '' }, STORE_A, {})
      ).rejects.toThrow('Cart ID is required');

      expect(mockedStorefront.getCheckoutUrlForStore).not.toHaveBeenCalled();
    });

    test('unknown cart returns a 404 ApiError', async () => {
      mockedStorefront.getCheckoutUrlForStore.mockResolvedValue({ data: { cart: null } });
      const controller = new CheckoutController();

      await expect(
        controller.checkoutHandoff({ cartId: CART_ID }, STORE_A, {})
      ).rejects.toThrow('Cart not found');
    });

    test('handoff still works in SaaS mode', async () => {
      process.env.SAAS_MODE = 'true';
      mockedStorefront.getCheckoutUrlForStore.mockResolvedValue(cartPayload());
      const controller = new CheckoutController();

      const response = await controller.checkoutHandoff({ cartId: CART_ID }, STORE_A, {});

      expect(response.success).toBe(true);
      expect(response.data.checkoutUrl).toBe(CHECKOUT_URL);
    });
  });

  describe('legacy native checkout is gated in SaaS mode', () => {
    test.each([
      ['SAAS_MODE', 'true'],
      ['MULTI_TENANT_MODE', '1'],
    ])('initializeCheckout fails closed when %s=%s', async (envVar, value) => {
      process.env[envVar] = value;
      const controller = new CheckoutController();

      await expect(
        controller.initializeCheckout({ cartId: CART_ID }, { user: { _id: 'u1' } })
      ).rejects.toThrow('Native checkout is disabled');

      expectNoGlobalStorefrontCalls();
    });

    test('applyPromoCode fails closed in SaaS mode before any Storefront call', async () => {
      process.env.SAAS_MODE = 'true';
      const controller = new CheckoutController();

      await expect(
        controller.applyPromoCode({ sessionId: 's1', promoCode: 'CODE' } as any, {
          user: { _id: 'u1' },
        })
      ).rejects.toThrow('Native checkout is disabled');

      expectNoGlobalStorefrontCalls();
    });

    test('completeCheckout fails closed in SaaS mode', async () => {
      process.env.SAAS_MODE = 'true';
      const controller = new CheckoutController();

      await expect(
        controller.completeCheckout({ sessionId: 's1' } as any, { user: { _id: 'u1' } })
      ).rejects.toThrow('Native checkout is disabled');
    });

    test('legacy endpoints remain available outside SaaS/prod mode', async () => {
      // No SAAS_MODE/MULTI_TENANT_MODE set (NODE_ENV=test): the guard must
      // not fire; the endpoint proceeds into its normal logic and fails on
      // the missing cart instead
      mockedStorefront.getCart.mockResolvedValue({ data: { cart: null } });
      const controller = new CheckoutController();

      await expect(
        controller.initializeCheckout({ cartId: CART_ID }, { user: { _id: new Types.ObjectId().toString() } })
      ).rejects.toThrow('Cart not found');

      expect(mockedStorefront.getCart).toHaveBeenCalledWith(CART_ID);
    });
  });
});
