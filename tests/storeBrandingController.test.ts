import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { updateStoreBranding } from '../src/controllers/admin/storeBrandingController';
import Store from '../src/models/Store';

/**
 * Covers updateStoreBranding's three-way per-field contract added to close
 * cartaisy-dashboard PR #13's disclosed known gap: absent = leave alone,
 * valid hex = set, explicit JSON `null` = clear (`$unset`), anything else
 * falsy = 400.
 *
 * Mirrors tests/storeConfigController.test.ts's pattern: mock the Store
 * model directly and call the controller function with fake req/res, no
 * real DB needed.
 */
jest.mock('../src/models/Store', () => ({
  __esModule: true,
  default: {
    findByIdAndUpdate: jest.fn(),
  },
}));

const mockedStore = Store as jest.Mocked<typeof Store>;

const storeId = new Types.ObjectId().toString();

const createRequest = (params: Record<string, string>, body: unknown): Request =>
  ({ params, body }) as unknown as Request;

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

/**
 * The controller reads through
 * `Store.findByIdAndUpdate(...).select('branding name')`, so the value
 * handed to this helper is the document that call resolves to (already
 * reflecting whatever $set/$unset would have applied).
 */
const mockUpdateResult = (document: unknown) => {
  const select = jest.fn().mockResolvedValue(document);
  mockedStore.findByIdAndUpdate.mockReturnValue({ select } as any);
  return { select };
};

