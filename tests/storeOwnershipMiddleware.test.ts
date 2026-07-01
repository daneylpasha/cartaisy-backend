import { NextFunction, Response } from 'express';
import { Types } from 'mongoose';
import { requireOwnedStoreParam } from '../src/middleware/storeOwnership';
import User from '../src/models/User';
import { AuthenticatedRequest } from '../src/types';

jest.mock('../src/models/User', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

const mockedUser = User as jest.Mocked<typeof User>;

const ownedStoreId = new Types.ObjectId();
const otherStoreId = new Types.ObjectId();
const userId = new Types.ObjectId();

const mockUserLookup = (user: { storeId?: Types.ObjectId; role: string; isActive: boolean }) => {
  mockedUser.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue(user),
  } as any);
};

const createRequest = (storeId: string): AuthenticatedRequest => ({
  params: { storeId },
  user: {
    _id: userId,
    id: userId.toString(),
    storeId: ownedStoreId,
    email: 'admin@example.com',
    role: 'admin',
    name: 'Admin User',
    isActive: true,
    isVerified: true,
    createdAt: new Date(),
  },
} as unknown as AuthenticatedRequest);

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

describe('requireOwnedStoreParam', () => {
  beforeEach(() => {
    mockedUser.findById.mockReset();
  });

  it('allows admins to access their owned store and sets req.storeId from the route param', async () => {
    mockUserLookup({ storeId: ownedStoreId, role: 'admin', isActive: true });
    const req = createRequest(ownedStoreId.toString());
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreParam()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.storeId).toBe(ownedStoreId.toString());
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects admins who request a different store with 403', async () => {
    mockUserLookup({ storeId: ownedStoreId, role: 'admin', isActive: true });
    const req = createRequest(otherStoreId.toString());
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreParam()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Store access denied',
    });
  });

  it('allows super admins to target the requested store and uses that store as req.storeId', async () => {
    mockUserLookup({ role: 'super_admin', isActive: true });
    const req = createRequest(otherStoreId.toString());
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreParam()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.storeId).toBe(otherStoreId.toString());
    expect(req.storeId).not.toBe(ownedStoreId.toString());
    expect(res.status).not.toHaveBeenCalled();
  });
});
