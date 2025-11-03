// Debug script for checkout complete API issue
require('dotenv').config();
const mongoose = require('mongoose');

const sessionId = "69089f00f84dc38606d167ed";
const userId = "68fde791591675c846f98c0b";

async function debugCheckout() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cartaisy');
    console.log('✓ Connected to MongoDB\n');

    // Import models
    const CheckoutSession = require('./dist/models/CheckoutSession').default;
    const User = require('./dist/models/User').default;

    console.log('=== DEBUGGING CHECKOUT ISSUE ===\n');

    // 1. Check session
    console.log('1. Checking session:', sessionId);
    const session = await CheckoutSession.findById(sessionId);

    if (!session) {
      console.log('❌ Session not found!');
      process.exit(1);
    }

    console.log('✓ Session found');
    console.log('  Status:', session.status);
    console.log('  Current Step:', session.currentStep);
    console.log('  Completed Steps:', session.completedSteps);
    console.log('  Shipping Address ID:', session.shippingAddressId);
    console.log('  Payment Method ID:', session.paymentMethodId);
    console.log('  Selected Shipping Rate:', session.selectedShippingRate ? 'Present' : 'Missing');
    console.log('  Contact Number:', session.contactNumber);
    console.log('  Grand Total:', session.grandTotal, session.currency);

    // 2. Check user and addresses
    console.log('\n2. Checking user and addresses');
    const user = await User.findById(userId);

    if (!user) {
      console.log('❌ User not found!');
      process.exit(1);
    }

    console.log('✓ User found:', user.email);
    console.log('  Total addresses:', user.addresses?.length || 0);

    if (user.addresses && user.addresses.length > 0) {
      user.addresses.forEach((addr, index) => {
        console.log(`\n  Address ${index}:`, addr.label || 'No label');
        console.log('    Country:', addr.country, '(code:', addr.countryCode, ')');
        console.log('    Province:', addr.province);
        console.log('    City:', addr.city);
        console.log('    Zip:', addr.zip);
        console.log('    Phone:', addr.phone);
        console.log('    Is Default:', addr.isDefault);
      });
    }

    // 3. Check if shippingAddressId is valid
    console.log('\n3. Validating shipping address');
    if (session.shippingAddressId === undefined || session.shippingAddressId === null) {
      console.log('❌ Shipping address ID is null/undefined!');
      console.log('   You need to call save-shipping endpoint first');
    } else if (!user.addresses || !user.addresses[session.shippingAddressId]) {
      console.log('❌ Shipping address ID', session.shippingAddressId, 'does not exist in user addresses!');
      console.log('   User has', user.addresses?.length || 0, 'addresses');
    } else {
      const shippingAddr = user.addresses[session.shippingAddressId];
      console.log('✓ Shipping address is valid');
      console.log('  Using address:', shippingAddr.label || 'No label');
      console.log('  Country:', shippingAddr.country, '/', shippingAddr.countryCode);
      console.log('  Province:', shippingAddr.province);
      console.log('  City:', shippingAddr.city);
      console.log('  Zip:', shippingAddr.zip);
    }

    // 4. Validation check
    console.log('\n4. Checkout validation');
    const canProceed = (
      (session.shippingAddressId !== undefined && session.shippingAddressId !== null) &&
      !!session.selectedShippingRate &&
      !!session.paymentMethodId &&
      (session.status === 'step3' || session.status === 'failed')
    );

    if (canProceed) {
      console.log('✓ All required fields are present');
    } else {
      console.log('❌ Missing required fields:');
      if (session.shippingAddressId === undefined || session.shippingAddressId === null) {
        console.log('  - Shipping address');
      }
      if (!session.selectedShippingRate) {
        console.log('  - Shipping method');
      }
      if (!session.paymentMethodId) {
        console.log('  - Payment method');
      }
      if (session.status !== 'step3' && session.status !== 'failed') {
        console.log('  - Status must be step3 or failed (current:', session.status + ')');
      }
    }

    console.log('\n=== DIAGNOSIS ===');
    if (canProceed && user.addresses && user.addresses[session.shippingAddressId]) {
      console.log('✅ Session looks good! The issue might be:');
      console.log('  1. Payment processing error with Stripe');
      console.log('  2. Shopify cart issue');
      console.log('  3. Address normalization issue');
      console.log('\nTry calling the complete endpoint and check server logs for exact error.');
    } else {
      console.log('❌ Session is not ready for completion!');
      console.log('You need to:');
      if (!session.shippingAddressId) {
        console.log('  1. Call POST /checkout/save-shipping with correct address');
      }
      if (!session.paymentMethodId) {
        console.log('  2. Call POST /checkout/step2 with payment method');
      }
      if (session.status !== 'step3' && session.status !== 'failed') {
        console.log('  3. Complete all checkout steps');
      }
    }

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

debugCheckout();
