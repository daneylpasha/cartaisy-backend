# Authentication API Manual Testing Guide

This guide provides comprehensive testing scenarios for the authentication system using curl commands and expected responses.

## Prerequisites

- Server running at `http://localhost:3000`
- `curl` and `jq` installed for JSON formatting
- Terminal or command line access

## Test Environment Setup

```bash
# Start server
yarn dev

# Check server health
curl -s http://localhost:3000/api/health | jq
```

Expected health response:
```json
{
  "status": "success",
  "message": "Cartaisy Store API is running!",
  "timestamp": "2025-XX-XXTXX:XX:XX.XXXZ",
  "version": "v1",
  "store": "Cartaisy Store",
  "environment": "development"
}
```

## 1. User Registration Tests

### ✅ Valid Registration

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }' | jq
```

**Expected Response (201):**
```json
{
  "status": "success",
  "message": "Registration successful! Welcome to our platform.",
  "data": {
    "user": {
      "id": "user_id_here",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": false,
      "isActive": true,
      "createdAt": "2025-XX-XXTXX:XX:XX.XXXZ"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### ❌ Registration with Existing Email

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "john@example.com",
    "password": "password123"
  }' | jq
```

**Expected Response (400):**
```json
{
  "status": "error",
  "message": "Email address already exists"
}
```

### ❌ Registration with Invalid Data

```bash
# Missing required fields
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "",
    "email": "invalid-email",
    "password": "123"
  }' | jq
```

**Expected Response (400):**
```json
{
  "status": "error",
  "message": "Validation errors",
  "errors": [
    {
      "field": "name",
      "message": "Name is required"
    },
    {
      "field": "email",
      "message": "Please enter a valid email address"
    },
    {
      "field": "password",
      "message": "Password must be at least 6 characters long"
    }
  ]
}
```

## 2. User Login Tests

### ✅ Valid Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }' | jq
```

**Expected Response (200):**
```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user_id_here",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": false,
      "isActive": true,
      "avatar": null,
      "lastLoginAt": "2025-XX-XXTXX:XX:XX.XXXZ"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### ❌ Invalid Credentials

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "wrongpassword"
  }' | jq
```

**Expected Response (401):**
```json
{
  "status": "error",
  "message": "Invalid email or password"
}
```

### ❌ Non-existent User

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nonexistent@example.com",
    "password": "password123"
  }' | jq
```

**Expected Response (401):**
```json
{
  "status": "error",
  "message": "Invalid email or password"
}
```

## 3. Profile Access Tests

### ✅ Valid Token Access

```bash
# First, get a token from login (save the token from login response)
TOKEN="your_jwt_token_here"

curl -X GET http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected Response (200):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "user_id_here",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": false,
      "isActive": true,
      "avatar": null,
      "phone": null,
      "dateOfBirth": null,
      "addresses": [],
      "preferences": {},
      "totalOrdersCount": 0,
      "totalSpent": 0,
      "createdAt": "2025-XX-XXTXX:XX:XX.XXXZ",
      "lastLoginAt": "2025-XX-XXTXX:XX:XX.XXXZ"
    }
  }
}
```

### ❌ No Token Provided

```bash
curl -X GET http://localhost:3000/api/v1/auth/profile | jq
```

**Expected Response (401):**
```json
{
  "status": "error",
  "message": "Access denied. No token provided."
}
```

### ❌ Invalid Token

```bash
curl -X GET http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer invalid.token.here" | jq
```

**Expected Response (401):**
```json
{
  "status": "error",
  "message": "Invalid token"
}
```

## 4. Profile Update Tests

### ✅ Valid Profile Update

```bash
TOKEN="your_jwt_token_here"

curl -X PUT http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Updated",
    "phone": "+1234567890",
    "dateOfBirth": "1990-01-15"
  }' | jq
