import { CartController } from '../src/controllers/cartController';
import shopifyStorefront from '../src/services/shopifyStorefrontService';
import { ApiError } from '../src/utils/errors';

jest.mock('../src/services/shopifyStorefrontService', () => ({
  __esModule: true,
  default: {
    createCart: jest.fn(),
    createCartForStore: jest.fn(),
    getCart: jest.fn(),
    getCartForStore: jest.fn(),
    addCartLines: jest.fn(),
    addCartLinesForStore: jest.fn(),
    updateCartLines: jest.fn(),
    updateCartLinesForStore: jest.fn(),
    removeCartLines: jest.fn(),
    removeCartLinesForStore: jest.fn(),
    associateCartWithCustomer: jest.fn(),
    associateCartWithCustomerForStore: jest.fn(),
    isAdminConfigured: jest.fn(),
    getProductMetafields: jest.fn(),
  },
}));

jest.mock('../src/models/Customer', () => ({
  __esModule: true,
  default: {
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock('../src/models/CartActivity', () => ({
  __esModule: true,
  default: {
    updateCartActivity: jest.fn(),
  },
}));

const mockedShopifyStorefront = shopifyStorefront as jest.Mocked<typeof shopifyStorefront>;
const storeId = '64b7f8e2b7f8e2b7f8e2b7f8';
const cartId = 'gid://shopify/Cart/abc';

const cart = {
  id: cartId,
  lines: {
    edges: [
      {
        node: {
          id: 'line-1',
          quantity: 2,
          merchandise: {
            id: 'gid://shopify/ProductVariant/456',
            title: 'Small',
            priceV2: { amount: '10.00', currencyCode: 'USD' },
            compareAtPriceV2: { amount: '12.00', currencyCode: 'USD' },
            quantityAvailable: 5,
            image: { url: 'https://cdn.example.com/variant.jpg' },
            product: {
              id: 'gid://shopify/Product/123',
              title: 'Tenant Shirt',
            },
          },
        },
      },
    ],
  },
  estimatedCost: {
    subtotalAmount: { amount: '20.00', currencyCode: 'USD' },
  },
};

const cartCreateResponse = {
  data: {
    cartCreate: {
      cart,
      userErrors: [],
    },
  },
};

describe('CartController tenant-scoped Storefront cart operations', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.values(mockedShopifyStorefront).forEach((value) => {
      if (jest.isMockFunction(value)) {
        value.mockReset();
      }
    });
    mockedShopifyStorefront.isAdminConfigured.mockReturnValue(false);
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  it('requires store context before creating a Storefront cart', async () => {
    const controller = new CartController();

    await expect(controller.createCart()).rejects.toMatchObject({
      name: ApiError.name,
      message: 'x-store-id header is required',
      statusCode: 400,
    });

    expect(controller.getStatus()).toBe(400);
    expect(mockedShopifyStorefront.createCartForStore).not.toHaveBeenCalled();
    expect(mockedShopifyStorefront.createCart).not.toHaveBeenCalled();
  });

  it('rejects malformed store IDs without using global Storefront cart fallback', async () => {
    const controller = new CartController();

    await expect(controller.getCart(cartId, undefined, 'not-an-object-id')).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Invalid Store ID format',
      statusCode: 400,
    });

    expect(controller.getStatus()).toBe(400);
    expect(mockedShopifyStorefront.getCartForStore).not.toHaveBeenCalled();
    expect(mockedShopifyStorefront.getCart).not.toHaveBeenCalled();
  });

  it('creates carts through tenant-scoped Storefront credentials and preserves response shape', async () => {
    const controller = new CartController();
    mockedShopifyStorefront.createCartForStore.mockResolvedValue(cartCreateResponse);

    const response = await controller.createCart(
      { items: [{ merchandiseId: 'gid://shopify/ProductVariant/456', quantity: 2 }] },
      'US',
      storeId
    );

    expect(mockedShopifyStorefront.createCartForStore).toHaveBeenCalledWith(
      storeId,
      [{ merchandiseId: 'gid://shopify/ProductVariant/456', quantity: 2 }],
      'US'
    );
    expect(mockedShopifyStorefront.createCart).not.toHaveBeenCalled();
    expect(response).toEqual({
      success: true,
      data: {
        cartId,
        items: [
          {
            id: 'line-1',
            merchandiseId: 'gid://shopify/ProductVariant/456',
            productId: 'gid://shopify/Product/123',
            title: 'Tenant Shirt',
            variantTitle: 'Small',
            image: 'https://cdn.example.com/variant.jpg',
            price: 10,
            compareAtPrice: 12,
            quantity: 2,
            quantityAvailable: 5,
            metafields: [],
          },
        ],
        totalQuantity: 2,
        subtotal: 20,
        currency: 'USD',
      },
    });
  });

  it('uses tenant-scoped Storefront methods for cart reads and line mutations', async () => {
    const controller = new CartController();
    mockedShopifyStorefront.getCartForStore.mockResolvedValue({ data: { cart } });
    mockedShopifyStorefront.addCartLinesForStore.mockResolvedValue({ data: { cartLinesAdd: { cart, userErrors: [] } } });
    mockedShopifyStorefront.updateCartLinesForStore.mockResolvedValue({ data: { cartLinesUpdate: { cart, userErrors: [] } } });
    mockedShopifyStorefront.removeCartLinesForStore.mockResolvedValue({ data: { cartLinesRemove: { cart, userErrors: [] } } });

    await controller.getCart(cartId, 'US', storeId);
    await controller.addItems(cartId, { items: [{ merchandiseId: 'gid://shopify/ProductVariant/456', quantity: 1 }] }, 'US', storeId);
    await controller.updateItemQuantity(cartId, 'line-1', { quantity: 3 }, 'US', storeId);
    await controller.removeItem(cartId, 'line-1', 'US', storeId);

    expect(mockedShopifyStorefront.getCartForStore).toHaveBeenCalledWith(storeId, cartId, 'US');
    expect(mockedShopifyStorefront.addCartLinesForStore).toHaveBeenCalledWith(
      storeId,
      cartId,
      [{ merchandiseId: 'gid://shopify/ProductVariant/456', quantity: 1 }],
      'US'
    );
    expect(mockedShopifyStorefront.updateCartLinesForStore).toHaveBeenCalledWith(
      storeId,
      cartId,
      [{ id: 'line-1', quantity: 3 }],
      'US'
    );
    expect(mockedShopifyStorefront.removeCartLinesForStore).toHaveBeenCalledWith(storeId, cartId, ['line-1'], 'US');
    expect(mockedShopifyStorefront.getCart).not.toHaveBeenCalled();
    expect(mockedShopifyStorefront.addCartLines).not.toHaveBeenCalled();
    expect(mockedShopifyStorefront.updateCartLines).not.toHaveBeenCalled();
    expect(mockedShopifyStorefront.removeCartLines).not.toHaveBeenCalled();
  });

  it('uses the authenticated customer storeId when associating a cart', async () => {
    const controller = new CartController();
    mockedShopifyStorefront.associateCartWithCustomerForStore.mockResolvedValue({
      data: {
        cartBuyerIdentityUpdate: {
          cart,
          userErrors: [],
        },
      },
    });

    await controller.associateWithCustomer(
      cartId,
      {
        user: {
          storeId,
          shopifyAccessToken: 'customer-token',
        },
      },
      'US',
      '64b7f8e2b7f8e2b7f8e2b7f9'
    );

    expect(mockedShopifyStorefront.associateCartWithCustomerForStore).toHaveBeenCalledWith(
      storeId,
      cartId,
      'customer-token',
      'US'
    );
    expect(mockedShopifyStorefront.associateCartWithCustomer).not.toHaveBeenCalled();
  });

  it('clears carts through tenant-scoped get and remove calls', async () => {
    const controller = new CartController();
    mockedShopifyStorefront.getCartForStore.mockResolvedValue({ data: { cart } });
    mockedShopifyStorefront.removeCartLinesForStore.mockResolvedValue({
      data: {
        cartLinesRemove: {
          cart: { ...cart, lines: { edges: [] } },
          userErrors: [],
        },
      },
    });

    const response = await controller.clearCart(cartId, storeId);

    expect(mockedShopifyStorefront.getCartForStore).toHaveBeenCalledWith(storeId, cartId);
    expect(mockedShopifyStorefront.removeCartLinesForStore).toHaveBeenCalledWith(storeId, cartId, ['line-1']);
    expect(mockedShopifyStorefront.getCart).not.toHaveBeenCalled();
    expect(mockedShopifyStorefront.removeCartLines).not.toHaveBeenCalled();
    expect(response).toEqual({
      success: true,
      message: 'Cart cleared successfully',
    });
  });
});
