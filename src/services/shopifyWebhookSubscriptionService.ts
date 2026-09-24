import { Types } from 'mongoose';
import Store from '../models/Store';
import { getShopifyClientForStore } from './shopifyService';

/**
 * Operational Shopify webhook subscriptions for one connected store.
 *
 * Compliance topics and `app/uninstalled` are app-level (issue #162) and are
 * not created here. These subscriptions are created with the store's Admin
 * token after OAuth. The callback paths match `src/routes/webhookRoutes.ts`,
 * mounted at `/api/webhooks` in `src/app.ts` (not under `/api/v1`).
 *
 * Registration lists existing subscriptions first and creates only the ones
 * whose topic and callback URL are missing. A failure is stored on the store
 * and is not thrown, so the OAuth callback can still succeed.
 */

const REGISTRATION_ERROR_MAX = 500;
const LIST_PAGE_SIZE = 50;
const MAX_LIST_PAGES = 20;
const ADMIN_REQUEST_TIMEOUT_MS = 10000;

export const OPERATIONAL_WEBHOOK_SUBSCRIPTIONS = [
  { topic: 'PRODUCTS_CREATE', name: 'products/create', path: '/shopify/products/create' },
  { topic: 'PRODUCTS_UPDATE', name: 'products/update', path: '/shopify/products/update' },
  { topic: 'PRODUCTS_DELETE', name: 'products/delete', path: '/shopify/products/delete' },
  { topic: 'ORDERS_CREATE', name: 'orders/create', path: '/shopify/orders/create' },
  { topic: 'ORDERS_UPDATED', name: 'orders/updated', path: '/shopify/orders/updated' },
  { topic: 'ORDERS_PAID', name: 'orders/paid', path: '/shopify/orders/paid' },
  { topic: 'INVENTORY_LEVELS_UPDATE', name: 'inventory_levels/update', path: '/shopify/inventory_levels/update' },
  { topic: 'CUSTOMERS_CREATE', name: 'customers/create', path: '/shopify/customers/create' },
] as const;

export type OperationalWebhookTopic = (typeof OPERATIONAL_WEBHOOK_SUBSCRIPTIONS)[number]['topic'];

export interface OperationalWebhookRegistrationResult {
  ok: boolean;
  created: number;
  alreadyPresent: number;
  failedTopics: string[];
  errorSummary?: string;
}

interface ListedWebhook {
  topic: string;
  callbackUrl: string;
}

interface WebhookMountResolution {
  ok: boolean;
  mount?: string;
  errorSummary?: string;
}

const LIST_QUERY = `
  query OperationalWebhookSubscriptions($cursor: String) {
    webhookSubscriptions(first: ${LIST_PAGE_SIZE}, after: $cursor) {
      edges {
        node {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CREATE_MUTATION = `
  mutation OperationalWebhookSubscriptionCreate(
    $topic: WebhookSubscriptionTopic!
    $webhookSubscription: WebhookSubscriptionInput!
  ) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        topic
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ALREADY_TAKEN = /already been taken/i;

const inFlightRegistrations = new Set<Promise<void>>();
/** Serializes registration for one store so a shop change cannot join the previous shop's run. */
const registrationTails = new Map<string, Promise<OperationalWebhookRegistrationResult>>();

const emptyResult = (
  errorSummary: string,
  failedTopics: string[] = []
): OperationalWebhookRegistrationResult => ({
  ok: false,
  created: 0,
  alreadyPresent: 0,
  failedTopics,
  errorSummary,
});

const clip = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().slice(0, REGISTRATION_ERROR_MAX);

const redact = (value: string): string =>
  clip(
    value
      .replace(/shpat_[A-Za-z0-9]+/g, '[redacted]')
      .replace(/shpss_[A-Za-z0-9]+/g, '[redacted]')
      .replace(/shpca_[A-Za-z0-9]+/g, '[redacted]')
      .replace(/shpua_[A-Za-z0-9]+/g, '[redacted]')
  );

const safeMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return redact(error.message);
  }
  return 'Webhook registration failed';
};

/**
 * Public callback mount for operational webhooks.
 * `SHOPIFY_WEBHOOK_URL` wins. It may be the API origin or the `/api/webhooks`
 * mount. Otherwise `API_BASE_URL`, then `RAILWAY_STATIC_URL`.
 */
