import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongod: MongoMemoryReplSet;

// Setup test database before all tests
beforeAll(async () => {
  // Start in-memory MongoDB replica set for transaction support
  mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  const uri = mongod.getUri();
  
  await mongoose.connect(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    connectTimeoutMS: 30000
  });
});

// Cleanup after each test
afterEach(async () => {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Cleanup after all tests
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
});

// Test utilities
export const createTestUser = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'password123'
};

export const createInvalidUser = {
  name: '',
  email: 'invalid-email',
  password: '123'
};
