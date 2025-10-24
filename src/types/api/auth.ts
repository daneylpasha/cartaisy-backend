/**
 * Authentication API Types
 * Used by TSOA controllers for OpenAPI/Swagger generation
 */

/**
 * User registration request
 */
export interface RegisterRequest {
  email: string;
  password: string;
}

/**
 * User registration response
 */
export interface RegisterResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    user: {
      id: string;
      name?: string;
      email: string;
      role: string;
      isEmailVerified: boolean;
      isActive: boolean;
      createdAt: Date;
    };
    token: string;
    refreshToken: string;
  };
}

/**
 * User login request
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * User login response
 */
export interface LoginResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    user: {
      id: string;
      name?: string;
      email: string;
      role: string;
      isEmailVerified: boolean;
      isActive: boolean;
      avatar?: string;
      lastLoginAt?: Date;
    };
    token: string;
    refreshToken: string;
  };
}

/**
 * Forgot password request
 */
export interface ForgotPasswordRequest {
  email: string;
}

/**
 * Forgot password response
 */
export interface ForgotPasswordResponse {
  status: 'success' | 'error';
  message: string;
}

/**
 * Reset password request
 */
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

/**
 * Reset password response
 */
export interface ResetPasswordResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    token: string;
  };
}

/**
 * Get profile response
 */
export interface GetProfileResponse {
  status: 'success' | 'error';
  message?: string;
  data?: {
    user: {
      id: string;
      name?: string;
      email: string;
      role: string;
      isEmailVerified: boolean;
      isActive: boolean;
      avatar?: string;
      phone?: string;
      dateOfBirth?: Date;
      addresses?: any[];
      preferences?: any;
      totalOrdersCount?: number;
      totalSpent?: number;
      createdAt: Date;
      lastLoginAt?: Date;
    };
  };
}

/**
 * Update profile request - accepts any key/value pairs
 * Restricted fields cannot be updated
 */
export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
  avatar?: string;
  dateOfBirth?: Date;
  gender?: string;
  interests?: string[];
  bio?: string;
  occupation?: string;
  company?: string;
  website?: string;
  socialLinks?: Record<string, string>;
  addresses?: any[];
  currency?: string;
  language?: string;
  theme?: string;
  notifications?: Record<string, boolean>;
  [key: string]: any; // Allow additional fields
}

/**
 * Update profile response
 */
export interface UpdateProfileResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    user: any;
    updatedFields: string[];
  };
}

/**
 * Change password request
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * Change password response
 */
export interface ChangePasswordResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    token: string;
  };
}

/**
 * Delete account request
 */
export interface DeleteAccountRequest {
  password: string;
}

/**
 * Delete account response
 */
export interface DeleteAccountResponse {
  status: 'success' | 'error';
  message: string;
}
