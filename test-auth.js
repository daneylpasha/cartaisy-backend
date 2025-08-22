#!/usr/bin/env node

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000/api';
const TEST_USER = {
  name: 'Automated Test User',
  email: `test-${Date.now()}@example.com`,
  password: 'password123'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Utility functions
const log = (color, message) => console.log(`${colors[color]}${message}${colors.reset}`);
const success = (message) => log('green', `✅ ${message}`);
const error = (message) => log('red', `❌ ${message}`);
const info = (message) => log('blue', `ℹ️  ${message}`);
const warn = (message) => log('yellow', `⚠️  ${message}`);

let testResults = {
  total: 0,
  passed: 0,
  failed: 0
};

// Test runner
async function runTest(testName, testFn) {
  testResults.total++;
  info(`Testing: ${testName}`);
  
  try {
    await testFn();
    success(`${testName} - PASSED`);
    testResults.passed++;
  } catch (err) {
    error(`${testName} - FAILED: ${err.message}`);
    testResults.failed++;
    if (err.response) {
      console.log('Response:', err.response.data);
    }
  }
  console.log(''); // Empty line for readability
}

// HTTP client with default config
const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Test functions
const tests = {
  async testServerHealth() {
    const response = await client.get('/health');
    
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    
    if (response.data.status !== 'success') {
      throw new Error(`Expected status 'success', got '${response.data.status}'`);
    }
    
    if (!response.data.message.includes('API is running')) {
      throw new Error('Health check message is incorrect');
    }
  },

  async testUserRegistration() {
    const response = await client.post('/v1/auth/register', TEST_USER);
    
    if (response.status !== 201) {
      throw new Error(`Expected status 201, got ${response.status}`);
    }
    
    if (response.data.status !== 'success') {
      throw new Error(`Expected status 'success', got '${response.data.status}'`);
    }
    
    if (!response.data.data.token) {
      throw new Error('No JWT token in registration response');
    }
    
    if (!response.data.data.refreshToken) {
      throw new Error('No refresh token in registration response');
    }
    
    if (response.data.data.user.email !== TEST_USER.email) {
      throw new Error('User email mismatch in response');
    }
    
    if (response.data.data.user.name !== TEST_USER.name) {
      throw new Error('User name mismatch in response');
    }
    
    // Store token for subsequent tests
    this.userToken = response.data.data.token;
    this.userId = response.data.data.user.id;
  },

  async testDuplicateRegistration() {
    try {
      await client.post('/v1/auth/register', TEST_USER);
      throw new Error('Expected registration to fail with duplicate email');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        if (err.response.data.message.includes('already exists')) {
          return; // This is expected
        }
      }
      throw err;
    }
  },

  async testInvalidRegistration() {
    const invalidUser = {
      name: '',
      email: 'invalid-email',
      password: '123'
    };
    
    try {
      await client.post('/v1/auth/register', invalidUser);
      throw new Error('Expected registration to fail with invalid data');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        return; // This is expected
      }
      throw err;
    }
  },

  async testUserLogin() {
    const loginData = {
      email: TEST_USER.email,
      password: TEST_USER.password
    };
    
    const response = await client.post('/v1/auth/login', loginData);
    
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    
    if (response.data.status !== 'success') {
      throw new Error(`Expected status 'success', got '${response.data.status}'`);
    }
    
    if (!response.data.data.token) {
      throw new Error('No JWT token in login response');
    }
    
    if (response.data.data.user.email !== TEST_USER.email) {
      throw new Error('User email mismatch in login response');
    }
    
    // Update token (might be different from registration token)
    this.userToken = response.data.data.token;
  },

  async testInvalidLogin() {
    const invalidLogin = {
      email: TEST_USER.email,
      password: 'wrongpassword'
    };
    
    try {
      await client.post('/v1/auth/login', invalidLogin);
      throw new Error('Expected login to fail with wrong password');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        if (err.response.data.message.includes('Invalid email or password')) {
          return; // This is expected
        }
      }
      throw err;
    }
  },

  async testProfileAccess() {
    if (!this.userToken) {
      throw new Error('No user token available for profile test');
    }
    
    const response = await client.get('/v1/auth/profile', {
      headers: {
        'Authorization': `Bearer ${this.userToken}`
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    
    if (response.data.status !== 'success') {
      throw new Error(`Expected status 'success', got '${response.data.status}'`);
    }
    
    if (response.data.data.user.email !== TEST_USER.email) {
      throw new Error('User email mismatch in profile response');
    }
  },

  async testProfileAccessWithoutToken() {
    try {
      await client.get('/v1/auth/profile');
      throw new Error('Expected profile access to fail without token');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        if (err.response.data.message.includes('No token provided')) {
          return; // This is expected
        }
      }
      throw err;
    }
  },

  async testProfileAccessWithInvalidToken() {
    try {
      await client.get('/v1/auth/profile', {
        headers: {
          'Authorization': 'Bearer invalid.token.here'
        }
      });
      throw new Error('Expected profile access to fail with invalid token');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        if (err.response.data.message.includes('Invalid token')) {
          return; // This is expected
        }
      }
      throw err;
    }
  },

  async testProfileUpdate() {
    if (!this.userToken) {
      throw new Error('No user token available for profile update test');
    }
    
    const updateData = {
      name: 'Updated Test User',
      phone: '+1234567890'
    };
    
    const response = await client.patch('/v1/auth/profile', updateData, {
      headers: {
        'Authorization': `Bearer ${this.userToken}`
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    
    if (response.data.status !== 'success') {
      throw new Error(`Expected status 'success', got '${response.data.status}'`);
    }
    
    if (response.data.data.user.name !== updateData.name) {
      throw new Error('Profile name was not updated correctly');
    }
    
    if (response.data.data.user.phone !== updateData.phone) {
      throw new Error('Profile phone was not updated correctly');
    }
  },

  async testPasswordChange() {
    if (!this.userToken) {
      throw new Error('No user token available for password change test');
    }
    
    const passwordData = {
      currentPassword: TEST_USER.password,
      newPassword: 'newpassword123'
    };
    
    const response = await client.post('/v1/auth/change-password', passwordData, {
      headers: {
        'Authorization': `Bearer ${this.userToken}`
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    
    if (response.data.status !== 'success') {
      throw new Error(`Expected status 'success', got '${response.data.status}'`);
    }
    
    if (!response.data.data.token) {
      throw new Error('No new token returned after password change');
    }
    
    // Update our test user password and token
    TEST_USER.password = passwordData.newPassword;
    this.userToken = response.data.data.token;
  },

  async testLoginWithNewPassword() {
    const loginData = {
      email: TEST_USER.email,
      password: TEST_USER.password
    };
    
    const response = await client.post('/v1/auth/login', loginData);
    
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    
    if (response.data.status !== 'success') {
      throw new Error(`Expected status 'success', got '${response.data.status}'`);
    }
  },

  async testPasswordChangeWithWrongPassword() {
    if (!this.userToken) {
      throw new Error('No user token available for password change test');
    }
    
    const passwordData = {
      currentPassword: 'wrongpassword',
      newPassword: 'anothernewpassword123'
    };
    
    try {
      await client.post('/v1/auth/change-password', passwordData, {
        headers: {
          'Authorization': `Bearer ${this.userToken}`
        }
      });
      throw new Error('Expected password change to fail with wrong current password');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        if (err.response.data.message.includes('Current password is incorrect')) {
          return; // This is expected
        }
      }
      throw err;
    }
  },

  async testForgotPassword() {
    const response = await client.post('/v1/auth/forgot-password', {
      email: TEST_USER.email
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    
    if (response.data.status !== 'success') {
      throw new Error(`Expected status 'success', got '${response.data.status}'`);
    }
    
    if (!response.data.message.includes('reset link shortly')) {
      throw new Error('Forgot password response message is incorrect');
    }
  },

  async testForgotPasswordNonexistentEmail() {
    const response = await client.post('/v1/auth/forgot-password', {
      email: 'nonexistent@example.com'
    });
    
    // Should still return success for security (don't reveal if email exists)
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    
    if (response.data.status !== 'success') {
      throw new Error(`Expected status 'success', got '${response.data.status}'`);
    }
  },

  async testResetPasswordWithInvalidToken() {
    try {
      await client.post('/v1/auth/reset-password', {
        token: 'invalid_reset_token',
        newPassword: 'resetpassword123'
      });
      throw new Error('Expected reset password to fail with invalid token');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        // Accept both validation error messages
        if (err.response.data.message.includes('Invalid or expired reset token') ||
            err.response.data.message.includes('Validation failed')) {
          return; // This is expected
        }
      }
      throw err;
    }
  }
};

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Authentication API Test Suite');
  console.log('==========================================\n');
  
  // Check if server is running
  try {
    await client.get('/health');
    success('Server is running and accessible\n');
  } catch (err) {
    error('Server is not running or not accessible');
    error('Please start the server with: yarn dev');
    process.exit(1);
  }
  
  // Run all tests
  for (const [testName, testFn] of Object.entries(tests)) {
    await runTest(testName, testFn.bind(tests));
  }
  
  // Print summary
  console.log('==========================================');
  console.log('🏁 Test Summary');
  console.log('==========================================');
  log('blue', `Total Tests: ${testResults.total}`);
  success(`Passed: ${testResults.passed}`);
  
  if (testResults.failed > 0) {
    error(`Failed: ${testResults.failed}`);
  } else {
    log('green', 'Failed: 0');
  }
  
  const percentage = ((testResults.passed / testResults.total) * 100).toFixed(1);
  log('cyan', `Success Rate: ${percentage}%`);
  
  if (testResults.failed === 0) {
    console.log('');
    success('🎉 All tests passed! Authentication system is working correctly.');
    process.exit(0);
  } else {
    console.log('');
    error('❌ Some tests failed. Please review the failures above.');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  error('Unhandled promise rejection:');
  console.error(err);
  process.exit(1);
});

// Run the tests
runAllTests().catch((err) => {
  error('Test suite failed to run:');
  console.error(err);
  process.exit(1);
});