import mongoose from 'mongoose';
import { databaseConfig } from '../config/tenant';
import { homescreenController } from '../controllers/homescreenController';

async function testHomescreenAPI() {
  try {
    console.log('🧪 Testing homescreen controller...\n');

    // Connect to database
    await mongoose.connect(databaseConfig.mongodbUri, {
      maxPoolSize: databaseConfig.maxPoolSize,
      minPoolSize: databaseConfig.minPoolSize,
      connectTimeoutMS: databaseConfig.connectionTimeout
    });

    console.log('✅ Connected to database\n');

    // Create mock request and response objects
    const mockReq = {} as any;
    const mockRes = {
      status: (code: number) => {
        console.log(`📡 Response Status: ${code}`);
        return mockRes;
      },
      json: (data: any) => {
        console.log('\n📦 Response Data:');
        console.log('==================\n');

        if (data.success) {
          const responseData = data.data;

          // Check for new components
          console.log('✅ New Components Check:');
          console.log(`   - categoryCollectionGrid: ${responseData.categoryCollectionGrid ? `✓ (${responseData.categoryCollectionGrid.length} items)` : '✗ MISSING'}`);
          console.log(`   - promoBanners: ${responseData.promoBanners ? `✓ (${responseData.promoBanners.length} items)` : '✗ MISSING'}`);
          console.log(`   - collectionShowcases: ${responseData.collectionShowcases ? `✓ (${responseData.collectionShowcases.length} items)` : '✗ MISSING'}`);

          console.log('\n📊 Existing Components:');
          console.log(`   - carousel: ${responseData.carousel.length} items`);
          console.log(`   - categoryGrid: ${responseData.categoryGrid.length} items`);
          console.log(`   - calloutBanners: ${responseData.calloutBanners.length} items`);
          console.log(`   - collectionDisplays: ${responseData.collectionDisplays.length} items`);

          console.log('\n📈 Metadata:');
          console.log(`   - categoryCollectionGridCount: ${responseData.metadata.categoryCollectionGridCount}`);
          console.log(`   - promoBannersCount: ${responseData.metadata.promoBannersCount}`);
          console.log(`   - collectionShowcasesCount: ${responseData.metadata.collectionShowcasesCount}`);

          // Sample data from new components
          if (responseData.categoryCollectionGrid && responseData.categoryCollectionGrid.length > 0) {
            console.log('\n📦 CategoryCollectionGrid Sample:');
            const sample = responseData.categoryCollectionGrid[0];
            console.log(`   Title: ${sample.title}`);
            console.log(`   Subtitle: ${sample.subtitle}`);
            console.log(`   Collections: ${sample.collections.length}`);
            console.log(`   First Collection: ${sample.collections[0]?.title || 'N/A'}`);
          }

          if (responseData.promoBanners && responseData.promoBanners.length > 0) {
            console.log('\n🎯 PromoBanner Sample:');
            const sample = responseData.promoBanners[0];
            console.log(`   Title: ${sample.title}`);
            console.log(`   CTA: ${sample.ctaText}`);
            console.log(`   Collection ID: ${sample.collectionId}`);
          }

          if (responseData.collectionShowcases && responseData.collectionShowcases.length > 0) {
            console.log('\n🖼️  CollectionShowcase Samples:');
            responseData.collectionShowcases.forEach((showcase: any, index: number) => {
              console.log(`   ${index + 1}. [${showcase.type}] ${showcase.title} (${showcase.collections.length} collections)`);
            });
          }

          console.log('\n✅ API Test: SUCCESS!');
        } else {
          console.log('❌ API Test: FAILED');
          console.log('Error:', data.error);
        }

        return mockRes;
      }
    } as any;

    // Call the controller
    await homescreenController.getHomescreenData(mockReq, mockRes);

    // Close connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');

  } catch (error) {
    console.error('❌ Error testing homescreen API:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  testHomescreenAPI();
}

export default testHomescreenAPI;