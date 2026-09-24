import { FavoritesController } from '../src/controllers/favoritesController';
import shopifyStorefront from '../src/services/shopifyStorefrontService';
import Favorite from '../src/models/Favorite';
import Customer from '../src/models/Customer';
import User from '../src/models/User';

jest.mock('../src/services/shopifyStorefrontService', () => ({
  __esModule: true,
  default: {
    getProductById: jest.fn(),
    getProductByIdForStore: jest.fn(),
  },
}));

jest.mock('../src/models/Favorite', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.mock('../src/models/Customer', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock('../src/models/User', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

const mockedStorefront = shopifyStorefront as jest.Mocked<typeof shopifyStorefront>;
const mockedFavorite = Favorite as jest.Mocked<typeof Favorite>;
const mockedCustomer = Customer as jest.Mocked<typeof Customer>;
const mockedUser = User as jest.Mocked<typeof User>;

const storeId = '64b7f8e2b7f8e2b7f8e2b7f8';
const otherStoreId = '64b7f8e2b7f8e2b7f8e2b7f9';
const userId = '64b7f8e2b7f8e2b7f8e2b7fa';

const shopifyProduct = {
  id: 'gid://shopify/Product/123',
  title: 'Tenant Shirt',
  description: 'Soft',
  handle: 'tenant-shirt',
  vendor: 'Tenant',
  productType: 'Shirt',
  tags: ['cotton'],
  availableForSale: true,
  totalInventory: 4,
  priceRange: { minVariantPrice: { amount: '10.00', currencyCode: 'USD' } },
  compareAtPriceRange: { minVariantPrice: { amount: '12.00', currencyCode: 'USD' } },
  images: { edges: [{ node: { url: 'https://cdn.example.com/p.jpg', altText: 'Shirt' } }] },
  variants: { edges: [] },
};

const mockFavoritesQuery = () => {
  const lean = jest.fn().mockResolvedValue([{ productId: '123' }]);
  const select = jest.fn().mockReturnValue({ lean });
  const limit = jest.fn().mockReturnValue({ select });
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });
  mockedFavorite.find.mockReturnValue({ sort } as any);
  mockedFavorite.countDocuments.mockResolvedValue(1 as any);
};

const mockFindById = (store: string | undefined) => {
  const lean = jest.fn().mockResolvedValue(store ? { storeId: store } : null);
  const select = jest.fn().mockReturnValue({ lean });
  return jest.fn().mockReturnValue({ select });
};

describe('FavoritesController tenant-scoped product hydration', () => {
  const originalSaasMode = process.env.SAAS_MODE;
  const originalMultiTenantMode = process.env.MULTI_TENANT_MODE;
  const originalStorefrontToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  const originalShopDomain = process.env.SHOPIFY_SHOP_DOMAIN;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.SAAS_MODE = originalSaasMode;
    process.env.MULTI_TENANT_MODE = originalMultiTenantMode;
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = originalStorefrontToken;
    process.env.SHOPIFY_SHOP_DOMAIN = originalShopDomain;
    delete process.env.SAAS_MODE;
    delete process.env.MULTI_TENANT_MODE;
    mockedStorefront.getProductById.mockReset();
    mockedStorefront.getProductByIdForStore.mockReset();
    mockedFavorite.find.mockReset();
    mockedFavorite.countDocuments.mockReset();
    mockedCustomer.findById.mockReset();
    mockedUser.findById.mockReset();
    mockFavoritesQuery();
    mockedStorefront.getProductByIdForStore.mockResolvedValue({
      data: { product: shopifyProduct },
    } as any);
  });

  afterAll(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    };
    restore('SAAS_MODE', originalSaasMode);
    restore('MULTI_TENANT_MODE', originalMultiTenantMode);
    restore('SHOPIFY_STOREFRONT_ACCESS_TOKEN', originalStorefrontToken);
    restore('SHOPIFY_SHOP_DOMAIN', originalShopDomain);
  });

  it('hydrates favorites with the authenticated customer store and ignores a mismatched header', async () => {
    process.env.SAAS_MODE = 'true';
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'global-storefront-token';
    process.env.SHOPIFY_SHOP_DOMAIN = 'global-shop.myshopify.com';

    const controller = new FavoritesController();
    const response = await controller.getDetailedFavorites({
      user: { id: userId, role: 'customer', storeId },
      // strictStoreValidation copies a caller header onto req.storeId.
      storeId: otherStoreId,
      headers: { 'x-store-id': otherStoreId },
    });

    expect(mockedStorefront.getProductByIdForStore).toHaveBeenCalledWith(storeId, '123');
    expect(mockedStorefront.getProductById).not.toHaveBeenCalled();
    expect(mockedCustomer.findById).not.toHaveBeenCalled();
    expect(mockedUser.findById).not.toHaveBeenCalled();
    expect(response.success).toBe(true);
    expect(response.data.products[0]).toMatchObject({
      id: '123',
      title: 'Tenant Shirt',
      price: 10,
    });
  });

  it('loads storeId from the customer record when the principal omits it', async () => {
    process.env.MULTI_TENANT_MODE = 'on';
    mockedCustomer.findById.mockImplementation(mockFindById(storeId) as any);

    const controller = new FavoritesController();
    await controller.getDetailedFavorites({
      user: { id: userId, role: 'customer' },
      storeId: otherStoreId,
      headers: { 'x-store-id': otherStoreId },
    });

    expect(mockedCustomer.findById).toHaveBeenCalledWith(userId);
    expect(mockedStorefront.getProductByIdForStore).toHaveBeenCalledWith(storeId, '123');
    expect(mockedStorefront.getProductById).not.toHaveBeenCalled();
  });

  it('loads storeId from the dashboard user record when the principal omits it', async () => {
    mockedUser.findById.mockImplementation(mockFindById(storeId) as any);

    const controller = new FavoritesController();
    await controller.getDetailedFavorites({
      user: { id: userId, role: 'admin' },
      storeId: otherStoreId,
      headers: { 'x-store-id': otherStoreId },
    });

    expect(mockedUser.findById).toHaveBeenCalledWith(userId);
    expect(mockedCustomer.findById).not.toHaveBeenCalled();
    expect(mockedStorefront.getProductByIdForStore).toHaveBeenCalledWith(storeId, '123');
    expect(mockedStorefront.getProductById).not.toHaveBeenCalled();
  });

  it('does not call env-backed product reads when the account has no store', async () => {
    process.env.SAAS_MODE = 'true';
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'global-storefront-token';
    mockedCustomer.findById.mockImplementation(mockFindById(undefined) as any);

    const controller = new FavoritesController();
    const response = await controller.getDetailedFavorites({
      user: { id: userId, role: 'customer' },
      storeId: otherStoreId,
      headers: { 'x-store-id': otherStoreId },
    });

    expect(controller.getStatus()).toBe(400);
    expect(response.success).toBe(false);
    expect(response.data.products).toEqual([]);
    expect(mockedFavorite.find).not.toHaveBeenCalled();
    expect(mockedStorefront.getProductByIdForStore).not.toHaveBeenCalled();
    expect(mockedStorefront.getProductById).not.toHaveBeenCalled();
  });

  it('rejects a malformed authenticated storeId without calling Shopify', async () => {
    const controller = new FavoritesController();
    const response = await controller.getDetailedFavorites({
      user: { id: userId, role: 'customer', storeId: 'not-a-store' },
      headers: { 'x-store-id': storeId },
    });

    expect(controller.getStatus()).toBe(400);
    expect(response.success).toBe(false);
    expect(mockedStorefront.getProductByIdForStore).not.toHaveBeenCalled();
    expect(mockedStorefront.getProductById).not.toHaveBeenCalled();
  });
});