```

**Expected Response (200):**
```json
{
  "status": "success",
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "id": "user_id_here",
      "name": "John Updated",
      "email": "john@example.com",
      "phone": "+1234567890",
      "dateOfBirth": "1990-01-15T00:00:00.000Z",
      "avatar": null
    }
  }
}
```

## 5. Password Change Tests

### ✅ Valid Password Change

```bash
TOKEN="your_jwt_token_here"

curl -X PUT http://localhost:3000/api/v1/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "password123",
    "newPassword": "newpassword123"
  }' | jq
```

**Expected Response (200):**
```json
{
  "status": "success",
  "message": "Password changed successfully",
  "data": {
    "token": "new_jwt_token_here"
  }
}
```

### ❌ Incorrect Current Password

```bash
TOKEN="your_jwt_token_here"

curl -X PUT http://localhost:3000/api/v1/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "wrongpassword",
    "newPassword": "newpassword123"
  }' | jq
```

**Expected Response (401):**
```json
{
  "status": "error",
  "message": "Current password is incorrect"
}
```

## 6. Password Reset Flow Tests

### ✅ Request Password Reset

```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com"
  }' | jq
```

**Expected Response (200):**
```json
{
  "status": "success",
  "message": "If an account exists with this email, you will receive a password reset link shortly."
}
```

### ✅ Reset Password with Token

```bash
# Note: In a real scenario, you'd get this token from email
# For testing, you'd need to check the database for the reset token
RESET_TOKEN="reset_token_from_email"

curl -X POST http://localhost:3000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "'$RESET_TOKEN'",
    "newPassword": "resetpassword123"
  }' | jq
```

**Expected Response (200):**
```json
{
  "status": "success",
  "message": "Password reset successful",
  "data": {
    "token": "new_jwt_token_here"
  }
}
```

### ❌ Invalid Reset Token

```bash
curl -X POST http://localhost:3000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "invalid_token",
    "newPassword": "resetpassword123"
  }' | jq
```

**Expected Response (400):**
```json
{
  "status": "error",
  "message": "Invalid or expired reset token"
}
```

## 7. Rate Limiting Tests

### Test Rate Limiting on Auth Endpoints

```bash
# Run this command multiple times quickly (over 100 times in 15 minutes)
for i in {1..105}; do
  echo "Request $i:"
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "password"
    }' | jq .message
  sleep 1
done
```

**Expected Response (429) after rate limit exceeded:**
```json
{
  "error": "Too many requests, please try again later."
}
```

## 8. Error Handling Tests

### ❌ Malformed JSON

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "email": }' | jq
```

**Expected Response (400):**
```json
{
  "status": "error",
  "message": "Invalid JSON format"
}
```

### ❌ Missing Content-Type

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -d '{"name": "Test", "email": "test@example.com", "password": "password123"}' | jq
```

**Expected Response (400):**
```json
{
  "status": "error",
  "message": "Content-Type must be application/json"
}
```

## 9. Complete Authentication Flow Test

Here's a complete test script that tests the entire authentication flow:

```bash
#!/bin/bash

echo "🧪 Starting Complete Authentication Flow Test"
echo "============================================"

# 1. Test server health
echo "1. Testing server health..."
HEALTH=$(curl -s http://localhost:3000/api/health | jq -r '.status')
if [ "$HEALTH" = "success" ]; then
  echo "✅ Server is healthy"
else
  echo "❌ Server health check failed"
  exit 1
fi

# 2. Register new user
echo "2. Registering new user..."
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "testflow@example.com",
    "password": "password123"
  }')

REGISTER_STATUS=$(echo $REGISTER_RESPONSE | jq -r '.status')
if [ "$REGISTER_STATUS" = "success" ]; then
  echo "✅ User registration successful"
  TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.data.token')
else
  echo "❌ User registration failed"
  echo $REGISTER_RESPONSE | jq
  exit 1
fi

