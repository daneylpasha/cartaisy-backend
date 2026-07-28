import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { getStoreConfig } from '../src/controllers/storeConfigController';
import Store from '../src/models/Store';

jest.mock('../src/models/Store', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

const mockedStore = Store as jest.Mocked<typeof Store>;

const storeId = new Types.ObjectId().toString();

const createRequest = (headers: Record<string, string> = {}): Request =>
  ({ headers }) as unknown as Request;

const createResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  return res as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
};

/**
 * The controller reads through `Store.findById(id).select(...).lean()`, so the
 * value handed to this helper is the raw lean document. Tests use it to stand
 * in for documents written through the Mongoose model *and* for legacy or
 * directly-edited documents that bypassed `StoreBrandingSchema` validation.
 */
const mockStoreDocument = (document: unknown) => {
  const select = jest.fn().mockReturnThis();
  const lean = jest.fn().mockResolvedValue(document);

  mockedStore.findById.mockReturnValue({ select, lean } as any);

  return { select, lean };
};

const activeStore = {
  _id: storeId,
  name: 'Tenant Store',
  isActive: true,
  settings: {
    currency: 'GBP',
    timezone: 'Europe/London',
    language: 'fr',
  },
};

describe('getStoreConfig branding fields', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedStore.findById.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  it('selects branding alongside the existing store config fields', async () => {
    const { select } = mockStoreDocument({
      ...activeStore,
      branding: { primaryColor: '#FF6B6B' },
    });
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    expect(mockedStore.findById).toHaveBeenCalledWith(storeId);
    expect(select).toHaveBeenCalledWith('settings name isActive branding');
  });

  it('returns primaryColor, secondaryColor, and logoUrl when all are stored validly', async () => {
    mockStoreDocument({
      ...activeStore,
      branding: {
        primaryColor: '#FF6B6B',
        secondaryColor: '#123',
        logoUrl: 'https://cdn.example.com/logo.png',
      },
    });
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        currency: 'GBP',
        timezone: 'Europe/London',
        language: 'fr',
        name: 'Tenant Store',
        primaryColor: '#FF6B6B',
        secondaryColor: '#123',
        logoUrl: 'https://cdn.example.com/logo.png',
      },
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('omits secondaryColor and logoUrl for a store with only the default branding', async () => {
    mockStoreDocument({
      ...activeStore,
      branding: { primaryColor: '#FF6B6B' },
    });
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    const body = res.json.mock.calls[0][0];

    expect(body.data.primaryColor).toBe('#FF6B6B');
    expect(body.data).not.toHaveProperty('secondaryColor');
    expect(body.data).not.toHaveProperty('logoUrl');
  });

  it('omits every branding field when the store has no branding object at all', async () => {
    mockStoreDocument({ ...activeStore });
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    const body = res.json.mock.calls[0][0];

    expect(body.success).toBe(true);
    expect(body.data).not.toHaveProperty('primaryColor');
    expect(body.data).not.toHaveProperty('secondaryColor');
    expect(body.data).not.toHaveProperty('logoUrl');
  });

  it('omits an invalid stored logoUrl and still returns the rest of the config', async () => {
    mockStoreDocument({
      ...activeStore,
      branding: {
        primaryColor: '#FF6B6B',
        secondaryColor: '#00AABB',
        logoUrl: 'not-a-url',
      },
    });
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        currency: 'GBP',
        timezone: 'Europe/London',
        language: 'fr',
        name: 'Tenant Store',
        primaryColor: '#FF6B6B',
        secondaryColor: '#00AABB',
      },
    });
    expect(res.json.mock.calls[0][0].data).not.toHaveProperty('logoUrl');
  });

  it('omits a logoUrl that parses but does not use an http(s) protocol', async () => {
    mockStoreDocument({
      ...activeStore,
      branding: {
        primaryColor: '#FF6B6B',
        logoUrl: 'ftp://cdn.example.com/logo.png',
      },
    });
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    const body = res.json.mock.calls[0][0];

    expect(body.success).toBe(true);
    expect(body.data).not.toHaveProperty('logoUrl');
  });

  it('omits a malformed color from a legacy document that bypassed schema validation', async () => {
    // A raw/legacy document — e.g. inserted directly rather than through the
    // Mongoose model — can hold a color the schema would have rejected.
    mockStoreDocument({
      ...activeStore,
      branding: {
        primaryColor: 'red',
        secondaryColor: '#00AABB',
        logoUrl: 'https://cdn.example.com/logo.png',
      },
    });
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        currency: 'GBP',
        timezone: 'Europe/London',
        language: 'fr',
        name: 'Tenant Store',
        secondaryColor: '#00AABB',
        logoUrl: 'https://cdn.example.com/logo.png',
      },
    });
    expect(res.json.mock.calls[0][0].data).not.toHaveProperty('primaryColor');
  });

  it('omits branding values that are not strings', async () => {
    mockStoreDocument({
      ...activeStore,
      branding: {
        primaryColor: 123,
        secondaryColor: null,
        logoUrl: { url: 'https://cdn.example.com/logo.png' },
      },
    });
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    const body = res.json.mock.calls[0][0];

    expect(body.success).toBe(true);
    expect(body.data).not.toHaveProperty('primaryColor');
    expect(body.data).not.toHaveProperty('secondaryColor');
    expect(body.data).not.toHaveProperty('logoUrl');
  });
});

describe('getStoreConfig existing behavior', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedStore.findById.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  it('returns 400 when the X-Store-ID header is missing', async () => {
    const res = createResponse();

    await getStoreConfig(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'X-Store-ID header is required',
    });
    expect(mockedStore.findById).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed store ID', async () => {
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': 'not-an-object-id' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid store ID',
    });
    expect(mockedStore.findById).not.toHaveBeenCalled();
  });

  it('returns 404 when the store does not exist', async () => {
    mockStoreDocument(null);
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Store not found',
    });
  });

  it('returns 403 when the store is not active', async () => {
    mockStoreDocument({
      ...activeStore,
      isActive: false,
      branding: { primaryColor: '#FF6B6B' },
    });
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Store is not active',
    });
  });

  it('keeps the existing currency/timezone/language/name fallbacks for a store without settings', async () => {
    mockStoreDocument({
      _id: storeId,
      isActive: true,
      branding: { primaryColor: '#FF6B6B' },
    });
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        currency: 'USD',
        timezone: 'UTC',
        language: 'en',
        name: '',
        primaryColor: '#FF6B6B',
      },
    });
  });

  it('returns 500 when the store lookup fails', async () => {
    const select = jest.fn().mockReturnThis();
    const lean = jest.fn().mockRejectedValue(new Error('connection lost'));
    mockedStore.findById.mockReturnValue({ select, lean } as any);
    const res = createResponse();

    await getStoreConfig(createRequest({ 'x-store-id': storeId }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to get store configuration',
    });
  });
});
