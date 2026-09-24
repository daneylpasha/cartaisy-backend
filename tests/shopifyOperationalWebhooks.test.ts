import axios from 'axios';
import Store from '../src/models/Store';
import {
  OPERATIONAL_WEBHOOK_SUBSCRIPTIONS,
  operationalWebhookCallbackUrl,
  registerOperationalWebhooksForStore,
  resolveOperationalWebhookMount,
} from '../src/services/shopifyWebhookSubscriptionService';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const postMock = jest.fn();

const SHOP = 'operational-webhooks.myshopify.com';
const STORE_TOKEN = 'store-admin-token-operational';
const GLOBAL_TOKEN = 'shpat_global_env_token_should_not_be_used';
const MOUNT = 'https://api.example.com/api/webhooks';

const ENV_KEYS = ['SHOPIFY_WEBHOOK_URL', 'API_BASE_URL', 'RAILWAY_STATIC_URL', 'SHOPIFY_ACCESS_TOKEN'] as const;

interface ListedNode {
  id: string;
  topic: string;
  callbackUrl: string;
}

const callbackFor = (path: string, mount = MOUNT) => operationalWebhookCallbackUrl(path, mount);

const createCalls = () =>
  postMock.mock.calls.filter(([, body]) =>
    String(body?.query || '').includes('webhookSubscriptionCreate')
  );

const listCalls = () =>
  postMock.mock.calls.filter(([, body]) =>
    String(body?.query || '').includes('webhookSubscriptions(')
  );

const configureShopifyMock = (
  initial: ListedNode[] = [],
  options?: {
    listError?: Error;
    failTopics?: Record<string, string>;
    alreadyTakenTopics?: string[];
  }
) => {
  const listed = [...initial];
  postMock.mockImplementation((_url: string, body: { query?: string; variables?: any }) => {
    const query = body?.query || '';

    if (query.includes('webhookSubscriptions(')) {
      if (options?.listError) {
        return Promise.reject(options.listError);
      }
      const cursor = body?.variables?.cursor as string | null | undefined;
      const pageSize = 3;
      const start = cursor ? Number(cursor) : 0;
      const slice = listed.slice(start, start + pageSize);
      const next = start + pageSize;
      const hasNextPage = next < listed.length;
      return Promise.resolve({
        data: {
          data: {
            webhookSubscriptions: {
              edges: slice.map((node) => ({
                node: {
                  id: node.id,
                  topic: node.topic,
                  endpoint: {
                    __typename: 'WebhookHttpEndpoint',
                    callbackUrl: node.callbackUrl,
                  },
                },
              })),
              pageInfo: {
                hasNextPage,
                endCursor: hasNextPage ? String(next) : null,
              },
            },
          },
        },
      });
    }

    if (query.includes('webhookSubscriptionCreate')) {
      const topic = body?.variables?.topic as string;
      const callbackUrl = body?.variables?.webhookSubscription?.callbackUrl as string;
      const taken = options?.alreadyTakenTopics?.includes(topic);
      if (taken) {
        return Promise.resolve({
          data: {
            data: {
              webhookSubscriptionCreate: {
                webhookSubscription: null,
                userErrors: [{ field: ['callbackUrl'], message: 'Address for this topic has already been taken' }],
              },
            },
          },
        });
      }
      const failure = options?.failTopics?.[topic];
      if (failure) {
        return Promise.resolve({
          data: {
            data: {
              webhookSubscriptionCreate: {
                webhookSubscription: null,
                userErrors: [{ field: ['topic'], message: failure }],
              },
            },
          },
        });
      }
      const id = `gid://shopify/WebhookSubscription/${topic}`;
      listed.push({ id, topic, callbackUrl });
      return Promise.resolve({
        data: {
          data: {
            webhookSubscriptionCreate: {
              webhookSubscription: { id, topic },
              userErrors: [],
            },
          },
        },
      });
    }

    return Promise.reject(new Error(`unexpected Shopify call: ${query.slice(0, 40)}`));
  });
};

const createConnectedStore = (slug: string, shop = SHOP) =>
  Store.create({
    name: `Webhook Store ${slug}`,
    slug: `operational-webhook-store-${slug}`,
    isActive: true,
    shopify: {
      shop,
      accessToken: STORE_TOKEN,
      scope: 'read_products,read_orders,read_customers,write_inventory',
      isConnected: true,
    },
  });

