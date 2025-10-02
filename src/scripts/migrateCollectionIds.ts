import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration Script: Convert collectionId fields from number to string
 *
 * This migration converts all collectionId fields from numeric values to string format
 * to support Shopify GID format (e.g., "gid://shopify/Collection/123456")
 *
 * Run this script ONCE before deploying the new version:
 * npx ts-node src/scripts/migrateCollectionIds.ts
 */

async function migrateCollectionIds() {
  try {
    console.log('🔄 Starting collectionId migration...\n');

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not set in environment variables');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Migration statistics
    const stats = {
      carouselItems: 0,
      calloutBanners: 0,
      promoBanners: 0,
      collectionDisplays: 0,
      categoryCollectionGrids: 0,
      collectionShowcases: 0,
      categoryGrids: 0,
    };

    // 1. Migrate CarouselItem.collectionId
    console.log('Migrating carouselitems...');
    const carouselResult = await db.collection('carouselitems').updateMany(
      { collectionId: { $type: 'number' } },
      [{ $set: { collectionId: { $toString: '$collectionId' } } }]
    );
    stats.carouselItems = carouselResult.modifiedCount;
    console.log(`  ✅ Updated ${stats.carouselItems} carousel items\n`);

    // 2. Migrate CalloutBanner.action.collectionId
    console.log('Migrating calloutbanners...');
    const calloutResult = await db.collection('calloutbanners').updateMany(
      { 'action.collectionId': { $type: 'number' } },
      [{ $set: { 'action.collectionId': { $toString: '$action.collectionId' } } }]
    );
    stats.calloutBanners = calloutResult.modifiedCount;
    console.log(`  ✅ Updated ${stats.calloutBanners} callout banners\n`);

    // 3. Migrate PromoBanner.collectionId
    console.log('Migrating promobanners...');
    const promoResult = await db.collection('promobanners').updateMany(
      { collectionId: { $type: 'number' } },
      [{ $set: { collectionId: { $toString: '$collectionId' } } }]
    );
    stats.promoBanners = promoResult.modifiedCount;
    console.log(`  ✅ Updated ${stats.promoBanners} promo banners\n`);

    // 4. Migrate CollectionDisplay.collectionId
    console.log('Migrating collectiondisplays...');
    const displayResult = await db.collection('collectiondisplays').updateMany(
      { collectionId: { $type: 'number' } },
      [{ $set: { collectionId: { $toString: '$collectionId' } } }]
    );
    stats.collectionDisplays = displayResult.modifiedCount;
    console.log(`  ✅ Updated ${stats.collectionDisplays} collection displays\n`);

    // 5. Migrate CategoryCollectionGrid.collections[].collectionId
    console.log('Migrating categorycollectiongrids...');
    const categoryCollectionGridResult = await db.collection('categorycollectiongrids').updateMany(
      { 'collections.collectionId': { $type: 'number' } },
      [{
        $set: {
          collections: {
            $map: {
              input: '$collections',
              as: 'item',
              in: {
                $mergeObjects: [
                  '$$item',
                  {
                    collectionId: {
                      $cond: {
                        if: { $eq: [{ $type: '$$item.collectionId' }, 'number'] },
                        then: { $toString: '$$item.collectionId' },
                        else: '$$item.collectionId'
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      }]
    );
    stats.categoryCollectionGrids = categoryCollectionGridResult.modifiedCount;
    console.log(`  ✅ Updated ${stats.categoryCollectionGrids} category collection grids\n`);

    // 6. Migrate CollectionShowcase.collections[].collectionId
    console.log('Migrating collectionshowcases...');
    const showcaseResult = await db.collection('collectionshowcases').updateMany(
      { 'collections.collectionId': { $type: 'number' } },
      [{
        $set: {
          collections: {
            $map: {
              input: '$collections',
              as: 'item',
              in: {
                $mergeObjects: [
                  '$$item',
                  {
                    collectionId: {
                      $cond: {
                        if: { $eq: [{ $type: '$$item.collectionId' }, 'number'] },
                        then: { $toString: '$$item.collectionId' },
                        else: '$$item.collectionId'
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      }]
    );
    stats.collectionShowcases = showcaseResult.modifiedCount;
    console.log(`  ✅ Updated ${stats.collectionShowcases} collection showcases\n`);

    // 7. Migrate CategoryGrid.collectionId
    console.log('Migrating categorygrids...');
    const categoryGridResult = await db.collection('categorygrids').updateMany(
      { collectionId: { $type: 'number' } },
      [{ $set: { collectionId: { $toString: '$collectionId' } } }]
    );
    stats.categoryGrids = categoryGridResult.modifiedCount;
    console.log(`  ✅ Updated ${stats.categoryGrids} category grids\n`);

    // Print summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Migration Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Carousel Items:              ${stats.carouselItems} updated`);
    console.log(`Callout Banners:             ${stats.calloutBanners} updated`);
    console.log(`Promo Banners:               ${stats.promoBanners} updated`);
    console.log(`Collection Displays:         ${stats.collectionDisplays} updated`);
    console.log(`Category Collection Grids:   ${stats.categoryCollectionGrids} updated`);
    console.log(`Collection Showcases:        ${stats.collectionShowcases} updated`);
    console.log(`Category Grids:              ${stats.categoryGrids} updated`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const totalUpdated = Object.values(stats).reduce((sum, count) => sum + count, 0);
    console.log(`\n✅ Migration complete! Total documents updated: ${totalUpdated}`);

    if (totalUpdated === 0) {
      console.log('ℹ️  No documents needed migration (already strings or no data exists)');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrateCollectionIds().then(() => {
  process.exit(0);
});
