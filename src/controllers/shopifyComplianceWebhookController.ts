import { Request, Response } from 'express';
import {
  getTrustedWebhookShopDomain,
  getTrustedWebhookStoreId,
} from '../middleware/shopifyWebhookAuth';
import {
  recordAppUninstalled,
  recordCustomerDataRequest,
  redactCustomer,
  redactShop,
} from '../services/shopifyComplianceService';

/**
 * Shopify mandatory compliance webhooks and app/uninstalled.
 *
 * HMAC verification and shop-to-store resolution run before these handlers.
 * A handler acknowledges with 200 after the store-scoped write, or with 500
 * when the write failed so Shopify retries an idempotent handler. Customer
 * payloads are not logged.
 */

type ComplianceHandler = (storeId: string, shopDomain: string, body: unknown) => Promise<void>;

type ComplianceTopic =
  | 'customers/data_request'
  | 'customers/redact'
  | 'shop/redact'
  | 'app/uninstalled';

const topicMatches = (req: Request, expected: ComplianceTopic): boolean => {
  const topic = req.get('X-Shopify-Topic');
  if (!topic) {
    return true;
  }
  return topic === expected;
};

const readComplianceContext = (
  req: Request,
  res: Response
): { storeId: string; shopDomain: string } | null => {
  const storeId = getTrustedWebhookStoreId(req);
  const shopDomain = getTrustedWebhookShopDomain(req);
  if (!storeId || !shopDomain) {
    console.error('Shopify compliance handler invoked without trusted store context');
    res.status(500).json({ error: 'Webhook store context missing' });
    return null;
  }
  return { storeId, shopDomain };
};

const runComplianceHandler = async (
  req: Request,
  res: Response,
  expected: ComplianceTopic,
  handler: ComplianceHandler
): Promise<void> => {
  const context = readComplianceContext(req, res);
  if (!context) {
    return;
  }
  if (!topicMatches(req, expected)) {
    console.warn(`Shopify compliance webhook ignored: topic does not match ${expected}`);
    res.status(200).json({ success: true });
    return;
  }

  try {
    await handler(context.storeId, context.shopDomain, req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(
      `Shopify ${expected} webhook failed:`,
      error instanceof Error ? error.name : 'unknown'
    );
    res.status(500).json({ error: 'Failed to process webhook' });
  }
};

export const handleCustomersDataRequest = async (req: Request, res: Response): Promise<void> => {
  await runComplianceHandler(req, res, 'customers/data_request', recordCustomerDataRequest);
};

export const handleCustomersRedact = async (req: Request, res: Response): Promise<void> => {
  await runComplianceHandler(req, res, 'customers/redact', redactCustomer);
};

export const handleShopRedact = async (req: Request, res: Response): Promise<void> => {
  await runComplianceHandler(req, res, 'shop/redact', (storeId, shopDomain) => redactShop(storeId, shopDomain));
};

export const handleAppUninstalled = async (req: Request, res: Response): Promise<void> => {
  await runComplianceHandler(req, res, 'app/uninstalled', (storeId, shopDomain) => {
    const rawTriggeredAt = req.get('X-Shopify-Triggered-At');
    const triggeredAt = rawTriggeredAt ? new Date(rawTriggeredAt) : null;
    return recordAppUninstalled(
      storeId,
      shopDomain,
      triggeredAt && !Number.isNaN(triggeredAt.getTime()) ? triggeredAt : null
    );
  });
};

/**
 * Single URI for the app-level `compliance_topics` subscription. The topic
 * comes from `X-Shopify-Topic`. `app/uninstalled` is accepted here too when
 * the Partner app points that topic at the same URL.
 */
export const handleComplianceDispatch = async (req: Request, res: Response): Promise<void> => {
  const topic = req.get('X-Shopify-Topic');
  if (topic === 'customers/data_request') {
    await handleCustomersDataRequest(req, res);
    return;
  }
  if (topic === 'customers/redact') {
    await handleCustomersRedact(req, res);
    return;
  }
  if (topic === 'shop/redact') {
    await handleShopRedact(req, res);
    return;
  }
  if (topic === 'app/uninstalled') {
    await handleAppUninstalled(req, res);
    return;
  }

  console.warn('Shopify compliance webhook ignored: unsupported topic');
  res.status(200).json({ success: true });
};
