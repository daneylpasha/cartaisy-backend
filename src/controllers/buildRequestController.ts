import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { NotFoundError } from '../utils/errors';
import {
  BuildNotEligibleError,
  buildEligibilityErrorBody,
} from '../services/catalogSyncService';
import {
  BuildRequestValidationError,
  createStoreBuildRequest,
  getStoreBuildRequest,
  listPlatformBuildRequests,
  listStoreBuildRequests,
  updateBuildRequestPlatformStatus,
  updateStoreBuildRequestChecklist,
} from '../services/buildRequestService';

const sendBuildRequestError = (res: Response, error: unknown, fallback: string): void => {
  if (error instanceof BuildNotEligibleError) {
    res.status(409).json(buildEligibilityErrorBody(error));
    return;
  }
  if (error instanceof BuildRequestValidationError) {
    res.status(400).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({
      success: false,
      error: error.message,
    });
    return;
  }
  res.status(500).json({
    success: false,
    error: fallback,
  });
};

const requestIdFrom = (req: AuthenticatedRequest): string => {
  const id = (req.params as { id?: unknown }).id;
  return typeof id === 'string' ? id : '';
};

const requireStoreContext = (
  req: AuthenticatedRequest,
  res: Response
): { storeId: string; userId: string } | null => {
  if (!req.storeId || !req.user?._id) {
    res.status(401).json({
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

/**
 * POST /api/v1/build-requests
 * Store admin. Creates a tracked request for the authenticated store only.
 */
export const createBuildRequest = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const context = requireStoreContext(req, res);
  if (!context) {
    return;
  }

  try {
    const data = await createStoreBuildRequest({
      storeId: context.storeId,
      requestedBy: context.userId,
      body: req.body,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendBuildRequestError(res, error, 'Failed to create build request');
  }
};

/**
 * GET /api/v1/build-requests
 * Store admin. Lists requests for the authenticated store only.
 */
export const listBuildRequests = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const context = requireStoreContext(req, res);
  if (!context) {
    return;
  }

  try {
    const requests = await listStoreBuildRequests(context.storeId);
    res.status(200).json({
      success: true,
      data: {
        requests,
        count: requests.length,
      },
    });
  } catch (error) {
    sendBuildRequestError(res, error, 'Failed to list build requests');
  }
};

/**
 * GET /api/v1/build-requests/:id
 * Store admin. 404 when the request belongs to another store.
 */
export const getBuildRequest = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const context = requireStoreContext(req, res);
  if (!context) {
    return;
  }

  try {
    const data = await getStoreBuildRequest(context.storeId, requestIdFrom(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendBuildRequestError(res, error, 'Failed to load build request');
  }
};

/**
 * PATCH /api/v1/build-requests/:id
 * Store admin. Updates the short checklist only. Platform status is unchanged.
 */
export const updateBuildRequestChecklist = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const context = requireStoreContext(req, res);
  if (!context) {
    return;
  }

  try {
    const data = await updateStoreBuildRequestChecklist({
      storeId: context.storeId,
      requestId: requestIdFrom(req),
      body: req.body,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendBuildRequestError(res, error, 'Failed to update build request');
  }
};

/**
 * GET /api/v1/admin/build-requests
 * Platform operator. Lists requests across stores. Store owners cannot call this.
 */
export const listAdminBuildRequests = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await listPlatformBuildRequests(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendBuildRequestError(res, error, 'Failed to list build requests');
  }
};

/**
 * PATCH /api/v1/admin/build-requests/:id/status
 * Platform operator. Updates Android and/or iOS status. Store owners cannot call this.
 */
export const updateBuildRequestStatus = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await updateBuildRequestPlatformStatus({
      requestId: requestIdFrom(req),
      body: req.body,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendBuildRequestError(res, error, 'Failed to update build status');
  }
};