export const resolveOperationalWebhookMount = (): WebhookMountResolution => {
  const explicit = (process.env.SHOPIFY_WEBHOOK_URL || '').trim();
  if (explicit) {
    const mount = normalizeWebhookMount(explicit);
    if (!mount) {
      return {
        ok: false,
        errorSummary: 'SHOPIFY_WEBHOOK_URL must be an https API origin or the /api/webhooks mount',
      };
    }
    return { ok: true, mount };
  }

  const apiBase = (process.env.API_BASE_URL || '').trim();
  if (apiBase) {
    const mount = normalizeWebhookMount(apiBase);
    if (mount) {
      return { ok: true, mount };
    }
    return {
      ok: false,
      errorSummary: 'API_BASE_URL must be an https origin when SHOPIFY_WEBHOOK_URL is unset',
    };
  }

  const railway = (process.env.RAILWAY_STATIC_URL || '').trim().replace(/^https?:\/\//, '');
  const railwayHost = railway.replace(/\/+$/, '');
  if (railwayHost && !railwayHost.includes('/')) {
    return { ok: true, mount: `https://${railwayHost}/api/webhooks` };
  }

  return { ok: false, errorSummary: 'Webhook callback URL is not configured' };
};

export const operationalWebhookCallbackUrl = (path: string, mount: string): string =>
  `${mount.replace(/\/+$/, '')}${path}`;

export const sameWebhookCallback = (left: string, right: string): boolean => {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const pathname = (value: string) => value.replace(/\/+$/, '') || '/';
    return a.origin === b.origin && pathname(a.pathname) === pathname(b.pathname);
  } catch {
    return left.trim().replace(/\/+$/, '') === right.trim().replace(/\/+$/, '');
  }
};

const normalizeWebhookMount = (raw: string): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') {
    return null;
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  if (path === '' || path === '/' || path === '/api/webhooks') {
    return `${parsed.origin}/api/webhooks`;
  }
  return null;
};

const messagesFrom = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || !('message' in item)) {
        return '';
      }
      const message = (item as { message?: unknown }).message;
      return typeof message === 'string' ? message : '';
    })
    .filter((message) => message.length > 0);
};

const isAlreadyTaken = (messages: string[]): boolean =>
  messages.some((message) => ALREADY_TAKEN.test(message));

const connectedShopFilter = (storeId: string, shop: string) => ({
  _id: storeId,
  'shopify.isConnected': true,
  'shopify.shop': shop,
});

const readConnectedShop = async (storeId: string): Promise<string | null> => {
  const store = await Store.findById(storeId).select('shopify.shop shopify.isConnected');
  const shop = store?.shopify?.isConnected ? (store.shopify.shop || '').trim() : '';
  return shop || null;
};

const persistOutcome = async (
  storeId: string,
  shop: string,
  result: OperationalWebhookRegistrationResult
): Promise<void> => {
  const connected = connectedShopFilter(storeId, shop);
  if (result.ok) {
    await Store.updateOne(connected, {
      $set: { 'shopify.webhooksRegisteredAt': new Date() },
      $unset: { 'shopify.webhookRegistrationError': '' },
    });
    return;
  }

  await Store.updateOne(connected, {
    $unset: { 'shopify.webhooksRegisteredAt': '' },
    $set: {
      'shopify.webhookRegistrationError': redact(
        result.errorSummary || 'Webhook registration failed'
      ),
    },
  });
};

const readListPage = (
  payload: unknown
): { webhooks: ListedWebhook[]; hasNextPage: boolean; endCursor: string | null } | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const data = (payload as { data?: unknown }).data;
  const connection = data && typeof data === 'object'
    ? (data as { webhookSubscriptions?: unknown }).webhookSubscriptions
    : undefined;
  if (!connection || typeof connection !== 'object') {
    return null;
  }

  const edges = (connection as { edges?: unknown }).edges;
  const pageInfo = (connection as { pageInfo?: { hasNextPage?: unknown; endCursor?: unknown } }).pageInfo;
  const webhooks: ListedWebhook[] = [];
  if (Array.isArray(edges)) {
    for (const edge of edges) {
      const node = edge && typeof edge === 'object' ? (edge as { node?: unknown }).node : undefined;
      if (!node || typeof node !== 'object') {
        continue;
      }
      const topic = (node as { topic?: unknown }).topic;
      const endpoint = (node as { endpoint?: { callbackUrl?: unknown } }).endpoint;
      const callbackUrl = endpoint?.callbackUrl;
      if (typeof topic === 'string' && typeof callbackUrl === 'string' && callbackUrl) {
        webhooks.push({ topic, callbackUrl });
      }
    }
  }

  const hasNextPage = pageInfo?.hasNextPage === true;
  const endCursor = typeof pageInfo?.endCursor === 'string' ? pageInfo.endCursor : null;
  return { webhooks, hasNextPage, endCursor };
};

