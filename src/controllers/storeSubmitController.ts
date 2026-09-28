import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { NotFoundError } from '../utils/errors';
import { responseContainsCredentialSecret } from '../services/storeCredentialsService';
import {
  getStoreSubmit,
  listStoreSubmits,
  startStoreSubmit,
  StoreSubmitError,
} from '../services/easSubmitService';
import { hasTokenShapedText } from '../utils/expoInstallUrl';

const START_FAILED = 'The store submit could not be started. Try again in a few minutes.';
const LOAD_FAILED = 'Store submit could not be loaded. Try again.';

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

const leaksSecret = (body: unknown): boolean => {
  if (responseContainsCredentialSecret(body)) {
    return true;
  }
  let json = '';
  try {
    json = JSON.stringify(body);
  } catch {
    return true;
  }
  if (hasTokenShapedText(json) || json.includes('BEGIN PRIVATE KEY') || json.includes('keyP8')) {
    return true;
  }
  const token = process.env.EXPO_TOKEN?.trim();
  return Boolean(token && token.length >= 8 && json.includes(token));
};

const sendJson = (res: Response, status: number, body: unknown): void => {
  if (leaksSecret(body)) {
    res.status(500).json({
      success: false,
      error: LOAD_FAILED,
    });
    return;
  }
  res.status(status).json(body);
};

const sendSubmitError = (res: Response, error: unknown, fallback: string): void => {
  if (error instanceof StoreSubmitError) {
    const body: {
      success: false;
      error: string;
      code: string;
      data?: unknown;
    } = {
      success: false,
      error: error.message,
      code: error.code,
    };
    if (error.job) {
      body.data = error.job;
    }
    sendJson(res, error.statusCode, body);
    return;
  }
  if (error instanceof NotFoundError) {
    sendJson(res, 404, {
      success: false,
      error: error.message,
    });
    return;
  }
  sendJson(res, 500, {
    success: false,
    error: fallback,
  });
};

const requestIdFrom = (req: AuthenticatedRequest): string => {
  const id = (req.params as { id?: unknown }).id;
  return typeof id === 'string' ? id : '';
};

const platformFrom = (req: AuthenticatedRequest): string => {
  const platform = (req.params as { platform?: unknown }).platform;
  return typeof platform === 'string' ? platform : '';
};

/**
 * POST /api/v1/build-requests/:id/submits
 * Store admin. Submits one finished platform for the authenticated store.
 */
export const createStoreSubmit = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const context = requireStoreContext(req, res);
  if (!context) {
    return;
  }
  try {
    const data = await startStoreSubmit({
      storeId: context.storeId,
      userId: context.userId,
      buildRequestId: requestIdFrom(req),
      body: req.body,
    });
    sendJson(res, 201, { success: true, data });
  } catch (error) {
    sendSubmitError(res, error, START_FAILED);
  }
};

/**
 * GET /api/v1/build-requests/:id/submits
 * Store admin. Latest submit per platform. Refreshes in-flight jobs.
 */
export const listStoreSubmitStatus = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const context = requireStoreContext(req, res);
  if (!context) {
    return;
  }
  try {
    const submits = await listStoreSubmits({
      storeId: context.storeId,
      buildRequestId: requestIdFrom(req),
    });
    sendJson(res, 200, { success: true, data: { submits } });
  } catch (error) {
    sendSubmitError(res, error, LOAD_FAILED);
  }
};

/**
 * GET /api/v1/build-requests/:id/submits/:platform
 * Store admin. Polls EAS when the latest job is still in flight.
 */
export const getStoreSubmitStatus = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const context = requireStoreContext(req, res);
  if (!context) {
    return;
  }
  try {
    const data = await getStoreSubmit({
      storeId: context.storeId,
      buildRequestId: requestIdFrom(req),
      platform: platformFrom(req),
    });
    sendJson(res, 200, { success: true, data });
  } catch (error) {
    sendSubmitError(res, error, LOAD_FAILED);
  }
};
