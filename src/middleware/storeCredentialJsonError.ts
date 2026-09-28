import { ErrorRequestHandler } from 'express';

/**
 * body-parser's JSON SyntaxError includes the raw request in `err.body` and a
 * snippet in `err.message`. A merchant pasting a .p8 into JSON hits that before
 * the route runs. Handle it here, for these paths only, so the global logger
 * never prints the key.
 */

const APPLE_INVALID =
  'Check the key ID and issuer ID, then upload the App Store Connect API key (.p8) again.';
const GOOGLE_INVALID = 'Upload the Google Play service account JSON file again.';
const GENERIC_INVALID = 'That key file could not be read. Upload the original key file.';

interface JsonParseError extends SyntaxError {
  type?: string;
  body?: unknown;
}

const isJsonParseError = (err: unknown): err is JsonParseError => {
  return typeof err === 'object'
    && err !== null
    && (err as JsonParseError).type === 'entity.parse.failed';
};

export const storeCredentialJsonErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (!path.includes('/store-credentials') || !isJsonParseError(err)) {
    next(err);
    return;
  }

  delete err.body;
  req.body = undefined;

  let error = GENERIC_INVALID;
  if (path.includes('/store-credentials/apple')) {
    error = APPLE_INVALID;
  } else if (path.includes('/store-credentials/google')) {
    error = GOOGLE_INVALID;
  }

  res.status(400).json({
    success: false,
    error,
    code: 'STORE_CREDENTIALS_INVALID',
  });
};
