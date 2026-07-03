import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration Script: Backfill Product.storeId for pre-tenancy product records
 *
 * Products created before the tenancy change (GitHub issue #65) have no
 * storeId. This script assigns them to a target store so tenant-scoped
 * queries (sync, webhooks) keep matching them, and optionally drops the
 * legacy global unique indexes that block cross-store duplicates.
 *
 * See docs/PRODUCT_TENANCY_MIGRATION.md for the full runbook.
 *
 * Usage:
 *   npx ts-node src/scripts/backfillProductStoreId.ts --dry-run
 *   npx ts-node src/scripts/backfillProductStoreId.ts --store-id <storeId>
 *   npx ts-node src/scripts/backfillProductStoreId.ts            (auto: only if exactly one store exists)
 *   npx ts-node src/scripts/backfillProductStoreId.ts --store-id <storeId> --drop-legacy-indexes
 *
 * Dry run never writes: it reports what WOULD change (backfill count, a
 * sample of affected products, index changes) and always prints the
 * per-store product counts and index state used for release verification.
 */

// Legacy single-field unique indexes replaced by store-scoped compound
// indexes. Removing `unique: true` from the schema does not drop indexes
// that already exist in MongoDB, so they must be dropped explicitly.
const LEGACY_UNIQUE_INDEXES = ['shopifyProductId_1', 'handle_1', 'seo.slug_1'];

// Store-scoped compound unique indexes the schema declares; their presence
// is verified so the release gate has a single source of truth.
const EXPECTED_COMPOUND_INDEXES = [
  { storeId: 1, shopifyProductId: 1 },
  { storeId: 1, handle: 1 },
  { storeId: 1, 'seo.slug': 1 },
];

export interface BackfillOptions {
  dryRun?: boolean;
  dropLegacyIndexes?: boolean;
  storeId?: string;
}

export interface BackfillSummary {
  targetStoreId: string;
  missingBefore: number;
  modified: number;
  legacyUniqueIndexesPresent: string[];
  legacyUniqueIndexesDropped: string[];
  compoundIndexesMissing: string[];
  productCountsByStore: Array<{ storeId: string | null; storeName: string; count: number }>;
}

const indexKeyMatches = (key: Record<string, unknown>, expected: Record<string, unknown>): boolean => {
  const keyFields = Object.keys(key);
  const expectedFields = Object.keys(expected);
  return (
    keyFields.length === expectedFields.length &&
    expectedFields.every((field, i) => keyFields[i] === field && key[field] === expected[field])
  );
};

export async function backfillProductStoreId(options: BackfillOptions = {}): Promise<BackfillSummary> {
  const dryRun = options.dryRun ?? false;
  const dropLegacyIndexes = options.dropLegacyIndexes ?? false;
  const storeIdArg = options.storeId;

  console.log(`🔄 Starting Product.storeId backfill${dryRun ? ' (dry run)' : ''}...\n`);

  // Reuse an already-open connection (tests, app context); otherwise connect
  // via MONGODB_URI and close on completion.
  const openedConnection = mongoose.connection.readyState !== 1;
  if (openedConnection) {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not set in environment variables');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
  }

  try {
    const db = mongoose.connection.db!;
    const storesCollection = db.collection('stores');
    const productsCollection = db.collection('products');

    // Resolve the target store
    let targetStoreId: mongoose.Types.ObjectId;
    if (storeIdArg) {
      if (!mongoose.Types.ObjectId.isValid(storeIdArg)) {
        throw new Error(`--store-id "${storeIdArg}" is not a valid ObjectId`);
      }
      const store = await storesCollection.findOne({ _id: new mongoose.Types.ObjectId(storeIdArg) });
      if (!store) {
        throw new Error(`Store ${storeIdArg} not found`);
      }
      targetStoreId = store._id as mongoose.Types.ObjectId;
      console.log(`🎯 Target store (from --store-id): ${store.name} (${targetStoreId})\n`);
    } else {
      const stores = await storesCollection.find({}).limit(2).toArray();
      if (stores.length === 0) {
        throw new Error('No stores exist; create/connect the store before backfilling');
      }
      if (stores.length > 1) {
        throw new Error(
          'Multiple stores exist; pass an explicit --store-id. Refusing to guess which store owns legacy products.'
        );
      }
      targetStoreId = stores[0]._id as mongoose.Types.ObjectId;
      console.log(`🎯 Target store (single store detected): ${stores[0].name} (${targetStoreId})\n`);
    }

    // Backfill products missing storeId
    const missingCount = await productsCollection.countDocuments({ storeId: { $exists: false } });
    console.log(`📦 Products without storeId: ${missingCount}`);

    // Show a sample of what will be (or would be) assigned, so the operator
    // can sanity-check ownership before the real run
    if (missingCount > 0) {
      const sample = await productsCollection
        .find({ storeId: { $exists: false } })
        .project({ _id: 1, title: 1, handle: 1, shopifyProductId: 1 })
        .limit(5)
        .toArray();
      console.log(`   Sample of products ${dryRun ? 'that would be' : 'being'} assigned to ${targetStoreId}:`);
      for (const product of sample) {
        console.log(
          `   - ${product._id} | ${product.title ?? '(no title)'} | handle=${product.handle ?? '-'} | shopifyProductId=${product.shopifyProductId ?? '-'}`
        );
      }
      if (missingCount > sample.length) {
        console.log(`   ... and ${missingCount - sample.length} more`);
      }
    }

    let modified = 0;
    if (dryRun) {
      console.log('💡 Dry run: no documents were modified\n');
    } else if (missingCount > 0) {
      const result = await productsCollection.updateMany(
        { storeId: { $exists: false } },
        { $set: { storeId: targetStoreId } }
      );
      modified = result.modifiedCount;
      console.log(`✅ Backfilled storeId on ${result.modifiedCount} products\n`);
    } else {
      console.log('✅ Nothing to backfill\n');
    }

    // Per-store product counts - the release-gate verification numbers
    const countsByStore = await productsCollection
      .aggregate([{ $group: { _id: '$storeId', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
      .toArray();
    const storeNames = new Map<string, string>();
    for (const store of await storesCollection.find({}).project({ name: 1 }).toArray()) {
      storeNames.set(store._id.toString(), store.name ?? '(unnamed)');
    }
    console.log('📊 Product counts by store:');
    const productCountsByStore: BackfillSummary['productCountsByStore'] = [];
    for (const row of countsByStore) {
      const storeId = row._id ? row._id.toString() : null;
      const storeName = storeId ? storeNames.get(storeId) ?? '(unknown store)' : '(no storeId - legacy)';
      console.log(`   - ${storeName}${storeId ? ` (${storeId})` : ''}: ${row.count}`);
      productCountsByStore.push({ storeId, storeName, count: row.count });
    }
    if (countsByStore.length === 0) {
      console.log('   - (no products)');
    }
    console.log('');

    // Report or drop legacy global unique indexes
    const indexes = await productsCollection.indexes();
    const legacyPresent = indexes.filter(
      (idx) => idx.name && LEGACY_UNIQUE_INDEXES.includes(idx.name) && idx.unique
    );
    const legacyDropped: string[] = [];

    if (legacyPresent.length === 0) {
      console.log('✅ No legacy global unique indexes present');
    } else {
      for (const idx of legacyPresent) {
        if (dropLegacyIndexes && dryRun) {
          console.log(`💡 Dry run: would drop legacy unique index: ${idx.name}`);
        } else if (dropLegacyIndexes) {
          await productsCollection.dropIndex(idx.name!);
          legacyDropped.push(idx.name!);
          console.log(`🗑️ Dropped legacy unique index: ${idx.name}`);
        } else {
          console.log(
            `⚠️ Legacy unique index still present: ${idx.name} (re-run with --drop-legacy-indexes to drop; it blocks cross-store duplicates)`
          );
        }
      }
    }

    // Verify the store-scoped compound unique indexes exist - the schema
    // declares them, but autoIndex may be disabled or the app not restarted
    const currentIndexes = dropLegacyIndexes && !dryRun ? await productsCollection.indexes() : indexes;
    const compoundMissing: string[] = [];
    for (const expected of EXPECTED_COMPOUND_INDEXES) {
      const found = currentIndexes.some(
        (idx) => idx.unique === true && indexKeyMatches(idx.key as Record<string, unknown>, expected)
      );
      if (!found) {
        compoundMissing.push(JSON.stringify(expected));
      }
    }
    if (compoundMissing.length === 0) {
      console.log('✅ Store-scoped compound unique indexes present');
    } else {
      for (const missing of compoundMissing) {
        console.log(
          `⚠️ Store-scoped compound unique index MISSING: ${missing} (restart the app or run Product.syncIndexes())`
        );
      }
    }

    console.log('\n💡 After dropping legacy indexes, restart the app (or run Product.syncIndexes()) so the store-scoped compound indexes are created.');
    console.log('🏁 Backfill complete');

    return {
      targetStoreId: targetStoreId.toString(),
      missingBefore: missingCount,
      modified,
      legacyUniqueIndexesPresent: legacyPresent.map((idx) => idx.name!),
      legacyUniqueIndexesDropped: legacyDropped,
      compoundIndexesMissing: compoundMissing,
      productCountsByStore,
    };
  } finally {
    if (openedConnection) {
      await mongoose.connection.close();
    }
  }
}

// CLI entry point (kept separate so tests can import the function without
// running it or having it close their database connection)
if (require.main === module) {
  const storeIdFlagIndex = process.argv.indexOf('--store-id');
  backfillProductStoreId({
    dryRun: process.argv.includes('--dry-run'),
    dropLegacyIndexes: process.argv.includes('--drop-legacy-indexes'),
    storeId: storeIdFlagIndex !== -1 ? process.argv[storeIdFlagIndex + 1] : undefined,
  }).catch((error) => {
    console.error('❌ Backfill failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