const listOperationalWebhooks = async (
  client: { post: (url: string, body: unknown, config?: { timeout: number }) => Promise<{ data?: unknown }> }
): Promise<{ ok: true; webhooks: ListedWebhook[] } | { ok: false; errorSummary: string }> => {
  const webhooks: ListedWebhook[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    let response: { data?: unknown };
    try {
      response = await client.post(
        '/graphql.json',
        { query: LIST_QUERY, variables: { cursor } },
        { timeout: ADMIN_REQUEST_TIMEOUT_MS }
      );
    } catch (error) {
      return { ok: false, errorSummary: `Failed to list Shopify webhook subscriptions: ${safeMessage(error)}` };
    }

    const topLevelErrors = messagesFrom(
      response.data && typeof response.data === 'object'
        ? (response.data as { errors?: unknown }).errors
        : undefined
    );
    if (topLevelErrors.length > 0) {
      return {
        ok: false,
        errorSummary: `Failed to list Shopify webhook subscriptions: ${redact(topLevelErrors[0])}`,
      };
    }

    const parsed = readListPage(response.data);
    if (!parsed) {
      return { ok: false, errorSummary: 'Failed to list Shopify webhook subscriptions' };
    }
    webhooks.push(...parsed.webhooks);
    if (!parsed.hasNextPage || !parsed.endCursor) {
      return { ok: true, webhooks };
    }
    cursor = parsed.endCursor;
  }

  return { ok: false, errorSummary: 'Failed to list Shopify webhook subscriptions' };
};

const failureDetail = (messages: string[]): string | undefined => {
  const detail = messages.find((message) => !ALREADY_TAKEN.test(message));
  return detail ? redact(detail) : undefined;
};

const createOperationalWebhook = async (
  client: { post: (url: string, body: unknown, config?: { timeout: number }) => Promise<{ data?: unknown }> },
  topic: OperationalWebhookTopic,
  callbackUrl: string
): Promise<{ outcome: 'created' | 'present' | 'failed'; detail?: string }> => {
  let response: { data?: unknown };
  try {
    response = await client.post(
      '/graphql.json',
      {
        query: CREATE_MUTATION,
        variables: {
          topic,
          webhookSubscription: {
            callbackUrl,
            format: 'JSON',
          },
        },
      },
      { timeout: ADMIN_REQUEST_TIMEOUT_MS }
    );
  } catch (error) {
    const axiosData = error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { data?: unknown } }).response?.data
      : undefined;
    const nested = axiosData && typeof axiosData === 'object'
      ? (axiosData as { data?: { webhookSubscriptionCreate?: { userErrors?: unknown } }; errors?: unknown })
      : undefined;
    const messages = [
      ...messagesFrom(nested?.errors),
      ...messagesFrom(nested?.data?.webhookSubscriptionCreate?.userErrors),
    ];
    if (isAlreadyTaken(messages)) {
      return { outcome: 'present' };
    }
    return { outcome: 'failed', detail: failureDetail(messages) || safeMessage(error) };
  }

  const body = response.data && typeof response.data === 'object'
    ? response.data as {
      errors?: unknown;
      data?: { webhookSubscriptionCreate?: { userErrors?: unknown; webhookSubscription?: { id?: unknown } } };
    }
    : undefined;
  const userErrors = messagesFrom(body?.data?.webhookSubscriptionCreate?.userErrors);
  const topLevelErrors = messagesFrom(body?.errors);
  const messages = [...userErrors, ...topLevelErrors];
  if (isAlreadyTaken(messages)) {
    return { outcome: 'present' };
  }
  if (messages.length > 0) {
    return { outcome: 'failed', detail: failureDetail(messages) };
  }
  const createdId = body?.data?.webhookSubscriptionCreate?.webhookSubscription?.id;
  return typeof createdId === 'string' && createdId
    ? { outcome: 'created' }
    : { outcome: 'failed', detail: 'Shopify did not return a webhook subscription' };
};

const registerOperationalWebhooks = async (
  storeId: string
): Promise<OperationalWebhookRegistrationResult> => {
  const shop = await readConnectedShop(storeId);
  if (!shop) {
    return emptyResult('Store is not connected to Shopify');
  }

  try {
    return await registerConnectedShopWebhooks(storeId, shop);
  } catch (error: unknown) {
    const result = emptyResult(safeMessage(error));
    await persistOutcome(storeId, shop, result).catch(() => undefined);
    return result;
  }
};