# 3. Access profile with token
echo "3. Accessing user profile..."
PROFILE_RESPONSE=$(curl -s -X GET http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer $TOKEN")

PROFILE_STATUS=$(echo $PROFILE_RESPONSE | jq -r '.status')
if [ "$PROFILE_STATUS" = "success" ]; then
  echo "✅ Profile access successful"
else
  echo "❌ Profile access failed"
  echo $PROFILE_RESPONSE | jq
  exit 1
fi

# 4. Update profile
echo "4. Updating user profile..."
UPDATE_RESPONSE=$(curl -s -X PUT http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User Updated",
    "phone": "+1234567890"
  }')

UPDATE_STATUS=$(echo $UPDATE_RESPONSE | jq -r '.status')
if [ "$UPDATE_STATUS" = "success" ]; then
  echo "✅ Profile update successful"
else
  echo "❌ Profile update failed"
  echo $UPDATE_RESPONSE | jq
  exit 1
fi

# 5. Change password
echo "5. Changing user password..."
CHANGE_PWD_RESPONSE=$(curl -s -X PUT http://localhost:3000/api/v1/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "password123",
    "newPassword": "newpassword123"
  }')

CHANGE_PWD_STATUS=$(echo $CHANGE_PWD_RESPONSE | jq -r '.status')
if [ "$CHANGE_PWD_STATUS" = "success" ]; then
  echo "✅ Password change successful"
  NEW_TOKEN=$(echo $CHANGE_PWD_RESPONSE | jq -r '.data.token')
else
  echo "❌ Password change failed"
  echo $CHANGE_PWD_RESPONSE | jq
  exit 1
fi

# 6. Login with new password
echo "6. Testing login with new password..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testflow@example.com",
    "password": "newpassword123"
  }')

LOGIN_STATUS=$(echo $LOGIN_RESPONSE | jq -r '.status')
if [ "$LOGIN_STATUS" = "success" ]; then
  echo "✅ Login with new password successful"
else
  echo "❌ Login with new password failed"
  echo $LOGIN_RESPONSE | jq
  exit 1
fi

# 7. Test forgot password
echo "7. Testing forgot password..."
FORGOT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testflow@example.com"
  }')

FORGOT_STATUS=$(echo $FORGOT_RESPONSE | jq -r '.status')
if [ "$FORGOT_STATUS" = "success" ]; then
  echo "✅ Forgot password request successful"
else
  echo "❌ Forgot password request failed"
  echo $FORGOT_RESPONSE | jq
  exit 1
fi

echo ""
echo "🎉 All authentication tests passed successfully!"
echo "============================================"
echo "✅ Server health check"
echo "✅ User registration"
echo "✅ Profile access with token"
echo "✅ Profile update"
echo "✅ Password change"
echo "✅ Login with new credentials"
echo "✅ Forgot password flow"
```

## 10. JWT Token Analysis

To decode and analyze JWT tokens for debugging:

```bash
# Install jq for JSON processing if not already installed
# On macOS: brew install jq

# Decode JWT token (replace with actual token)
TOKEN="your_actual_jwt_token_here"

# Split token and decode payload (second part)
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | jq
```

**Expected JWT Payload:**
```json
{
  "userId": "user_id_here",
  "email": "john@example.com",
  "role": "customer",
  "iat": 1640995200,
  "exp": 1641081600
}
```

## Notes for React Native Integration

- **Token Storage**: Store JWT tokens securely using AsyncStorage or Keychain
- **Token Refresh**: Implement automatic token refresh using the refresh token
- **Error Handling**: Handle 401 responses by redirecting to login screen
- **Network Requests**: Use interceptors to automatically add Authorization headers
- **Rate Limiting**: Implement retry logic with exponential backoff for rate-limited requests

## Troubleshooting Common Issues

1. **Server not responding**: Check if server is running with `yarn dev`
2. **MongoDB connection errors**: Verify MongoDB connection string in `.env`
3. **JWT errors**: Ensure JWT_SECRET is set and at least 32 characters
4. **Rate limiting**: Wait 15 minutes or restart server to reset rate limits
5. **Email errors**: Check SMTP configuration in tenant config

Save this file and run the complete flow test to verify all authentication endpoints work correctly!