import { Response } from 'express';
import { Types } from 'mongoose';
import Store from '../models/Store';
import User, { IUserDocument } from '../models/User';
import { AuthenticatedRequest } from '../types';
import {
  MAX_MERCHANT_STORES,
  buildStoreSlug,
  explicitStoreIds,
  membershipStoreIds,
  normalizeStoreId,
  persistStoreMembership,
} from '../utils/storeMembership';

type AuthRequest = AuthenticatedRequest;

const TOKEN_SHAPED_URL = /shpat_|shpss_|shpca_|shpct_|shpua_|access_token|bearer\s/i;

const safeImageUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!/^https?:\/\/.+/i.test(trimmed) || TOKEN_SHAPED_URL.test(trimmed)) {
    return undefined;
  }
  return trimmed;
};

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

const storeAccessDenied = (res: Response): void => {
  res.status(403).json({
    status: 'error',
    message: 'Store access denied',
  });
};

const loadCaller = async (req: AuthRequest, res: Response): Promise<IUserDocument | null> => {
  if (!req.user) {
    res.status(401).json({
      status: 'error',
      message: 'User not authenticated',
    });
    return null;
  }

  const user = await User.findById(req.user._id);
  if (!user || !user.isActive) {
    res.status(401).json({
      status: 'error',
      message: 'User not authenticated',
    });
    return null;
  }

  await persistStoreMembership(user);
  return user;
};

const userStoreFields = async (user: {
  _id: unknown;
  storeId?: unknown;
  storeIds?: unknown;
}): Promise<{
  id: unknown;
  storeId: unknown;
  storeIds: string[];
  storeName: string;
}> => {
  const storeId = normalizeStoreId(user.storeId);
  let storeName = '';
  if (storeId) {
    const store = await Store.findById(storeId).select('name');
    storeName = store?.name || '';
  }

  return {
    id: user._id,
    storeId: storeId ?? user.storeId,
    storeIds: membershipStoreIds(user),
    storeName,
  };
};

/**
 * Stores the caller may open. Never returns another tenant or credential fields.
 * GET /api/v1/auth/stores
 */
export const listMerchantStores = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await loadCaller(req, res);
    if (!user) {
      return;
    }

    const ids = membershipStoreIds(user);
    const stores = ids.length
      ? await Store.find({ _id: { $in: ids } })
          .select('name slug branding.logoUrl branding.iconUrl')
          .lean()
      : [];

    const byId = new Map(stores.map(store => [store._id.toString(), store]));
    const visible = ids.flatMap(id => {
      const store = byId.get(id);
      if (!store) {
        return [];
      }
      const logoUrl = safeImageUrl(store.branding?.logoUrl);
      const iconUrl = safeImageUrl(store.branding?.iconUrl);
      return [
        {
          id: store._id.toString(),
          name: store.name,
          slug: store.slug,
          ...(logoUrl ? { logoUrl } : {}),
          ...(iconUrl ? { iconUrl } : {}),
        },
      ];
    });

    res.status(200).json({
      status: 'success',
      data: {
        activeStoreId: normalizeStoreId(user.storeId),
        stores: visible,
      },
    });
  } catch (error) {
    console.error('List merchant stores error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to list stores. Please try again.',
    });
  }
};

/**
 * Set the active store when it is already in membership.
 * Does not issue a new access or refresh token.
 * POST /api/v1/auth/stores/switch
 */
export const switchActiveStore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await loadCaller(req, res);
    if (!user) {
      return;
    }

    const body = (req.body ?? {}) as { storeId?: unknown };
    const requested = normalizeStoreId(body.storeId);
    if (!requested) {
      res.status(400).json({
        status: 'error',
        message: 'A valid storeId is required',
      });
      return;
    }

    if (!membershipStoreIds(user).includes(requested)) {
      storeAccessDenied(res);
      return;
    }

    const target = await Store.findById(requested).select('_id');
    if (!target) {
      res.status(404).json({
        status: 'error',
        message: 'Store not found',
      });
      return;
    }

    user.storeId = new Types.ObjectId(requested);
    try {
      await user.save({ validateBeforeSave: false });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        res.status(409).json({
          status: 'error',
          message: 'That store is already linked to another account with this email',
        });
        return;
      }
      throw error;
    }

    res.status(200).json({
      status: 'success',
      message: 'Active store updated',
      data: {
        user: await userStoreFields(user),
      },
    });
  } catch (error) {
    console.error('Switch active store error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to switch store. Please try again.',
    });
  }
};

