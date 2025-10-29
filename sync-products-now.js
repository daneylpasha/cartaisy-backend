// Quick script to sync Shopify products to MongoDB
const mongoose = require('mongoose');
const syncService = require('./dist/services/syncService').default;

async function syncProducts() {
  try {
    console.log('🔄 Starting product sync...');

    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'your-mongodb-uri';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Run full sync
    const result = await syncService.performFullSync();
    console.log('✅ Sync completed!', result);

    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

syncProducts();