const readFlags = async (storeId: string) => {
  const store = await Store.findById(storeId).select(
    'shopify.webhooksRegisteredAt shopify.webhookRegistrationError shopify.isConnected'
  );
  return store?.shopify;
};

describe('Operational Shopify webhook registration (issue #163)', () => {
  const previousEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.SHOPIFY_WEBHOOK_URL = MOUNT;
    process.env.SHOPIFY_ACCESS_TOKEN = GLOBAL_TOKEN;

    mockedAxios.create.mockReset();
    postMock.mockReset();
    configureShopifyMock();
    mockedAxios.create.mockReturnValue({ post: postMock, get: jest.fn() } as any);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (previousEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousEnv[key];
      }
    }
  });

  it('registers the operational topics on the store Admin client', async () => {
    const store = await createConnectedStore('fresh');
    const other = await createConnectedStore('other', 'other-shop.myshopify.com');

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(true);
    expect(result.created).toBe(OPERATIONAL_WEBHOOK_SUBSCRIPTIONS.length);
    expect(result.alreadyPresent).toBe(0);
    expect(result.failedTopics).toEqual([]);
    expect(createCalls()).toHaveLength(OPERATIONAL_WEBHOOK_SUBSCRIPTIONS.length);

    const created = createCalls().map(([, body]) => ({
      topic: body.variables.topic,
      callbackUrl: body.variables.webhookSubscription.callbackUrl,
      format: body.variables.webhookSubscription.format,
    }));
    expect(created).toEqual(
      OPERATIONAL_WEBHOOK_SUBSCRIPTIONS.map((subscription) => ({
        topic: subscription.topic,
        callbackUrl: callbackFor(subscription.path),
        format: 'JSON',
      }))
    );
    expect(created.map((entry) => entry.callbackUrl)).toEqual([
      'https://api.example.com/api/webhooks/shopify/products/create',
      'https://api.example.com/api/webhooks/shopify/products/update',
      'https://api.example.com/api/webhooks/shopify/products/delete',
      'https://api.example.com/api/webhooks/shopify/orders/create',
      'https://api.example.com/api/webhooks/shopify/orders/updated',
      'https://api.example.com/api/webhooks/shopify/orders/paid',
      'https://api.example.com/api/webhooks/shopify/inventory_levels/update',
      'https://api.example.com/api/webhooks/shopify/customers/create',
    ]);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: `https://${SHOP}/admin/api/2024-01`,
        headers: expect.objectContaining({ 'X-Shopify-Access-Token': STORE_TOKEN }),
      })
    );
    const headers = mockedAxios.create.mock.calls.map((call) => JSON.stringify(call[0]));
    expect(headers.some((header) => header.includes(GLOBAL_TOKEN))).toBe(false);
    expect(headers.some((header) => header.includes('other-shop.myshopify.com'))).toBe(false);

    const flags = await readFlags(store._id.toString());
    expect(flags?.webhooksRegisteredAt).toBeInstanceOf(Date);
    expect(flags?.webhookRegistrationError).toBeUndefined();
    const untouched = await readFlags(other._id.toString());
    expect(untouched?.webhooksRegisteredAt).toBeUndefined();
    expect(untouched?.webhookRegistrationError).toBeUndefined();
  });

  it('is idempotent on reconnect and paginates the existing subscription list', async () => {
    const store = await createConnectedStore('reconnect');
    const storeId = store._id.toString();

    const first = await registerOperationalWebhooksForStore(storeId);
    expect(first.created).toBe(8);
    expect(createCalls()).toHaveLength(8);

    postMock.mockClear();
    const second = await registerOperationalWebhooksForStore(storeId);

    expect(second.ok).toBe(true);
    expect(second.created).toBe(0);
    expect(second.alreadyPresent).toBe(8);
    expect(createCalls()).toHaveLength(0);
    expect(listCalls().length).toBeGreaterThan(1);
    expect(listCalls()[1][1].variables.cursor).toEqual(expect.any(String));

    const flags = await readFlags(storeId);
    expect(flags?.webhooksRegisteredAt).toBeInstanceOf(Date);
    expect(flags?.webhookRegistrationError).toBeUndefined();
  });

  it('treats an already-taken callback as present and does not fail', async () => {
    const store = await createConnectedStore('taken');
    configureShopifyMock([], {
      alreadyTakenTopics: ['ORDERS_PAID', 'CUSTOMERS_CREATE'],
    });

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(true);
    expect(result.created).toBe(6);
    expect(result.alreadyPresent).toBe(2);
    expect(result.failedTopics).toEqual([]);
    const flags = await readFlags(store._id.toString());
    expect(flags?.webhooksRegisteredAt).toBeInstanceOf(Date);
    expect(flags?.webhookRegistrationError).toBeUndefined();
  });

  it('skips creates when the listed callback differs only by a trailing slash', async () => {
    const store = await createConnectedStore('slash');
    configureShopifyMock(
      OPERATIONAL_WEBHOOK_SUBSCRIPTIONS.map((subscription) => ({
        id: `gid://${subscription.topic}`,
        topic: subscription.topic,
        callbackUrl: `${callbackFor(subscription.path)}/`,
      }))
    );

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(true);
    expect(result.created).toBe(0);
    expect(result.alreadyPresent).toBe(8);
    expect(createCalls()).toHaveLength(0);
  });

  it('does not create subscriptions when listing fails, and keeps OAuth-safe state', async () => {
    const store = await createConnectedStore('list-fail');
    await Store.updateOne(
      { _id: store._id },
      { $set: { 'shopify.webhooksRegisteredAt': new Date('2026-09-01T00:00:00.000Z') } }
    );
    configureShopifyMock([], { listError: new Error('Request failed with status code 401') });

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(false);
    expect(result.created).toBe(0);
    expect(createCalls()).toHaveLength(0);
    expect(result.errorSummary).toMatch(/Failed to list Shopify webhook subscriptions/);
    expect(result.errorSummary).not.toMatch(/shpat_|shpss_/);
    const flags = await readFlags(store._id.toString());
    expect(flags?.isConnected).toBe(true);
    expect(flags?.webhooksRegisteredAt).toBeUndefined();
    expect(flags?.webhookRegistrationError).toMatch(/Failed to list Shopify webhook subscriptions/);
  });

  it('records a partial create failure without throwing and redacts tokens', async () => {
    const store = await createConnectedStore('partial');
    configureShopifyMock([], {
      failTopics: {
        INVENTORY_LEVELS_UPDATE: `Access denied for ${GLOBAL_TOKEN}`,
      },
    });

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(false);
    expect(result.created).toBe(7);
    expect(result.failedTopics).toEqual(['inventory_levels/update']);
    expect(result.errorSummary).toMatch(/inventory_levels\/update/);
    expect(result.errorSummary).not.toContain(GLOBAL_TOKEN);
    expect(result.errorSummary).toContain('[redacted]');
    const flags = await readFlags(store._id.toString());
    expect(flags?.webhooksRegisteredAt).toBeUndefined();
    expect(flags?.webhookRegistrationError).toContain('[redacted]');
    expect(flags?.webhookRegistrationError).not.toContain(GLOBAL_TOKEN);
  });

  it('persists a configuration error and does not call Shopify when the callback URL is missing', async () => {
    delete process.env.SHOPIFY_WEBHOOK_URL;
    delete process.env.API_BASE_URL;
    delete process.env.RAILWAY_STATIC_URL;
    const store = await createConnectedStore('no-url');

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(false);
    expect(result.errorSummary).toBe('Webhook callback URL is not configured');
    expect(postMock).not.toHaveBeenCalled();
    expect(mockedAxios.create).not.toHaveBeenCalled();
    const flags = await readFlags(store._id.toString());
    expect(flags?.webhookRegistrationError).toBe('Webhook callback URL is not configured');
    expect(flags?.webhooksRegisteredAt).toBeUndefined();
  });

  it('rejects a webhook URL that is not the API origin or /api/webhooks mount', async () => {
    process.env.SHOPIFY_WEBHOOK_URL = 'https://api.example.com/api/webhooks/shopify/orders/create';
    const store = await createConnectedStore('bad-url');

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(false);
    expect(result.errorSummary).toMatch(/SHOPIFY_WEBHOOK_URL/);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('builds callback URLs from the API origin when SHOPIFY_WEBHOOK_URL is unset', async () => {
    delete process.env.SHOPIFY_WEBHOOK_URL;
    process.env.API_BASE_URL = 'https://api.example.com';
    const store = await createConnectedStore('api-base');

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(true);
    expect(createCalls()[0][1].variables.webhookSubscription.callbackUrl).toBe(
      'https://api.example.com/api/webhooks/shopify/products/create'
    );
    expect(resolveOperationalWebhookMount()).toEqual({
      ok: true,
      mount: 'https://api.example.com/api/webhooks',
    });
  });

  it('accepts an origin-only SHOPIFY_WEBHOOK_URL', () => {
    process.env.SHOPIFY_WEBHOOK_URL = 'https://api.example.com/';
    expect(resolveOperationalWebhookMount()).toEqual({
      ok: true,
      mount: 'https://api.example.com/api/webhooks',
    });
  });

  it('does not throw when the store is not connected', async () => {
    const store = await Store.create({
      name: 'Disconnected webhook store',
      slug: 'operational-webhook-disconnected',
      isActive: true,
      shopify: { isConnected: false },
    });

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(false);
    expect(result.errorSummary).toMatch(/not connected/i);
    expect(postMock).not.toHaveBeenCalled();
    const flags = await readFlags(store._id.toString());
    expect(flags?.webhooksRegisteredAt).toBeUndefined();
  });

  it('serializes concurrent registration so the second run does not create duplicates', async () => {
    const store = await createConnectedStore('concurrent');
    const storeId = store._id.toString();

    const [first, second] = await Promise.all([
      registerOperationalWebhooksForStore(storeId),
      registerOperationalWebhooksForStore(storeId),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.created + second.created).toBe(8);
    expect(createCalls()).toHaveLength(8);
  });

  it('does not store a result for a shop that was replaced while registration was in flight', async () => {
    const store = await createConnectedStore('switch', 'shop-a.myshopify.com');
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    postMock.mockImplementation((_url: string, body: { query?: string; variables?: { topic?: string } }) => {
      const query = body?.query || '';
      if (query.includes('webhookSubscriptions(')) {
        return gate.then(() => ({
          data: {
            data: {
              webhookSubscriptions: {
                edges: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        }));
      }
      if (query.includes('webhookSubscriptionCreate')) {
        return Promise.resolve({
          data: {
            data: {
              webhookSubscriptionCreate: {
                webhookSubscription: { id: `gid://${body?.variables?.topic}`, topic: body?.variables?.topic },
                userErrors: [],
              },
            },
          },
        });
      }
      return Promise.reject(new Error('unexpected Shopify call'));
    });

    const pending = registerOperationalWebhooksForStore(store._id.toString());
    const deadline = Date.now() + 2000;
    while (listCalls().length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(listCalls().length).toBeGreaterThan(0);

    await Store.updateOne(
      { _id: store._id },
      { $set: { 'shopify.shop': 'shop-b.myshopify.com' } }
    );
    release();
    const first = await pending;
    expect(first.ok).toBe(true);
    expect((await readFlags(store._id.toString()))?.webhooksRegisteredAt).toBeUndefined();

    postMock.mockClear();
    mockedAxios.create.mockClear();
    configureShopifyMock();
    const second = await registerOperationalWebhooksForStore(store._id.toString());

    expect(second.ok).toBe(true);
    expect(second.created).toBe(8);
    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://shop-b.myshopify.com/admin/api/2024-01',
        headers: expect.objectContaining({ 'X-Shopify-Access-Token': STORE_TOKEN }),
      })
    );
    expect((await readFlags(store._id.toString()))?.webhooksRegisteredAt).toBeInstanceOf(Date);
  });

  it('rejects an http callback URL before calling Shopify', async () => {
    process.env.SHOPIFY_WEBHOOK_URL = 'http://api.example.com/api/webhooks';
    const store = await createConnectedStore('http');

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(false);
    expect(result.errorSummary).toMatch(/https/);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('does not use an API_BASE_URL that is not an origin', async () => {
    delete process.env.SHOPIFY_WEBHOOK_URL;
    process.env.API_BASE_URL = 'https://api.example.com/api/v1';
    const store = await createConnectedStore('api-path');

    const result = await registerOperationalWebhooksForStore(store._id.toString());

    expect(result.ok).toBe(false);
    expect(result.errorSummary).toMatch(/API_BASE_URL/);
    expect(postMock).not.toHaveBeenCalled();
  });
});
