/**
 * Drop invalid MongoDB indexes that cause E11000 errors
 *
 * This utility drops the returns.id_1 index from the orders collection.
 * The index was incorrectly created with unique:true on a subdocument array field.
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

    // Check if the invalid index exists
    const invalidIndex = indexes.find(idx => idx.name === 'returns.id_1');

    if (invalidIndex) {
      console.log('[Index Cleanup] Found invalid index returns.id_1, dropping...');
      await ordersCollection.dropIndex('returns.id_1');
      console.log('[Index Cleanup] ✅ Successfully dropped invalid index: returns.id_1');
    } else {
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
