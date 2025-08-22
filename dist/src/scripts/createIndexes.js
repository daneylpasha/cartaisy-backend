"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const tenant_1 = require("../config/tenant");
// Import all models to trigger index creation
require("../models/Product");
require("../models/ProductReview");
require("../models/ProductCategory");
require("../models/Wishlist");
require("../models/ProductView");
require("../models/SearchHistory");
require("../models/Order");
require("../models/OrderTracking");
async function createIndexes() {
    try {
        console.log('🔍 Starting database index creation...');
        // Connect to database
        await mongoose_1.default.connect(tenant_1.databaseConfig.mongodbUri, {
            maxPoolSize: tenant_1.databaseConfig.maxPoolSize,
            minPoolSize: tenant_1.databaseConfig.minPoolSize,
            connectTimeoutMS: tenant_1.databaseConfig.connectionTimeout
        });
        console.log('📊 Creating indexes for all collections...');
        // Get all models
        const models = Object.values(mongoose_1.default.models);
        for (const model of models) {
            const collectionName = model.collection.name;
            console.log(`📋 Processing collection: ${collectionName}`);
            try {
                // Create indexes for this model
                await model.createIndexes();
                console.log(`✅ Indexes created for ${collectionName}`);
            }
            catch (error) {
                console.error(`❌ Error creating indexes for ${collectionName}:`, error);
            }
        }
        // Create custom text search indexes
        console.log('🔍 Creating custom text search indexes...');
        // Product text search index
        try {
            await mongoose_1.default.connection.db.collection('products').createIndex({
                title: 'text',
                description: 'text',
                tags: 'text',
                vendor: 'text',
                productType: 'text'
            }, {
                weights: {
                    title: 10,
                    tags: 5,
                    vendor: 3,
                    productType: 2,
                    description: 1
                },
                name: 'product_text_search'
            });
            console.log('✅ Product text search index created');
        }
        catch (error) {
            console.log('ℹ️ Product text search index already exists or error:', error);
        }
        // Category text search index
        try {
            await mongoose_1.default.connection.db.collection('productcategories').createIndex({
                name: 'text',
                description: 'text'
            }, {
                weights: {
                    name: 10,
                    description: 1
                },
                name: 'category_text_search'
            });
            console.log('✅ Category text search index created');
        }
        catch (error) {
            console.log('ℹ️ Category text search index already exists or error:', error);
        }
        // SearchHistory normalized query index
        try {
            await mongoose_1.default.connection.db.collection('searchhistories').createIndex({ normalizedQuery: 'text' }, { name: 'search_query_text' });
            console.log('✅ Search history text index created');
        }
        catch (error) {
            console.log('ℹ️ Search history text index already exists or error:', error);
        }
        // Performance indexes for analytics
        console.log('📈 Creating performance indexes for analytics...');
        const performanceIndexes = [
            // Product analytics
            {
                collection: 'products',
                index: { 'analytics.viewCount': -1, createdAt: -1 },
                name: 'product_popularity'
            },
            {
                collection: 'products',
                index: { 'reviews.averageRating': -1, 'reviews.count': -1 },
                name: 'product_rating'
            },
            {
                collection: 'products',
                index: { price: 1, 'inventoryTracking.totalQuantity': -1 },
                name: 'product_price_stock'
            },
            // Order analytics
            {
                collection: 'orders',
                index: { user: 1, 'mobileStatus.current': 1, placedAt: -1 },
                name: 'user_order_status'
            },
            {
                collection: 'orders',
                index: { placedAt: -1, totalPrice: -1 },
                name: 'order_revenue'
            },
            // Product view analytics
            {
                collection: 'productviews',
                index: { product: 1, viewedAt: -1, 'device.platform': 1 },
                name: 'product_view_analytics'
            },
            {
                collection: 'productviews',
                index: { viewedAt: -1, viewContext: 1 },
                name: 'view_context_analytics'
            },
            // Search analytics
            {
                collection: 'searchhistories',
                index: { normalizedQuery: 1, searchedAt: -1, 'results.hasResults': 1 },
                name: 'search_analytics'
            },
            // Wishlist performance
            {
                collection: 'wishlists',
                index: { user: 1, updatedAt: -1, itemCount: -1 },
                name: 'user_wishlist_performance'
            },
            // Review analytics
            {
                collection: 'productreviews',
                index: { product: 1, status: 1, rating: -1, createdAt: -1 },
                name: 'product_review_analytics'
            }
        ];
        for (const { collection, index, name } of performanceIndexes) {
            try {
                await mongoose_1.default.connection.db.collection(collection).createIndex(index, { name });
                console.log(`✅ Performance index '${name}' created for ${collection}`);
            }
            catch (error) {
                console.log(`ℹ️ Performance index '${name}' already exists or error:`, error);
            }
        }
        // List all indexes for verification
        console.log('\n📋 Index verification:');
        for (const model of models) {
            const collectionName = model.collection.name;
            try {
                const indexes = await model.collection.listIndexes().toArray();
                console.log(`\n📊 ${collectionName} (${indexes.length} indexes):`);
                indexes.forEach(index => {
                    console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
                });
            }
            catch (error) {
                console.error(`❌ Error listing indexes for ${collectionName}:`, error);
            }
        }
        console.log('\n🎉 Database index creation completed successfully!');
        // Close connection
        await mongoose_1.default.connection.close();
        console.log('🔌 Database connection closed');
    }
    catch (error) {
        console.error('❌ Error creating database indexes:', error);
        process.exit(1);
    }
}
// Run the script
if (require.main === module) {
    createIndexes();
}
exports.default = createIndexes;
//# sourceMappingURL=createIndexes.js.map