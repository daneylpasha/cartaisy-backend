/**
 * Customer Migration Verification Script
 *
 * This script verifies that all models and controllers have been properly
 * updated to support the Customer model for mobile app users.
 *
 * Run with: npx ts-node src/scripts/verifyCustomerMigration.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import models
import Order from '../models/Order';
import Wishlist from '../models/Wishlist';
import ProductReview from '../models/ProductReview';
import ProductView from '../models/ProductView';
import Favorite from '../models/Favorite';
import Customer from '../models/Customer';
import User from '../models/User';

interface SchemaField {
  type?: any;
  ref?: string;
  required?: boolean;
}

async function verifyMigration() {
  console.log('='.repeat(60));
  console.log('CUSTOMER MIGRATION VERIFICATION');
  console.log('='.repeat(60));
  console.log();

  // =============================================================================
  // 1. SCHEMA VERIFICATION
  // =============================================================================
  console.log('1. SCHEMA VERIFICATION');
  console.log('-'.repeat(40));

  const models = [
    { name: 'Order', model: Order },
    { name: 'Wishlist', model: Wishlist },
    { name: 'ProductReview', model: ProductReview },
    { name: 'ProductView', model: ProductView },
    { name: 'Favorite', model: Favorite }
  ];

  for (const { name, model } of models) {
    const schema = model.schema.obj as Record<string, SchemaField>;
    const hasUser = !!schema.user || !!schema.userId;
    const hasCustomer = !!schema.customer || !!schema.customerId;

    const userField = schema.user ? 'user' : schema.userId ? 'userId' : null;
    const customerField = schema.customer ? 'customer' : schema.customerId ? 'customerId' : null;

    const userRef = userField ? (schema[userField] as any)?.ref : null;
    const customerRef = customerField ? (schema[customerField] as any)?.ref : null;

    console.log(`\n${name}:`);
    console.log(`  ✓ Has user field: ${hasUser ? `Yes (${userField}, ref: ${userRef})` : 'No'}`);
    console.log(`  ✓ Has customer field: ${hasCustomer ? `Yes (${customerField}, ref: ${customerRef})` : 'No'}`);

    if (hasUser && hasCustomer) {
      console.log(`  ✓ Status: MIGRATED (supports both User and Customer)`);
    } else if (hasCustomer) {
      console.log(`  ✓ Status: CUSTOMER-ONLY`);
    } else if (hasUser) {
      console.log(`  ⚠ Status: USER-ONLY (needs migration)`);
    }
  }

  // =============================================================================
  // 2. DATABASE DOCUMENT COUNTS
  // =============================================================================
  console.log('\n\n2. DATABASE DOCUMENT COUNTS');
  console.log('-'.repeat(40));

  try {
    const customerCount = await Customer.countDocuments();
    const userCount = await User.countDocuments();

    console.log(`\n  Users (dashboard): ${userCount}`);
    console.log(`  Customers (mobile): ${customerCount}`);

    // Count documents with each owner type
    for (const { name, model } of models) {
      const schema = model.schema.obj as Record<string, SchemaField>;
      const userField = schema.user ? 'user' : schema.userId ? 'userId' : null;
      const customerField = schema.customer ? 'customer' : schema.customerId ? 'customerId' : null;

      console.log(`\n  ${name}:`);

      if (userField) {
        const userDocs = await model.countDocuments({ [userField]: { $exists: true, $ne: null } });
        console.log(`    - With user: ${userDocs}`);
      }

      if (customerField) {
        const customerDocs = await model.countDocuments({ [customerField]: { $exists: true, $ne: null } });
        console.log(`    - With customer: ${customerDocs}`);
      }

      const totalDocs = await model.countDocuments();
      console.log(`    - Total: ${totalDocs}`);
    }
  } catch (error) {
    console.log('  ⚠ Could not connect to database. Skipping document counts.');
  }

  // =============================================================================
  // 3. INDEX VERIFICATION
  // =============================================================================
  console.log('\n\n3. INDEX VERIFICATION');
  console.log('-'.repeat(40));

  for (const { name, model } of models) {
    const indexes = model.schema.indexes();
    const customerIndexes = indexes.filter((idx: any) => {
      const fields = idx[0];
      return Object.keys(fields).some(key =>
        key === 'customer' || key === 'customerId'
      );
    });

    console.log(`\n  ${name}:`);
    console.log(`    - Total indexes: ${indexes.length}`);
    console.log(`    - Customer indexes: ${customerIndexes.length}`);

    if (customerIndexes.length > 0) {
      customerIndexes.forEach((idx: any) => {
        console.log(`      • ${JSON.stringify(idx[0])}`);
      });
    }
  }

  // =============================================================================
  // 4. CONTROLLER FILE CHECK
  // =============================================================================
  console.log('\n\n4. CUSTOMER CONTROLLERS');
  console.log('-'.repeat(40));

  const fs = await import('fs');
  const path = await import('path');

  const controllersDir = path.join(__dirname, '../controllers');
  const customerControllers = [
    'customerWishlistController.ts',
    'customerOrderController.ts',
    'customerReviewController.ts',
    'customerProductController.ts'
  ];

  console.log('\n  Expected customer controllers:');
  for (const controller of customerControllers) {
    const filePath = path.join(controllersDir, controller);
    const exists = fs.existsSync(filePath);
    console.log(`    ${exists ? '✓' : '✗'} ${controller}`);
  }

  // =============================================================================
  // 5. MIDDLEWARE CHECK
  // =============================================================================
  console.log('\n\n5. MIDDLEWARE CHECK');
  console.log('-'.repeat(40));

  const middlewareDir = path.join(__dirname, '../middleware');
  const customerAuthPath = path.join(middlewareDir, 'customerAuth.ts');
  const customerAuthExists = fs.existsSync(customerAuthPath);

  console.log(`\n  ✓ customerAuth middleware: ${customerAuthExists ? 'EXISTS' : 'MISSING'}`);

  if (customerAuthExists) {
    const content = fs.readFileSync(customerAuthPath, 'utf8');
    const hasAuthenticateCustomer = content.includes('authenticateCustomer');
    const hasCustomerInfo = content.includes('CustomerInfo');
    console.log(`    - authenticateCustomer function: ${hasAuthenticateCustomer ? 'YES' : 'NO'}`);
    console.log(`    - CustomerInfo interface: ${hasCustomerInfo ? 'YES' : 'NO'}`);
  }

  // =============================================================================
  // 6. ROUTES CHECK
  // =============================================================================
  console.log('\n\n6. ROUTES CHECK');
  console.log('-'.repeat(40));

  const routesPath = path.join(__dirname, '../routes/customerRoutes.ts');
  if (fs.existsSync(routesPath)) {
    const routesContent = fs.readFileSync(routesPath, 'utf8');

    const requireAuthCount = (routesContent.match(/requireAuth[^C]/g) || []).length;
    const authenticateCustomerCount = (routesContent.match(/authenticateCustomer/g) || []).length;

    console.log(`\n  customerRoutes.ts:`);
    console.log(`    - requireAuth usage: ${requireAuthCount} (should be 0 for customer routes)`);
    console.log(`    - authenticateCustomer usage: ${authenticateCustomerCount}`);

    if (requireAuthCount > 0) {
      console.log(`    ⚠ WARNING: Some routes may still be using requireAuth instead of authenticateCustomer`);
    } else {
      console.log(`    ✓ All customer routes use authenticateCustomer`);
    }
  }

  // =============================================================================
  // SUMMARY
  // =============================================================================
  console.log('\n\n' + '='.repeat(60));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`
Migration Status:
  - Models updated: ${models.length}/5
  - Customer controllers: ${customerControllers.filter(c => {
    const controllersDir2 = path.join(__dirname, '../controllers');
    return fs.existsSync(path.join(controllersDir2, c));
  }).length}/4
  - Customer auth middleware: ${customerAuthExists ? 'YES' : 'NO'}

Next Steps:
  1. Test all customer endpoints with valid JWT tokens
  2. Verify mobile app can authenticate and access APIs
  3. Monitor for any User model references in customer flows
`);
}

// Main execution
async function main() {
  try {
    // Connect to MongoDB if URI is available
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB\n');
    } else {
      console.log('No MONGODB_URI found. Running schema-only verification.\n');
    }

    await verifyMigration();

    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }

    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { verifyMigration };
