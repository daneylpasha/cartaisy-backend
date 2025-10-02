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

  throw new Error('Unknown security scheme');
}
