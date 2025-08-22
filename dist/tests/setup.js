"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInvalidUser = exports.createTestUser = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
let mongod;
// Setup test database before all tests
beforeAll(async () => {
    // Start in-memory MongoDB instance for testing
    mongod = await mongodb_memory_server_1.MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose_1.default.connect(uri, {
        maxPoolSize: 10,
        minPoolSize: 1,
        connectTimeoutMS: 30000
    });
});
// Cleanup after each test
afterEach(async () => {
    const collections = mongoose_1.default.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
    }
});
// Cleanup after all tests
afterAll(async () => {
    await mongoose_1.default.connection.dropDatabase();
    await mongoose_1.default.connection.close();
    await mongod.stop();
});
// Test utilities
exports.createTestUser = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123'
};
exports.createInvalidUser = {
    name: '',
    email: 'invalid-email',
    password: '123'
};
//# sourceMappingURL=setup.js.map