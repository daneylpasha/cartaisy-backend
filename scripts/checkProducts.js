// Quick script to check products in database
const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI)
  .then(async () => {
    const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false, collection: 'products' }));

    const total = await Product.countDocuments();
    const active = await Product.countDocuments({ status: 'active' });
    const featured = await Product.countDocuments({ 'mobileDisplay.isFeatured': true });
    const withViews = await Product.countDocuments({ 'analytics.viewCount': { $gt: 0 } });

    console.log('=== Product Database Stats ===');
    console.log(`Total products: ${total}`);
    console.log(`Active products: ${active}`);
    console.log(`Featured products: ${featured}`);
    console.log(`Products with views: ${withViews}`);

    if (active > 0) {
      const sample = await Product.findOne({ status: 'active' }).select('title status mobileDisplay analytics');
      console.log('\nSample product:', JSON.stringify(sample, null, 2));
    } else {
      console.log('\n❌ No active products found in database!');
      console.log('You need to sync products from Shopify first.');
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