describe('updateStoreBranding', () => {
  beforeEach(() => {
    mockedStore.findByIdAndUpdate.mockReset();
  });

  it('sets a valid primaryColor and secondaryColor (unchanged behavior)', async () => {
    mockUpdateResult({
      _id: storeId,
      branding: { primaryColor: '#123456', secondaryColor: '#654321' },
    });
    const res = createResponse();

    await updateStoreBranding(
      createRequest({ storeId }, { primaryColor: '#123456', secondaryColor: '#654321' }),
      res
    );

    expect(mockedStore.findByIdAndUpdate).toHaveBeenCalledWith(
      storeId,
      {
        $set: {
          'branding.primaryColor': '#123456',
          'branding.secondaryColor': '#654321',
        },
      },
      { new: true }
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        logoUrl: null,
        primaryColor: '#123456',
        secondaryColor: '#654321',
      },
      message: 'Store branding updated successfully',
    });
  });

  it('leaves a field untouched when its key is entirely absent from the body (unchanged behavior)', async () => {
    mockUpdateResult({
      _id: storeId,
      branding: { primaryColor: '#123456', secondaryColor: '#00AABB' },
    });
    const res = createResponse();

    await updateStoreBranding(createRequest({ storeId }, { primaryColor: '#123456' }), res);

    expect(mockedStore.findByIdAndUpdate).toHaveBeenCalledWith(
      storeId,
      { $set: { 'branding.primaryColor': '#123456' } },
      { new: true }
    );
    // No $unset at all — secondaryColor's key was never in the body, so it
    // must not be touched, cleared, or otherwise mentioned in the update.
    const [, updateArg] = mockedStore.findByIdAndUpdate.mock.calls[0];
    expect(updateArg).not.toHaveProperty('$unset');
  });

  it('clears primaryColor when sent as explicit null, and GET-equivalent response falls back to the default', async () => {
    // Simulate the post-clear document: primaryColor removed from the DB
    // entirely (what $unset actually does), so the response's own
    // `|| '#FF6B6B'` fallback is what produces the default here — same
    // fallback getStoreBranding already relies on, unchanged by this PR.
    mockUpdateResult({
      _id: storeId,
      branding: { secondaryColor: '#00AABB' },
    });
    const res = createResponse();

    await updateStoreBranding(createRequest({ storeId }, { primaryColor: null }), res);

    expect(mockedStore.findByIdAndUpdate).toHaveBeenCalledWith(
      storeId,
      { $unset: { 'branding.primaryColor': 1 } },
      { new: true }
    );
    const [, updateArg] = mockedStore.findByIdAndUpdate.mock.calls[0];
    expect(updateArg).not.toHaveProperty('$set');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        logoUrl: null,
        primaryColor: '#FF6B6B',
        secondaryColor: '#00AABB',
      },
      message: 'Store branding updated successfully',
    });
  });

  it('clears secondaryColor when it was previously set and sent as explicit null', async () => {
    mockUpdateResult({
      _id: storeId,
      branding: { primaryColor: '#123456' },
    });
    const res = createResponse();

    await updateStoreBranding(createRequest({ storeId }, { secondaryColor: null }), res);

    expect(mockedStore.findByIdAndUpdate).toHaveBeenCalledWith(
      storeId,
      { $unset: { 'branding.secondaryColor': 1 } },
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        logoUrl: null,
        primaryColor: '#123456',
        secondaryColor: null,
      },
      message: 'Store branding updated successfully',
    });
  });

  it('400s on an empty string rather than silently treating it as a clear request', async () => {
    const res = createResponse();

    await updateStoreBranding(createRequest({ storeId }, { primaryColor: '' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Primary color must be a valid hex color (e.g., #FF6B6B)',
    });
    expect(mockedStore.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('400s on other falsy-but-not-null values (0, false) instead of treating them as absent or as a clear', async () => {
    const zeroRes = createResponse();
    await updateStoreBranding(createRequest({ storeId }, { primaryColor: 0 }), zeroRes);
    expect(zeroRes.status).toHaveBeenCalledWith(400);
    expect(mockedStore.findByIdAndUpdate).not.toHaveBeenCalled();

    const falseRes = createResponse();
    await updateStoreBranding(createRequest({ storeId }, { secondaryColor: false }), falseRes);
    expect(falseRes.status).toHaveBeenCalledWith(400);
    expect(mockedStore.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('succeeds on a body that only clears a field — must not hit the old "no valid fields" 400', async () => {
    mockUpdateResult({
      _id: storeId,
      branding: {},
    });
    const res = createResponse();

    await updateStoreBranding(createRequest({ storeId }, { primaryColor: null }), res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(mockedStore.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('still 400s "No valid fields provided for update" when the body is empty', async () => {
    const res = createResponse();

    await updateStoreBranding(createRequest({ storeId }, {}), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'No valid fields provided for update',
    });
    expect(mockedStore.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['a bare number', 42],
    ['a bare boolean', false],
    ['a bare string', 'hello'],
    ['a null body', null],
  ])('400s "No valid fields provided for update" on a primitive body (%s), instead of 500ing', async (_label, primitiveBody) => {
    const res = createResponse();

    await updateStoreBranding(createRequest({ storeId }, primitiveBody), res);

    // Regression guard: `'primaryColor' in req.body` throws a TypeError
    // when req.body isn't an object, which previously reached this
    // function's catch block and 500'd instead of the same 400 a body
    // with no valid fields already gets. Caught in review (Greptile) on
    // PR #148.
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'No valid fields provided for update',
    });
    expect(mockedStore.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('combines a set on one field with a clear on the other in a single update', async () => {
    mockUpdateResult({
      _id: storeId,
      branding: { primaryColor: '#123456' },
    });
    const res = createResponse();

    await updateStoreBranding(
      createRequest({ storeId }, { primaryColor: '#123456', secondaryColor: null }),
      res
    );

    expect(mockedStore.findByIdAndUpdate).toHaveBeenCalledWith(
      storeId,
      {
        $set: { 'branding.primaryColor': '#123456' },
        $unset: { 'branding.secondaryColor': 1 },
      },
      { new: true }
    );
  });

  it('returns 400 for a malformed store ID', async () => {
    const res = createResponse();

    await updateStoreBranding(createRequest({ storeId: 'not-an-object-id' }, { primaryColor: null }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid store ID',
    });
    expect(mockedStore.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the store does not exist', async () => {
    mockUpdateResult(null);
    const res = createResponse();

    await updateStoreBranding(createRequest({ storeId }, { primaryColor: null }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Store not found',
    });
  });

  it('returns 500 when the update fails', async () => {
    const select = jest.fn().mockRejectedValue(new Error('connection lost'));
    mockedStore.findByIdAndUpdate.mockReturnValue({ select } as any);
    const res = createResponse();

    await updateStoreBranding(createRequest({ storeId }, { primaryColor: null }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to update store branding',
    });
  });
});
