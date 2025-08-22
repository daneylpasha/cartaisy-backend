# Cartaisy Backend API Documentation

Complete API documentation for the Cartaisy multi-tenant e-commerce backend, designed for React Native mobile applications.

## 🚀 Getting Started

### Base URL
```
Development: http://localhost:3000/api
Production: https://api.yourstore.com/api
```

### API Version
Current version: **v1**

All authentication endpoints are prefixed with `/v1/auth`

### Authentication
This API uses **JWT (JSON Web Tokens)** for authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer your_jwt_token_here
```

## 📊 Health Check

### GET /api/health

Check the API server status, database connection, and system information.

**Request:**
```bash
GET /api/health
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Cartaisy Store API is running!",
  "timestamp": "2025-08-21T18:07:28.391Z",
  "system": {
    "version": "v1",
    "environment": "development",
    "uptime": 17,
    "memory": {
      "used": 250,
      "total": 278
    }
  },
  "database": {
    "status": "connected",
    "name": "MongoDB"
  },
  "store": {
    "name": "Cartaisy Store",
    "domain": "example.myshopify.com",
    "currency": "USD",
    "country": "US"
  },
  "features": ["inventorytracking"],
  "integrations": {
    "shopify": false,
    "stripe": false,
    "paypal": false,
    "email": "smtp",
    "analytics": false
  },
  "api": {
    "baseUrl": "http://localhost:3000",
    "version": "v1",
    "endpoints": [...]
  }
}
```

---

## 🔐 Authentication Endpoints

### 1. User Registration

Register a new user account.

**Endpoint:** `POST /api/v1/auth/register`

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Validation Rules:**
- `name`: Required, minimum 2 characters
- `email`: Required, valid email format
- `password`: Required, minimum 6 characters

**Success Response (201):**
```json
{
  "status": "success",
  "message": "Registration successful! Welcome to our platform.",
  "data": {
    "user": {
      "id": "66c5f9a1b2c3d4e5f6789012",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": false,
      "isActive": true,
      "createdAt": "2025-08-21T18:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**
- `400`: Validation errors or email already exists
- `500`: Server error

**Rate Limit:** 50 requests per 15 minutes

---

### 2. User Login

Authenticate an existing user.

**Endpoint:** `POST /api/v1/auth/login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "user": {
      "id": "66c5f9a1b2c3d4e5f6789012",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": false,
      "isActive": true,
      "avatar": null,
      "lastLoginAt": "2025-08-21T18:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**
- `401`: Invalid email or password
- `403`: Account deactivated
- `429`: Too many login attempts

**Rate Limit:** 50 requests per 15 minutes

---

### 3. Get User Profile

Retrieve the authenticated user's profile information.

**Endpoint:** `GET /api/v1/auth/profile`

**Headers:**
```
Authorization: Bearer your_jwt_token_here
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "66c5f9a1b2c3d4e5f6789012",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": false,
      "isActive": true,
      "avatar": null,
      "phone": "+1234567890",
      "dateOfBirth": "1990-01-15T00:00:00.000Z",
      "addresses": [],
      "preferences": {},
      "totalOrdersCount": 5,
      "totalSpent": 249.99,
      "createdAt": "2025-08-21T18:00:00.000Z",
      "lastLoginAt": "2025-08-21T18:00:00.000Z"
    }
  }
}
```

**Error Responses:**
- `401`: No token provided or invalid token
- `404`: User not found

**Authentication:** Required

---

### 4. Update User Profile

Update the authenticated user's profile information.

**Endpoint:** `PATCH /api/v1/auth/profile`

**Headers:**
```
Authorization: Bearer your_jwt_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "John Updated",
  "phone": "+1234567890",
  "dateOfBirth": "1990-01-15",
  "avatar": "https://example.com/avatar.jpg"
}
```

**Allowed Fields:**
- `name`: User's display name
- `phone`: Phone number
- `dateOfBirth`: Date of birth (YYYY-MM-DD format)
- `avatar`: Avatar image URL

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "id": "66c5f9a1b2c3d4e5f6789012",
      "name": "John Updated",
      "email": "john@example.com",
      "phone": "+1234567890",
      "dateOfBirth": "1990-01-15T00:00:00.000Z",
      "avatar": "https://example.com/avatar.jpg"
    }
  }
}
```