const SLUG_SAVE_ATTEMPTS = 3;

/**
 * Store owners can open another store on the same user.
 * A store owner is a `super_admin` who already belongs to at least one store.
 * The new store is blank: nothing is copied from the current app.
 * Appends membership, makes the new store active, and does not issue tokens.
 * POST /api/v1/auth/stores
 */
export const createMerchantStore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await loadCaller(req, res);
    if (!user) {
      return;
    }

    const membership = membershipStoreIds(user);
    if (user.role !== 'super_admin' || membership.length === 0) {
      res.status(403).json({
        status: 'error',
        message: 'Only a store owner can create a store',
      });
      return;
    }

    if (membership.length >= MAX_MERCHANT_STORES) {
      res.status(400).json({
        status: 'error',
        message: `A merchant account can have at most ${MAX_MERCHANT_STORES} stores`,
      });
      return;
    }

    const body = (req.body ?? {}) as { storeName?: unknown; name?: unknown };
    const rawName = typeof body.storeName === 'string'
      ? body.storeName
      : typeof body.name === 'string'
        ? body.name
        : '';
    const storeName = rawName.trim();
    if (!storeName) {
      res.status(400).json({
        status: 'error',
        message: 'Store name is required',
      });
      return;
    }
    if (storeName.length < 2 || storeName.length > 100) {
      res.status(400).json({
        status: 'error',
        message: 'storeName must be between 2 and 100 characters',
      });
      return;
    }

    let created: { _id: Types.ObjectId; name: string; slug: string } | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < SLUG_SAVE_ATTEMPTS; attempt += 1) {
      try {
        // Fresh signup store. Do not read or copy the caller's current store.
        const store = new Store({
          name: storeName,
          slug: buildStoreSlug(storeName),
          isActive: true,
          plan: {
            type: 'free',
            maxMembers: 5,
          },
          settings: {
            timezone: 'UTC',
            currency: 'USD',
            language: 'en',
          },
          shopify: {
            isConnected: false,
          },
        });
        await store.save();
        created = store;
        break;
      } catch (error) {
        lastError = error;
        if (!isDuplicateKeyError(error) || attempt === SLUG_SAVE_ATTEMPTS - 1) {
          break;
        }
      }
    }

    if (!created) {
      console.error('Create merchant store error:', lastError);
      res.status(400).json({
        status: 'error',
        message: 'Store creation failed. Please try again.',
      });
      return;
    }

    const nextIds = explicitStoreIds(user).filter(id => id !== created._id.toString());
    if (nextIds.length === 0) {
      const active = normalizeStoreId(user.storeId);
      if (active && active !== created._id.toString()) {
        nextIds.push(active);
      }
    }
    nextIds.push(created._id.toString());

    user.storeIds = nextIds.map(id => new Types.ObjectId(id));
    user.storeId = created._id;

    try {
      await user.save({ validateBeforeSave: false });
    } catch (error) {
      await Store.deleteOne({ _id: created._id });
      console.error('Create merchant store membership error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Store creation failed. Please try again.',
      });
      return;
    }

    res.status(201).json({
      status: 'success',
      message: 'Store created',
      data: {
        store: {
          id: created._id.toString(),
          name: created.name,
          slug: created.slug,
        },
        user: await userStoreFields(user),
      },
    });
  } catch (error) {
    console.error('Create merchant store error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Store creation failed. Please try again.',
    });
  }
};
