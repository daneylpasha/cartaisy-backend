import mongoose from 'mongoose';
import { config } from 'dotenv';

config();

export interface DatabaseConfig {
  uri: string;
  options: mongoose.ConnectOptions;
}

export const databaseConfig: DatabaseConfig = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cartaisy',
  options: {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  }
};

export const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(databaseConfig.uri, databaseConfig.options);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

export default connectDatabase;