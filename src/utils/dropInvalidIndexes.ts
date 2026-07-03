/**
 * Drop invalid MongoDB indexes that cause E11000 errors
 *
 * This utility drops from the orders collection:
 * - returns.id_1: incorrectly created with unique:true on a subdocument array field.
 * - shopifyOrderId_1 / orderNumber_1 (unique variants only): the legacy
 *   GLOBAL unique indexes, replaced by the store-scoped compound unique
 *   indexes { storeId, shopifyOrderId } and { storeId, orderNumber } for
 *   order webhook reconciliation (issue #76) - every Shopify store numbers
 *   orders from #1001, so cross-store values collide by design. The schema
 *   still declares non-unique lookup indexes on both fields, which Mongoose
 *   recreates after the unique ones are dropped.
 */

import mongoose from 'mongoose';

export async function dropInvalidIndexes(): Promise<void> {
  try {
    const db = mongoose.connection.db;

    if (!db) {
      console.log('[Index Cleanup] Database not connected yet, skipping...');
      return;
    }

    const ordersCollection = db.collection('orders');
    const indexes = await ordersCollection.indexes();

    let droppedAny = false;

    // Check if the invalid index exists
    const invalidIndex = indexes.find(idx => idx.name === 'returns.id_1');

    if (invalidIndex) {
      console.log('[Index Cleanup] Found invalid index returns.id_1, dropping...');
      await ordersCollection.dropIndex('returns.id_1');
      console.log('[Index Cleanup] ✅ Successfully dropped invalid index: returns.id_1');
      droppedAny = true;
    }

    // Only the unique variants are legacy; the non-unique single-field
    // lookup indexes declared by the schema are expected and must stay.
    for (const legacyName of ['shopifyOrderId_1', 'orderNumber_1']) {
      const legacyGlobalUnique = indexes.find(
        idx => idx.name === legacyName && idx.unique === true
      );

      if (legacyGlobalUnique) {
        console.log(`[Index Cleanup] Found legacy global unique index ${legacyName}, dropping...`);
        await ordersCollection.dropIndex(legacyName);
        console.log(`[Index Cleanup] ✅ Successfully dropped legacy index: ${legacyName}`);
        droppedAny = true;
      }
    }

    if (!droppedAny) {
      console.log('[Index Cleanup] ✅ No invalid indexes found');
    }
  } catch (error: any) {
    // Ignore "index not found" errors
    if (error.code === 27 || error.codeName === 'IndexNotFound') {
      console.log('[Index Cleanup] ✅ Index already dropped');
    } else {
      console.error('[Index Cleanup] Error:', error.message);
    }
  }
}
