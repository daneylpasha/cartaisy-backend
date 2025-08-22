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
export declare const generateToken: (userId: string) => string;
/**
 * Verifies JWT token and returns decoded payload
 * @param token - JWT token to verify
 * @returns Decoded token payload
 * @throws Error if token is invalid or expired
 */
export declare const verifyToken: (token: string) => TokenPayload;
/**
 * Generates longer-lived refresh token
 * @param userId - User ID to encode in token
 * @returns Refresh token string
 */
export declare const generateRefreshToken: (userId: string) => string;
/**
 * Decodes token without verification (useful for debugging)
 * @param token - JWT token to decode
 * @returns Decoded token payload or null
 */
export declare const decodeToken: (token: string) => TokenPayload | null;
export {};
//# sourceMappingURL=jwt.d.ts.map