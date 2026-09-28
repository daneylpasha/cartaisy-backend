import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { NotFoundError } from '../utils/errors';
import {
  disconnectAppleCredentials,
  disconnectGoogleCredentials,
  getAdminStoreCredentialsStatus,
  getStoreCredentialsStatus,
  responseContainsCredentialSecret,
  saveAppleCredentials,
  saveGoogleCredentials,
  StoreCredentialsValidationError,
} from '../services/storeCredentialsService';

const SAVE_FAILED = 'Those credentials could not be saved. Try again.';
const LOAD_FAILED = 'Store credentials could not be loaded. Try again.';
const REMOVE_FAILED = 'Those credentials could not be removed. Try again.';
const SECRET_QUERY =
  'Send the key in the request body or as a file. Do not put it in the URL.';

const QUERY_SECRET_KEYS = ['privatekey', 'private_key', 'serviceaccount', 'credentials', 'pem'];

const requireStoreContext = (
  req: AuthenticatedRequest,
  res: Response
): { storeId: string; userId: string } | null => {
  if (!req.storeId || !req.user?._id) {
    sendJson(res, 401, {
      success: false,
      error: 'Store authentication required',
    });
    return null;
  }
  return {
    storeId: req.storeId.toString(),
    userId: req.user._id.toString(),
  };
};

const sendJson = (res: Response, status: number, body: unknown): void => {
  if (responseContainsCredentialSecret(body)) {
    res.status(500).json({
      success: false,
      error: LOAD_FAILED,
    });
    return;
  }
  res.status(status).json(body);
};

const sendCredentialError = (res: Response, error: unknown, fallback: string): void => {
  if (error instanceof StoreCredentialsValidationError) {
    sendJson(res, error.statusCode, {
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }
  if (error instanceof NotFoundError) {
    sendJson(res, 404, {
      success: false,
      error: 'Store not found',
    });
    return;
  }
  sendJson(res, 500, {
    success: false,
    error: fallback,
  });
};

const rejectSecretQuery = (req: AuthenticatedRequest, res: Response): boolean => {
  const query = req.query as Record<string, unknown>;
  const keys = Object.keys(query);
  const hasSecret = keys.some(key =>
    QUERY_SECRET_KEYS.some(field => key.toLowerCase().includes(field))
  );
  if (!hasSecret) {
    return false;
  }
  sendJson(res, 400, {
    success: false,
    error: SECRET_QUERY,
    code: 'STORE_CREDENTIALS_INVALID',
  });
  return true;
};

const readUploadText = (req: AuthenticatedRequest): string | undefined => {
  const file = req.file;
  if (!file?.buffer || file.buffer.length === 0) {
    return undefined;
  }
  return file.buffer.toString('utf8');
};

/**
 * Replace the body and wipe the upload buffer before the audit logger reads
 * them. The logger runs on `res.json` via `setImmediate`, so this must run
 * before that callback.
 */
const discardSubmittedSecrets = (req: AuthenticatedRequest): void => {
  req.body = { redacted: true };
  const file = req.file;
  if (file?.buffer) {
    file.buffer.fill(0);
  }
  if (file) {
    file.originalname = '';
  }
};

/**
 * GET /api/v1/store-credentials
 * Store admin. Status and safe metadata for the authenticated store only.
 */
export const getCredentials = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const context = requireStoreContext(req, res);
  if (!context) {
    return;
  }

  try {
    const data = await getStoreCredentialsStatus(context.storeId);
    sendJson(res, 200, { success: true, data });
  } catch (error) {
    sendCredentialError(res, error, LOAD_FAILED);
  }
};

/**
 * POST /api/v1/store-credentials/apple
 * Store admin. Upserts the App Store Connect API key for the authenticated store.
 */
export const upsertApple = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (rejectSecretQuery(req, res)) {
      return;
    }
    const context = requireStoreContext(req, res);
    if (!context) {
      return;
    }
    const data = await saveAppleCredentials({
      storeId: context.storeId,
      userId: context.userId,
      body: req.body,
      fileText: readUploadText(req),
    });
    sendJson(res, 200, { success: true, data });
  } catch (error) {
    sendCredentialError(res, error, SAVE_FAILED);
  } finally {
    discardSubmittedSecrets(req);
  }
};

/**
 * POST /api/v1/store-credentials/google
 * Store admin. Upserts the Google Play service account for the authenticated store.
 */
export const upsertGoogle = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (rejectSecretQuery(req, res)) {
      return;
    }
    const context = requireStoreContext(req, res);
    if (!context) {
      return;
    }
    const data = await saveGoogleCredentials({
      storeId: context.storeId,
      userId: context.userId,
      body: req.body,
      fileText: readUploadText(req),
    });
    sendJson(res, 200, { success: true, data });
  } catch (error) {
    sendCredentialError(res, error, SAVE_FAILED);
  } finally {
    discardSubmittedSecrets(req);
  }
};

/**
 * DELETE /api/v1/store-credentials/apple
 * Store admin. Removes Apple credentials for the authenticated store.
 */
export const deleteApple = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const context = requireStoreContext(req, res);
  if (!context) {
    return;
  }

  try {
    const data = await disconnectAppleCredentials(context.storeId);
    sendJson(res, 200, { success: true, data });
  } catch (error) {
    sendCredentialError(res, error, REMOVE_FAILED);
  }
};

/**
 * DELETE /api/v1/store-credentials/google
 * Store admin. Removes Google Play credentials for the authenticated store.
 */
export const deleteGoogle = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const context = requireStoreContext(req, res);
  if (!context) {
    return;
  }

  try {
    const data = await disconnectGoogleCredentials(context.storeId);
    sendJson(res, 200, { success: true, data });
  } catch (error) {
    sendCredentialError(res, error, REMOVE_FAILED);
  }
};

/**
 * GET /api/v1/admin/store-credentials/:storeId
 * Platform operator. Status only, for the store id in the path.
 */
export const getAdminCredentials = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const storeIdParam = (req.params as { storeId?: unknown }).storeId;
  const storeId = typeof storeIdParam === 'string' ? storeIdParam : '';

  try {
    const data = await getAdminStoreCredentialsStatus(storeId);
    sendJson(res, 200, { success: true, data });
  } catch (error) {
    sendCredentialError(res, error, LOAD_FAILED);
  }
};
