import mongoSanitize from 'express-mongo-sanitize';
import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Prevent NoSQL injection attacks
 * Removes $ and . from user input which are used in MongoDB operators
 */
export const mongoSanitizeMiddleware = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }: { req: Request; key: string }) => {
    console.warn(`🚨 SECURITY: Sanitized potentially malicious input`);
    console.warn(`  Key: ${key}`);
    console.warn(`  IP: ${req.ip}`);
    console.warn(`  Path: ${req.path}`);
    console.warn(`  Method: ${req.method}`);
  },
});

/**
 * Additional validation middleware to check for suspicious patterns
 */
export const additionalQueryValidation: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check for suspicious patterns in query strings
  const suspiciousPatterns = [
    /\$where/i,
    /\$regex/i,
    /\$ne/i,
    /\$gt/i,
    /\$lt/i,
    /\$or/i,
    /\$and/i,
    /\$nin/i,
    /\$in/i,
    /\$exists/i,
  ];

  const checkValue = (value: any, path: string): boolean => {
    if (typeof value === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          console.warn(`🚨 SECURITY: Suspicious pattern detected`);
          console.warn(`  Pattern: ${pattern}`);
          console.warn(`  Value: ${value}`);
          console.warn(`  Path: ${path}`);
          console.warn(`  IP: ${req.ip}`);
          console.warn(`  Request Path: ${req.path}`);
          return true;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const key of Object.keys(value)) {
        if (key.startsWith('$')) {
          console.warn(`🚨 SECURITY: MongoDB operator in user input`);
          console.warn(`  Key: ${key}`);
          console.warn(`  Path: ${path}.${key}`);
          console.warn(`  IP: ${req.ip}`);
          console.warn(`  Request Path: ${req.path}`);
          return true;
        }
        if (checkValue(value[key], `${path}.${key}`)) {
          return true;
        }
      }
    }
    return false;
  };

  // Check query params
  if (req.query && checkValue(req.query, 'query')) {
    res.status(400).json({
      status: 'error',
      message: 'Invalid query parameters',
    });
    return;
  }

  // Check body
  if (req.body && checkValue(req.body, 'body')) {
    res.status(400).json({
      status: 'error',
      message: 'Invalid request body',
    });
    return;
  }

  next();
};

/**
 * Combined query protection middleware array
 */
export const queryProtection: RequestHandler[] = [
  mongoSanitizeMiddleware as RequestHandler,
  additionalQueryValidation,
];

export default queryProtection;
