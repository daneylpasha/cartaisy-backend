import mongoose from 'mongoose';
import { databaseConfig } from '../config/tenant';

async function dropSupportTicketIndex() {
  try {
    console.log('🔍 Connecting to database...');

    await mongoose.connect(databaseConfig.mongodbUri, {
      maxPoolSize: databaseConfig.maxPoolSize,
      minPoolSize: databaseConfig.minPoolSize,
      connectTimeoutMS: databaseConfig.connectionTimeout
    });

    console.log('✓ Connected to database');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const ordersCollection = db.collection('orders');

    // List all indexes
    console.log('\n📋 Current indexes on orders collection:');
    const indexes = await ordersCollection.indexes();
    indexes.forEach((idx: any) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Drop the problematic index
    try {
      console.log('\n🗑️  Dropping supportTickets.id_1 index...');
      await ordersCollection.dropIndex('supportTickets.id_1');
      console.log('✓ Index dropped successfully');
    } catch (error: any) {
      if (error.code === 27) {
        console.log('ℹ️  Index does not exist (already dropped)');
      } else {
        throw error;
      }
    }

    // List indexes after drop
    console.log('\n📋 Indexes after drop:');
    const indexesAfter = await ordersCollection.indexes();
    indexesAfter.forEach((idx: any) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

dropSupportTicketIndex();
