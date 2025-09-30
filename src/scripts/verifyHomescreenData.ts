import mongoose from 'mongoose';
import { databaseConfig } from '../config/tenant';
import CategoryCollectionGrid from '../models/CategoryCollectionGrid';
import PromoBanner from '../models/PromoBanner';
import CollectionShowcase from '../models/CollectionShowcase';

async function verifyHomescreenData() {
  try {
    console.log('🔍 Verifying homescreen data in database...\n');

    // Connect to database
    await mongoose.connect(databaseConfig.mongodbUri, {
      maxPoolSize: databaseConfig.maxPoolSize,
      minPoolSize: databaseConfig.minPoolSize,
      connectTimeoutMS: databaseConfig.connectionTimeout
    });

    console.log('✅ Connected to database\n');

    // Check CategoryCollectionGrid
    const categoryCollectionGridCount = await CategoryCollectionGrid.countDocuments({ isActive: true });
    console.log(`📦 CategoryCollectionGrid: ${categoryCollectionGridCount} active items`);
    if (categoryCollectionGridCount > 0) {
      const sample = await CategoryCollectionGrid.findOne({ isActive: true }).lean();
      console.log(`   Sample: ${sample?.title} with ${sample?.collections.length} collections`);
    }

    // Check PromoBanner
    const promoBannerCount = await PromoBanner.countDocuments({ isActive: true });
    console.log(`\n🎯 PromoBanner: ${promoBannerCount} active items`);
    if (promoBannerCount > 0) {
      const sample = await PromoBanner.findOne({ isActive: true }).lean();
      console.log(`   Sample: ${sample?.title}`);
    }

    // Check CollectionShowcase
    const collectionShowcaseCount = await CollectionShowcase.countDocuments({ isActive: true });
    console.log(`\n🖼️  CollectionShowcase: ${collectionShowcaseCount} active items`);
    if (collectionShowcaseCount > 0) {
      const samples = await CollectionShowcase.find({ isActive: true }).lean();
      samples.forEach((sample) => {
        console.log(`   - [${sample.type}] ${sample.title} with ${sample.collections.length} collections`);
      });
    }

    console.log('\n✅ Verification complete!');

    // Close connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');

  } catch (error) {
    console.error('❌ Error verifying homescreen data:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  verifyHomescreenData();
}

export default verifyHomescreenData;