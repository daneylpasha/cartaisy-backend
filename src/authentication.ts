import { Request } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Express Authentication Handler for TSOA
 * This function is called by tsoa-generated routes when @Security decorator is used
 */
export async function expressAuthentication(
  request: Request,
  securityName: string,
  scopes?: string[]
): Promise<any> {
  if (securityName === 'jwt') {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No token provided');
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

      // Return user object that will be available as request.user in controllers
      return {
        _id: decoded.userId || decoded.id,
        id: decoded.userId || decoded.id,
        email: decoded.email,
        role: decoded.role,
        name: decoded.name,
      };
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  if (securityName === 'jwt-optional') {
    // Optional JWT authentication - doesn't throw errors if token is missing/invalid
    // Returns null for guest users, user object for authenticated users
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided - return null for guest user
      return null;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

      // Return user object that will be available as request.user in controllers
      return {
        _id: decoded.userId || decoded.id,
        id: decoded.userId || decoded.id,
        email: decoded.email,
        role: decoded.role,
        name: decoded.name,
      };
    } catch (error) {
      // Invalid token - return null for guest user
      return null;
    }
  }

  throw new Error('Unknown security scheme');
}