const registerConnectedShopWebhooks = async (
  storeId: string,
  shop: string
): Promise<OperationalWebhookRegistrationResult> => {
  const mount = resolveOperationalWebhookMount();
  if (!mount.ok || !mount.mount) {
    const result = emptyResult(mount.errorSummary || 'Webhook callback URL is not configured');
    await persistOutcome(storeId, shop, result);
    return result;
  }

  const client = await getShopifyClientForStore(storeId);
  if (!client) {
    const result = emptyResult('Store is not connected to Shopify');
    await persistOutcome(storeId, shop, result);
    return result;
  }

  await Store.updateOne(
    connectedShopFilter(storeId, shop),
    {
      $unset: {
        'shopify.webhooksRegisteredAt': '',
        'shopify.webhookRegistrationError': '',
      },
    }
  );

  const listed = await listOperationalWebhooks(client);
  if (listed.ok === false) {
    const result = emptyResult(listed.errorSummary);
    await persistOutcome(storeId, shop, result);
    return result;
  }

  const missing = OPERATIONAL_WEBHOOK_SUBSCRIPTIONS.filter((subscription) => {
    const callbackUrl = operationalWebhookCallbackUrl(subscription.path, mount.mount as string);
    return !listed.webhooks.some(
      (existing) => existing.topic === subscription.topic && sameWebhookCallback(existing.callbackUrl, callbackUrl)
    );
  });

  const alreadyPresent = OPERATIONAL_WEBHOOK_SUBSCRIPTIONS.length - missing.length;
  const outcomes = await Promise.all(
    missing.map(async (subscription) => {
      const callbackUrl = operationalWebhookCallbackUrl(subscription.path, mount.mount as string);
      const createdWebhook = await createOperationalWebhook(client, subscription.topic, callbackUrl);
      return { name: subscription.name, ...createdWebhook };
    })
  );

  const created = outcomes.filter((outcome) => outcome.outcome === 'created').length;
  const presentFromCreate = outcomes.filter((outcome) => outcome.outcome === 'present').length;
  const failed = outcomes.filter((outcome) => outcome.outcome === 'failed');
  const failedTopics = failed.map((outcome) => outcome.name);

  if (failedTopics.length > 0) {
    const described = failed.map((outcome) =>
      outcome.detail ? `${outcome.name} (${outcome.detail})` : outcome.name
    );
    const result: OperationalWebhookRegistrationResult = {
      ok: false,
      created,
      alreadyPresent: alreadyPresent + presentFromCreate,
      failedTopics,
      errorSummary: `Failed to register Shopify webhooks: ${described.join(', ')}`,
    };
    await persistOutcome(storeId, shop, result);
    return result;
  }

  const result: OperationalWebhookRegistrationResult = {
    ok: true,
    created,
    alreadyPresent: alreadyPresent + presentFromCreate,
    failedTopics: [],
  };
  await persistOutcome(storeId, shop, result);
  return result;
};

/**
 * Register or reconcile operational webhook subscriptions for one store.
 * Runs for a store are serialized. A later connect to a different shop does
 * not reuse the previous shop's run, and writes match `shopify.shop`.
 * Does not throw.
 */
export const registerOperationalWebhooksForStore = (
  storeId: string
): Promise<OperationalWebhookRegistrationResult> => {
  if (!storeId || !Types.ObjectId.isValid(storeId)) {
    return Promise.resolve(emptyResult('Invalid store id'));
  }

  const previous = registrationTails.get(storeId) ?? Promise.resolve(emptyResult('pending'));
  const run = previous.then(
    () => registerOperationalWebhooks(storeId),
    () => registerOperationalWebhooks(storeId)
  );
  registrationTails.set(storeId, run);
  void run.finally(() => {
    if (registrationTails.get(storeId) === run) {
      registrationTails.delete(storeId);
    }
  });
  return run;
};

/**
 * Start registration after the Admin token is saved. Returns immediately.
 * The OAuth response does not wait on Shopify, and a later failure only
 * updates `shopify.webhookRegistrationError`.
 */
export const startOperationalWebhookRegistration = (storeId: string): void => {
  const run = registerOperationalWebhooksForStore(storeId)
    .then((result) => {
      if (!result.ok) {
        console.error(
          `[Shopify webhooks] Registration incomplete for store ${storeId}: ${result.errorSummary || 'unknown'}`
        );
        return;
      }
      console.log(
        `[Shopify webhooks] Store ${storeId} subscriptions ready (${result.created} created, ${result.alreadyPresent} already present)`
      );
    })
    .catch((error: unknown) => {
      console.error(
        `[Shopify webhooks] Registration error for store ${storeId}: ${safeMessage(error)}`
      );
    });

  const tracked = run.then(
    () => undefined,
    () => undefined
  );
  inFlightRegistrations.add(tracked);
  void tracked.finally(() => {
    inFlightRegistrations.delete(tracked);
  });
};

/** Resolves when every detached registration started so far has finished. */
export const settleInFlightOperationalWebhookRegistrations = async (): Promise<void> => {
  let snapshot = [...inFlightRegistrations];
  while (snapshot.length > 0) {
    await Promise.all(snapshot);
    snapshot = [...inFlightRegistrations].filter((run) => !snapshot.includes(run));
  }
};