**Error Responses:**
- `400`: Validation errors
- `401`: Authentication required
- `404`: User not found

**Authentication:** Required

---

### 5. Change Password

Change the authenticated user's password.

**Endpoint:** `POST /api/v1/auth/change-password`

**Headers:**
```
Authorization: Bearer your_jwt_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Password changed successfully",
  "data": {
    "token": "new_jwt_token_here"
  }
}
```

**Error Responses:**
- `400`: Validation errors
- `401`: Current password incorrect or authentication required
- `429`: Too many attempts

**Authentication:** Required
**Rate Limit:** 50 requests per 15 minutes

---

### 6. Forgot Password

Request a password reset link via email.

**Endpoint:** `POST /api/v1/auth/forgot-password`

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "If an account exists with this email, you will receive a password reset link shortly."
}
```

**Note:** For security, this endpoint always returns success, regardless of whether the email exists.

**Error Response:**
- `500`: Email service error

**Rate Limit:** 20 requests per hour

---

### 7. Reset Password

Reset password using the token from email.

**Endpoint:** `POST /api/v1/auth/reset-password`

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "newpassword123"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "message": "Password reset successful",
  "data": {
    "token": "new_jwt_token_here"
  }
}
```

**Error Responses:**
- `400`: Invalid or expired token
- `500`: Server error

**Rate Limit:** 20 requests per hour

---

## 🔒 JWT Token Details

### Token Structure
```json
{
  "userId": "66c5f9a1b2c3d4e5f6789012",
  "email": "john@example.com",
  "role": "customer",
  "iat": 1692640800,
  "exp": 1692727200
}
```

### Token Expiration
- **Access Token**: 24 hours
- **Refresh Token**: 7 days

### Token Usage in React Native

```javascript
// Store token
import AsyncStorage from '@react-native-async-storage/async-storage';

await AsyncStorage.setItem('auth_token', token);

// Use token in requests
const token = await AsyncStorage.getItem('auth_token');

const response = await fetch('https://api.yourstore.com/api/v1/auth/profile', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## 🚦 Rate Limiting

Rate limits protect the API from abuse and ensure fair usage.

### Authentication Endpoints
- **Limit**: 50 requests per 15 minutes
- **Applies to**: register, login, change-password

### Password Reset Endpoints
- **Limit**: 20 requests per hour
- **Applies to**: forgot-password, reset-password

### Rate Limit Headers
```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 49
X-RateLimit-Reset: 1692641400
```

### Rate Limit Exceeded Response (429)
```json
{
  "status": "error",
  "message": "Too many requests, please try again later."
}
```

---

## ⚠️ Error Handling

### Standard Error Response Format
```json
{
  "status": "error",
  "message": "Error description",
  "errors": [
    {
      "field": "email",
      "message": "Please enter a valid email address"
    }
  ]
}
```

### HTTP Status Codes
- `200`: Success
- `201`: Created (registration successful)
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (authentication required/failed)
- `403`: Forbidden (account deactivated)
- `404`: Not Found
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error

### Common Error Scenarios

**Authentication Errors:**
```json
{
  "status": "error",
  "message": "Access denied. No token provided."
}
```

**Validation Errors:**
```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "field": "password",
      "message": "Password must be at least 6 characters long"
    }
  ]
}
```

---

## 📱 React Native Integration Guide

### 1. Installation
```bash
npm install @react-native-async-storage/async-storage
```

### 2. Authentication Service Example
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

class AuthService {
  constructor() {
    this.baseURL = 'https://api.yourstore.com/api/v1/auth';
  }

  async register(userData) {
    const response = await fetch(`${this.baseURL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData)
    });

    const data = await response.json();
    
    if (response.ok && data.data.token) {
      await AsyncStorage.setItem('auth_token', data.data.token);
      await AsyncStorage.setItem('refresh_token', data.data.refreshToken);
      return data;
    }
    
    throw new Error(data.message);
  }

  async login(email, password) {
    const response = await fetch(`${this.baseURL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    
    if (response.ok && data.data.token) {
      await AsyncStorage.setItem('auth_token', data.data.token);
      await AsyncStorage.setItem('refresh_token', data.data.refreshToken);
      return data;
    }
    
    throw new Error(data.message);
  }

  async getProfile() {
    const token = await AsyncStorage.getItem('auth_token');
    
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${this.baseURL}/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      return data.data.user;
    }
    
    if (response.status === 401) {
      // Token expired, redirect to login
      await this.logout();
      throw new Error('Session expired. Please login again.');
    }
    
    throw new Error(data.message);
  }

  async updateProfile(updates) {
    const token = await AsyncStorage.getItem('auth_token');
    
    const response = await fetch(`${this.baseURL}/profile`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates)
    });

    const data = await response.json();
    
    if (response.ok) {
      return data.data.user;
    }
    
    throw new Error(data.message);
  }

  async changePassword(currentPassword, newPassword) {
    const token = await AsyncStorage.getItem('auth_token');
    
    const response = await fetch(`${this.baseURL}/change-password`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await response.json();
    
    if (response.ok) {
      // Update stored token
      await AsyncStorage.setItem('auth_token', data.data.token);
      return data;
    }
    
    throw new Error(data.message);
  }

  async forgotPassword(email) {
    const response = await fetch(`${this.baseURL}/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();
    return data;
  }

  async logout() {
    await AsyncStorage.multiRemove(['auth_token', 'refresh_token']);
  }

  async isAuthenticated() {
    const token = await AsyncStorage.getItem('auth_token');
    return !!token;
  }
}

