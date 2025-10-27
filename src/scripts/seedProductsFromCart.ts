import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Product from '../models/Product';

const seedProducts = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ Connected to MongoDB');

    const productsToSeed = [
      {
        shopifyProductId: 'gid://shopify/Product/14802830393716',
        title: 'Hydra-Boost Water Cream - Hyaluronic Acid & Ceramides',
        handle: 'hydra-boost-water-cream',
        price: 35.00,
        images: [{
          url: 'https://cdn.shopify.com/s/files/1/0933/0612/7604/files/71fU7g8D2tL._SL1500.jpg',
          alt: 'Hydra-Boost Water Cream',
          position: 1
        }],
        variantId: 'gid://shopify/ProductVariant/51850298745204',
        variantTitle: 'Hydra-Boost Water Cream',
        sku: ''
      },
      {
        shopifyProductId: 'gid://shopify/Product/14764949348724',
        title: 'Advanced Night Repair Eye Cream - 50ml',
        handle: 'advanced-night-repair-eye-cream',
        price: 28.00,
        images: [{
          url: 'https://cdn.shopify.com/s/files/1/0933/0612/7604/files/71lB5X-YPEL._SL1500.jpg',
          alt: 'Advanced Night Repair Eye Cream',
          position: 1
        }],
        variantId: 'gid://shopify/ProductVariant/51814177071476',
        variantTitle: 'Advanced Night Repair Eye Cream',
        sku: ''
      }
    ];

    for (const productData of productsToSeed) {
      const existingProduct = await Product.findOne({ shopifyProductId: productData.shopifyProductId });

      if (existingProduct) {
        console.log(`✓ Product already exists: ${productData.title}`);
        continue;
      }

      const newProduct = new Product({
        shopifyProductId: productData.shopifyProductId,
        title: productData.title,
        description: productData.title,
        handle: productData.handle,
        vendor: 'Unknown',
        productType: 'General',
        tags: [],
        status: 'active',
        price: productData.price,
        compareAtPrice: undefined,
        images: productData.images,
        mobileDisplay: {
          thumbnailUrl: productData.images[0]?.url || '',
          priority: 1,
          isFeatured: false,
          shortDescription: productData.title
        },
        analytics: {
          viewCount: 0,
          favoriteCount: 0,
          conversionRate: 0,
          averageTimeOnPage: 0,
          conversionEvents: [],
          lastViewedAt: new Date()
        },
        reviews: {
          count: 0,
          averageRating: 0,
          totalRating: 0
        },
        seo: {
          title: productData.title,
          description: productData.title,
          keywords: [],
          slug: productData.handle
        },
        inventoryTracking: {
          totalQuantity: 100,
          tracked: false,
          lowStockThreshold: 5,
          history: []
        },
        variants: [{
          id: productData.variantId,
          title: productData.variantTitle,
          price: productData.price,
          compareAtPrice: undefined,
          sku: productData.sku,
          inventory: {
            quantity: 100,
            policy: 'deny',
            tracked: false
          },
          weight: 0,
          weightUnit: 'kg',
          options: {
            option1: productData.variantTitle,
            option2: null,
            option3: null
          }
        }]
      });

      await newProduct.save();
      console.log(`✅ Created product: ${productData.title}`);
    }

    console.log('\n✅ Product seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding products:', error);
    process.exit(1);
  }
};

seedProducts();
