import mongoose from 'mongoose';
import { databaseConfig } from '../config/tenant';
import CategoryCollectionGrid from '../models/CategoryCollectionGrid';
import PromoBanner from '../models/PromoBanner';
import CollectionShowcase from '../models/CollectionShowcase';

async function populateHomescreenData() {
  try {
    console.log('🚀 Starting homescreen data population...');

    // Connect to database
    await mongoose.connect(databaseConfig.mongodbUri, {
      maxPoolSize: databaseConfig.maxPoolSize,
      minPoolSize: databaseConfig.minPoolSize,
      connectTimeoutMS: databaseConfig.connectionTimeout
    });

    console.log('✅ Connected to database');

    // Clear existing data
    console.log('🗑️  Clearing existing homescreen component data...');
    await Promise.all([
      CategoryCollectionGrid.deleteMany({}),
      PromoBanner.deleteMany({}),
      CollectionShowcase.deleteMany({})
    ]);

    // Create sample CategoryCollectionGrid data (Categories you might like)
    console.log('📦 Creating CategoryCollectionGrid sample data...');
    const categoryCollectionGrids = await CategoryCollectionGrid.create([
      {
        title: 'Categories you might like',
        subtitle: 'Find the latest best deals by category',
        collections: [
          {
            image: 'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=400',
            title: 'Personal Care',
            collectionId: 123456
          },
          {
            image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400',
            title: 'Automotive',
            collectionId: 123457
          },
          {
            image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400',
            title: 'Electronics',
            collectionId: 123458
          },
          {
            image: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=400',
            title: 'Health & Fitness',
            collectionId: 123459
          },
          {
            image: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=400',
            title: 'Footwear',
            collectionId: 123460
          }
        ],
        position: 1,
        isActive: true
      }
    ]);
    console.log(`✅ Created ${categoryCollectionGrids.length} CategoryCollectionGrid items`);

    // Create sample PromoBanner data (Promotional deals)
    console.log('🎯 Creating PromoBanner sample data...');
    const promoBanners = await PromoBanner.create([
      {
        image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800',
        title: 'Health & Fitness 25% OFF Promo Madness!',
        subtitle: 'Enhance your health and get healthier today.',
        ctaText: 'Browse Deals',
        collectionId: 123459,
        position: 1,
        isActive: true,
        backgroundColor: '#f8f9fa',
        textColor: '#212529',
        buttonColor: '#7c3aed'
      },
      {
        image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
        title: 'Summer Sale 40% OFF',
        subtitle: 'Limited time offer on premium products',
        ctaText: 'Shop Now',
        collectionId: 123461,
        position: 2,
        isActive: true,
        backgroundColor: '#fff5f5',
        textColor: '#1a202c',
        buttonColor: '#e53e3e'
      },
      {
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
        title: 'New Arrivals - Tech Gadgets',
        subtitle: 'Check out the latest tech innovations',
        ctaText: 'Explore Now',
        collectionId: 123458,
        position: 3,
        isActive: true,
        backgroundColor: '#edf2f7',
        textColor: '#2d3748',
        buttonColor: '#3182ce'
      }
    ]);
    console.log(`✅ Created ${promoBanners.length} PromoBanner items`);

    // Create sample CollectionShowcase data - Grid type (Computers & Accessories)
    console.log('🖼️  Creating CollectionShowcase sample data...');
    const collectionShowcases = await CollectionShowcase.create([
      {
        type: 'grid',
        title: 'Computers & Accessories',
        collections: [
          {
            image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400',
            title: 'Video Games',
            collectionId: 123462
          },
          {
            image: 'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?w=400',
            title: 'Game Console',
            collectionId: 123463
          },
          {
            image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
            title: 'Electronics',
            collectionId: 123458
          },
          {
            image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400',
            title: 'Baby',
            collectionId: 123464
          }
        ],
        position: 1,
        isActive: true
      },
      {
        type: 'circular',
        title: 'Brands you might like',
        collections: [
          {
            image: 'https://images.unsplash.com/photo-1621768216002-5ac171876625?w=400',
            title: 'Apple',
            collectionId: 123465
          },
          {
            image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400',
            title: 'Samsung',
            collectionId: 123466
          },
          {
            image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
            title: 'Nike',
            collectionId: 123467
          },
          {
            image: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=400',
            title: 'Nintendo',
            collectionId: 123468
          }
        ],
        position: 2,
        isActive: true
      },
      {
        type: 'grid',
        title: 'Shop by Category',
        collections: [
          {
            image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
            title: 'Fashion',
            collectionId: 123469
          },
          {
            image: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400',
            title: 'Photography',
            collectionId: 123470
          },
          {
            image: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400',
            title: 'Home Decor',
            collectionId: 123471
          },
          {
            image: 'https://images.unsplash.com/photo-1434626881859-194d67b2b86f?w=400',
            title: 'Books',
            collectionId: 123472
          }
        ],
        position: 3,
        isActive: true
      }
    ]);
    console.log(`✅ Created ${collectionShowcases.length} CollectionShowcase items`);

    // Summary
    console.log('\n📊 Summary:');
    console.log(`  - CategoryCollectionGrid: ${categoryCollectionGrids.length} items`);
    console.log(`  - PromoBanner: ${promoBanners.length} items`);
    console.log(`  - CollectionShowcase: ${collectionShowcases.length} items`);
    console.log('\n🎉 Homescreen data population completed successfully!');

    // Close connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');

  } catch (error) {
    console.error('❌ Error populating homescreen data:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  populateHomescreenData();
}

export default populateHomescreenData;