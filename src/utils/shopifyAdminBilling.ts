/**
 * Shopify Admin billing and frozen-store failures.
 *
 * HTTP 402 is Shopify's "Payment Required" (the shop is frozen or its plan
 * is unpaid). Comparable Admin failures use the same merchant response:
 * a locked or forbidden response whose text is an unavailable or frozen shop,
 * and GraphQL `PAYMENT_REQUIRED`. These are not reconnect problems.
 *
 * The client payload is a fixed message. Callers must not attach the Shopify
 * body, request headers, or token.
 */

export const SHOPIFY_PAYMENT_REQUIRED_CODE = 'shopify_payment_required';

export const SHOPIFY_PAYMENT_REQUIRED_MESSAGE =
  "This store's Shopify billing needs to be updated before products and collections can load. Update it in Shopify, then try again.";

const BILLING_TEXT =
  /payment[_\s-]?required|unavailable shop|shop is unavailable|store is unavailable|shop is frozen|store is frozen|frozen shop|frozen store/i;

const NON_BILLING_STATUSES = new Set([401, 404, 429]);

export class ShopifyAdminBillingError extends Error {
  readonly statusCode = 402;
  readonly code = SHOPIFY_PAYMENT_REQUIRED_CODE;

  constructor(message: string = SHOPIFY_PAYMENT_REQUIRED_MESSAGE) {
    super(message);
    this.name = 'ShopifyAdminBillingError';
  }
}

export const shopifyAdminBillingErrorBody = (
  error: ShopifyAdminBillingError = new ShopifyAdminBillingError()
): {
  success: false;
  error: string;
  message: string;
  code: typeof SHOPIFY_PAYMENT_REQUIRED_CODE;
} => ({
  success: false,
  error: error.message,
  message: error.message,
  code: error.code,
});

const mentionsBillingFailure = (value: string): boolean => BILLING_TEXT.test(value);

/**
 * True for HTTP 402, and for other 4xx Admin responses whose status or body
 * text is an unavailable, frozen, or payment-required shop.
 * 401, 404, and 429 stay out of this bucket so revoked tokens and throttling
 * are not shown as a billing problem.
 */
export const isShopifyAdminBillingHttpFailure = (
  status: number,
  statusText = '',
  bodyText = ''
): boolean => {
  if (status === 402) {
    return true;
  }
  if (NON_BILLING_STATUSES.has(status) || status < 400 || status >= 500) {
    return false;
  }
  return mentionsBillingFailure(`${statusText} ${bodyText}`);
};

export const shopifyAdminBillingErrorFromHttp = (
  status: number,
  statusText?: string,
  bodyText?: string
): ShopifyAdminBillingError | null => {
  if (!isShopifyAdminBillingHttpFailure(status, statusText || '', bodyText || '')) {
    return null;
  }
  return new ShopifyAdminBillingError();
};

const graphqlCode = (entry: unknown): string => {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const code = (entry as { extensions?: { code?: unknown } }).extensions?.code;
  return typeof code === 'string' ? code : '';
};

const graphqlMessage = (entry: unknown): string => {
  if (typeof entry === 'string') {
    return entry;
  }
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const message = (entry as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
};

export const shopifyAdminBillingErrorFromGraphqlErrors = (
  errors: unknown
): ShopifyAdminBillingError | null => {
  if (!Array.isArray(errors)) {
    return null;
  }

  for (const entry of errors) {
    const code = graphqlCode(entry);
    const message = graphqlMessage(entry);
    if (code.toUpperCase() === 'PAYMENT_REQUIRED' || mentionsBillingFailure(`${code} ${message}`)) {
      return new ShopifyAdminBillingError();
    }
  }

  return null;
};

const responseBodySnippet = (data: unknown): string => {
  if (typeof data === 'string') {
    return data.slice(0, 500);
  }
  if (!data || typeof data !== 'object') {
    return '';
  }

  const errors = (data as { errors?: unknown }).errors;
  if (typeof errors === 'string') {
    return errors.slice(0, 500);
  }
  if (!Array.isArray(errors)) {
    return '';
  }

  const parts: string[] = [];
  for (const entry of errors) {
    const message = graphqlMessage(entry);
    const code = graphqlCode(entry);
    if (message) {
      parts.push(message);
    }
    if (code) {
      parts.push(code);
    }
  }
  return parts.join(' ').slice(0, 500);
};

/**
 * Map an Axios-style Admin failure to the billing error.
 * Returns the same instance when `error` is already a billing error.
 * Ignores values that are not HTTP responses.
 */
export const shopifyAdminBillingErrorFromUnknown = (
  error: unknown
): ShopifyAdminBillingError | null => {
  if (error instanceof ShopifyAdminBillingError) {
    return error;
  }
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return null;
  }

  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object') {
    return null;
  }

  const status = (response as { status?: unknown }).status;
  if (typeof status !== 'number') {
    return null;
  }

  const statusText = (response as { statusText?: unknown }).statusText;
  const data = (response as { data?: unknown }).data;
  return shopifyAdminBillingErrorFromHttp(
    status,
    typeof statusText === 'string' ? statusText : '',
    responseBodySnippet(data)
  );
};
