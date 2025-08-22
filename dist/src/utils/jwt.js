"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeToken = exports.generateRefreshToken = exports.verifyToken = exports.generateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_IN = '30d';
/**
 * Generates JWT token with user ID payload
 * @param userId - User ID to encode in token
 * @returns JWT token string
 */
const generateToken = (userId) => {
    return jsonwebtoken_1.default.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};
exports.generateToken = generateToken;
/**
 * Verifies JWT token and returns decoded payload
 * @param token - JWT token to verify
 * @returns Decoded token payload
 * @throws Error if token is invalid or expired
 */
const verifyToken = (token) => {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return decoded;
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            throw new Error('Token has expired');
        }
        else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            throw new Error('Invalid token');
        }
        throw error;
    }
};
exports.verifyToken = verifyToken;
/**
 * Generates longer-lived refresh token
 * @param userId - User ID to encode in token
 * @returns Refresh token string
 */
const generateRefreshToken = (userId) => {
    return jsonwebtoken_1.default.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
};
exports.generateRefreshToken = generateRefreshToken;
/**
 * Decodes token without verification (useful for debugging)
 * @param token - JWT token to decode
 * @returns Decoded token payload or null
 */
const decodeToken = (token) => {
    try {
        return jsonwebtoken_1.default.decode(token);
    }
    catch {
        return null;
    }
};
exports.decodeToken = decodeToken;
//# sourceMappingURL=jwt.js.map