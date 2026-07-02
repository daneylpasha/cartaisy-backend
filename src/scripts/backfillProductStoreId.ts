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
 */

// Legacy single-field unique indexes replaced by store-scoped compound
// indexes. Removing `unique: true` from the schema does not drop indexes
// that already exist in MongoDB, so they must be dropped explicitly.
const LEGACY_UNIQUE_INDEXES = ['shopifyProductId_1', 'handle_1', 'seo.slug_1'];

async function backfillProductStoreId() {
  const dryRun = process.argv.includes('--dry-run');
  const dropLegacyIndexes = process.argv.includes('--drop-legacy-indexes');
  const storeIdFlagIndex = process.argv.indexOf('--store-id');
  const storeIdArg = storeIdFlagIndex !== -1 ? process.argv[storeIdFlagIndex + 1] : undefined;

  try {
    console.log(`🔄 Starting Product.storeId backfill${dryRun ? ' (dry run)' : ''}...\n`);

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not set in environment variables');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
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

    if (dryRun) {
      console.log('💡 Dry run: no documents were modified\n');
    } else if (missingCount > 0) {
      const result = await productsCollection.updateMany(
        { storeId: { $exists: false } },
        { $set: { storeId: targetStoreId } }
      );
      console.log(`✅ Backfilled storeId on ${result.modifiedCount} products\n`);
    } else {
      console.log('✅ Nothing to backfill\n');
    }

    // Report or drop legacy global unique indexes
    const indexes = await productsCollection.indexes();
    const legacyPresent = indexes.filter(
      (idx) => idx.name && LEGACY_UNIQUE_INDEXES.includes(idx.name) && idx.unique
    );

    if (legacyPresent.length === 0) {
      console.log('✅ No legacy global unique indexes present');
    } else {
      for (const idx of legacyPresent) {
        if (dropLegacyIndexes && dryRun) {
          console.log(`💡 Dry run: would drop legacy unique index: ${idx.name}`);
        } else if (dropLegacyIndexes) {
          await productsCollection.dropIndex(idx.name!);
          console.log(`🗑️ Dropped legacy unique index: ${idx.name}`);
        } else {
          console.log(
            `⚠️ Legacy unique index still present: ${idx.name} (re-run with --drop-legacy-indexes to drop; it blocks cross-store duplicates)`
          );
        }
      }
    }

    console.log('\n💡 After dropping legacy indexes, restart the app (or run Product.syncIndexes()) so the store-scoped compound indexes are created.');
    console.log('🏁 Backfill complete');
  } catch (error) {
    console.error('❌ Backfill failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

backfillProductStoreId();