export default new AuthService();
```

### 3. Usage in Components
```javascript
import React, { useState } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import AuthService from './AuthService';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    
    try {
      const result = await AuthService.login(email, password);
      Alert.alert('Success', 'Login successful!');
      navigation.navigate('Dashboard');
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        keyboardType="email-address"
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />
      <Button
        title={loading ? 'Logging in...' : 'Login'}
        onPress={handleLogin}
        disabled={loading}
      />
    </View>
  );
};
```

---

## 🚨 Security Best Practices

### For Frontend Developers

1. **Secure Token Storage**
   - Use AsyncStorage for React Native
   - Never store tokens in plain text files
   - Consider using Keychain/Keystore for sensitive data

2. **Token Refresh**
   - Implement automatic token refresh using refresh tokens
   - Handle 401 responses by redirecting to login

3. **Input Validation**
   - Validate all inputs on the client side
   - Don't rely solely on server-side validation

4. **HTTPS Only**
   - Always use HTTPS in production
   - Never send credentials over HTTP

5. **Error Handling**
   - Don't expose sensitive error information to users
   - Log errors for debugging purposes

### API Security Features

- JWT token-based authentication
- Password hashing using bcrypt
- Rate limiting to prevent abuse
- Input validation and sanitization
- CORS configuration for specific domains
- Helmet.js security headers
- MongoDB injection protection

---

## 🔍 Troubleshooting

### Common Issues

**1. "No token provided" Error**
```javascript
// Solution: Ensure token is stored and sent correctly
const token = await AsyncStorage.getItem('auth_token');
if (!token) {
  // Redirect to login
}
```

**2. "Invalid token" Error**
```javascript
// Solution: Token might be expired, try refresh or re-login
if (response.status === 401) {
  await AuthService.logout();
  navigation.navigate('Login');
}
```

**3. Rate Limiting Errors**
```javascript
// Solution: Implement exponential backoff
const retryWithDelay = async (fn, retries = 3, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && error.status === 429) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithDelay(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};
```

**4. Network Connectivity Issues**
```javascript
// Solution: Check network state and handle offline scenarios
import NetInfo from '@react-native-netinfo/netinfo';

const checkConnectivity = async () => {
  const state = await NetInfo.fetch();
  if (!state.isConnected) {
    Alert.alert('No Internet', 'Please check your connection');
    return false;
  }
  return true;
};
```

---

## 📞 Support

For API support and questions:

- **Documentation Issues**: Check this documentation for latest updates
- **Rate Limiting**: Implement proper retry mechanisms
- **Authentication**: Ensure proper token handling
- **Server Logs**: Check server logs for debugging information

### Health Check Debugging
Use the `/api/health` endpoint to check:
- Server status
- Database connectivity
- System memory usage
- Enabled features
- Active integrations

---

## 🔄 Changelog

### Version 1.0.0 (Current)
- Initial authentication system
- User registration and login
- Profile management
- Password reset functionality
- JWT token-based authentication
- Rate limiting implementation
- Comprehensive error handling
- Enhanced health check endpoint

---

**🎉 Your authentication system is now ready for React Native integration!**