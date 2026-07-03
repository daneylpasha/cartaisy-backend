import mongoose from 'mongoose';
import Store from '../src/models/Store';
import Product from '../src/models/Product';
import { backfillProductStoreId } from '../src/scripts/backfillProductStoreId';

// =============================================================================
// Product tenancy migration script (issues #65 / #78)
//
// Verifies against a real (in-memory) MongoDB that the dry run never writes,
// the real run assigns legacy products to exactly the target store, unsafe
// invocations fail closed, and the index reporting used by the release gate
// tells the truth.
// =============================================================================

const legacyProduct = (n: number) => ({
  title: `Legacy Product ${n}`,
  handle: `legacy-product-${n}`,
  shopifyProductId: `90000${n}`,
  // Legacy values were globally unique (enforced by the old single-field
  // unique indexes), so distinct slugs mirror real pre-tenancy data
  seo: { slug: `legacy-product-${n}` },
  status: 'active',
  price: 10,
});

describe('backfillProductStoreId migration script', () => {
  let storeAId: mongoose.Types.ObjectId;

  const productsCollection = () => mongoose.connection.db!.collection('products');

  beforeEach(async () => {
    // Ensure the schema-declared indexes exist before tests inspect them
    await Product.init();
    await Product.createIndexes();

    const storeA = await Store.create({
      name: 'Migration Store A',
      slug: 'migration-store-a',
      shopify: {},
    });
    storeAId = storeA._id;

    // Legacy pre-tenancy documents have no storeId; insert them raw so the
    // current schema/model defaults cannot interfere
    await productsCollection().insertMany([legacyProduct(1), legacyProduct(2), legacyProduct(3)]);
  });

  afterEach(async () => {
    await Promise.all([Store.deleteMany({}), productsCollection().deleteMany({})]);
  });

  test('dry run reports the work but modifies nothing', async () => {
    const summary = await backfillProductStoreId({ dryRun: true });

    expect(summary.missingBefore).toBe(3);
    expect(summary.modified).toBe(0);
    expect(summary.targetStoreId).toBe(storeAId.toString());

    // Nothing written
    expect(await productsCollection().countDocuments({ storeId: { $exists: false } })).toBe(3);

    // Release-gate numbers include the legacy row
    const legacyRow = summary.productCountsByStore.find((row) => row.storeId === null);
    expect(legacyRow?.count).toBe(3);
  });

  test('real run assigns every legacy product to the target store', async () => {
    const summary = await backfillProductStoreId({ storeId: storeAId.toString() });

    expect(summary.missingBefore).toBe(3);
    expect(summary.modified).toBe(3);

    expect(await productsCollection().countDocuments({ storeId: { $exists: false } })).toBe(0);
    expect(await productsCollection().countDocuments({ storeId: storeAId })).toBe(3);

    const storeRow = summary.productCountsByStore.find(
      (row) => row.storeId === storeAId.toString()
    );
    expect(storeRow?.count).toBe(3);

    // Idempotent: a second run has nothing left to do
    const second = await backfillProductStoreId({ storeId: storeAId.toString() });
    expect(second.missingBefore).toBe(0);
    expect(second.modified).toBe(0);
  });

  test('refuses to guess the store when multiple stores exist', async () => {
    await Store.create({ name: 'Migration Store B', slug: 'migration-store-b', shopify: {} });

    await expect(backfillProductStoreId({ dryRun: true })).rejects.toThrow(/Multiple stores exist/);
    expect(await productsCollection().countDocuments({ storeId: { $exists: false } })).toBe(3);
  });

  test('rejects an invalid or unknown --store-id without writing', async () => {
    await expect(backfillProductStoreId({ storeId: 'not-an-object-id' })).rejects.toThrow(
      /not a valid ObjectId/
    );
    await expect(
      backfillProductStoreId({ storeId: new mongoose.Types.ObjectId().toString() })
    ).rejects.toThrow(/not found/);
    expect(await productsCollection().countDocuments({ storeId: { $exists: false } })).toBe(3);
  });

  test('detects, dry-runs, and drops a legacy global unique index; reports missing compound indexes', async () => {
    // Simulate the pre-tenancy index state
    await productsCollection().dropIndexes();
    await productsCollection().createIndex({ handle: 1 }, { unique: true, name: 'handle_1' });

    // Dry run: sees it, does not drop it, and reports the (now missing)
    // store-scoped compound indexes
    const dryRun = await backfillProductStoreId({ dryRun: true, dropLegacyIndexes: true });
    expect(dryRun.legacyUniqueIndexesPresent).toEqual(['handle_1']);
    expect(dryRun.legacyUniqueIndexesDropped).toEqual([]);
    expect(dryRun.compoundIndexesMissing).toHaveLength(3);
    const indexesAfterDry = await productsCollection().indexes();
    expect(indexesAfterDry.some((idx) => idx.name === 'handle_1' && idx.unique)).toBe(true);

    // Real run drops it
    const realRun = await backfillProductStoreId({
      storeId: storeAId.toString(),
      dropLegacyIndexes: true,
    });
    expect(realRun.legacyUniqueIndexesDropped).toEqual(['handle_1']);
    const indexesAfterReal = await productsCollection().indexes();
    expect(indexesAfterReal.some((idx) => idx.name === 'handle_1')).toBe(false);
  });

  test('reports the compound store-scoped unique indexes present when the schema built them', async () => {
    const summary = await backfillProductStoreId({ dryRun: true });
    expect(summary.compoundIndexesMissing).toEqual([]);
  });
});
