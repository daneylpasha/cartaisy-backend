import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductMetrics from '../models/ProductMetrics';
import { databaseConfig } from '../config/tenant';

dotenv.config();

/**
 * Seed ProductMetrics collection with dummy data
 * Run with: npx ts-node src/scripts/seedProductMetrics.ts
 */

const sampleProductIds = [
  '14803440370036',
  '14802834686324',
  '14802833637748'
];

const seedProductMetrics = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(databaseConfig.mongodbUri);
    console.log('🟢 Connected to MongoDB');

    // Clear existing data (optional)
    await ProductMetrics.deleteMany({});
    console.log('🗑️  Cleared existing ProductMetrics');

    // Create sample metrics
    const metricsData = sampleProductIds.map((productId, index) => ({
      productId,
      soldThisMonth: Math.floor(Math.random() * 500) + 50, // Random between 50-550
      soldLastMonth: Math.floor(Math.random() * 400) + 30,
      isBestSeller: index < 2, // First 2 are best sellers
      lastUpdated: new Date(),
    }));

    const metrics = await ProductMetrics.insertMany(metricsData);
    console.log(`✅ Seeded ${metrics.length} ProductMetrics records:`);
    metrics.forEach((m) => {
      console.log(`  - Product ${m.productId}: ${m.soldThisMonth} sold, Best Seller: ${m.isBestSeller}`);
    });

    // Disconnect
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error seeding ProductMetrics:', error);
    process.exit(1);
  }
};

seedProductMetrics();
