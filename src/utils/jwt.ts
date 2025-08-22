import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_IN = '30d';

interface TokenPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/**
 * Generates JWT token with user ID payload
 * @param userId - User ID to encode in token
 * @returns JWT token string
 */
export const generateToken = (userId: string): string => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );
};

/**
 * Verifies JWT token and returns decoded payload
 * @param token - JWT token to verify
 * @returns Decoded token payload
 * @throws Error if token is invalid or expired
 */
export const verifyToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
};

/**
 * Generates longer-lived refresh token
 * @param userId - User ID to encode in token
 * @returns Refresh token string
 */
export const generateRefreshToken = (userId: string): string => {
  return jwt.sign(
    { userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN } as jwt.SignOptions
  );
};

/**
 * Decodes token without verification (useful for debugging)
 * @param token - JWT token to decode
 * @returns Decoded token payload or null
 */
export const decodeToken = (token: string): TokenPayload | null => {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
};