"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireModerator = exports.requireAdmin = exports.optionalAuth = exports.requireAuth = exports.authorize = exports.optionalAuthenticate = exports.authenticate = void 0;
const jwt_1 = require("../utils/jwt");
const User_1 = __importDefault(require("../models/User"));
/**
 * Authentication middleware
 * Extracts and verifies JWT token from Authorization header
 * Attaches user to request object
 */
const authenticate = async (req, res, next) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                status: 'error',
                message: 'No token provided. Please authenticate.'
            });
            return;
        }
        // Get token (remove 'Bearer ' prefix)
        const token = authHeader.substring(7);
        // Verify token
        let decoded;
        try {
            decoded = (0, jwt_1.verifyToken)(token);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid token';
            res.status(401).json({
                status: 'error',
                message: errorMessage
            });
            return;
        }
        // Find user by ID from token payload
        const user = await User_1.default.findById(decoded.userId).select('-password');
        if (!user) {
            res.status(401).json({
                status: 'error',
                message: 'User not found. Please authenticate again.'
            });
            return;
        }
        // Check if user is active
        if (!user.isActive) {
            res.status(403).json({
                status: 'error',
                message: 'Your account has been deactivated. Please contact support.'
            });
            return;
        }
        // Attach user to request object
        req.user = user;
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Authentication failed. Please try again.'
        });
    }
};
exports.authenticate = authenticate;
/**
 * Optional authentication middleware
 * Similar to authenticate but doesn't fail if no token is provided
 * Useful for routes that can work with or without authentication
 */
const optionalAuthenticate = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, continue without user
            return next();
        }
        const token = authHeader.substring(7);
        try {
            const decoded = (0, jwt_1.verifyToken)(token);
            const user = await User_1.default.findById(decoded.userId).select('-password');
            if (user && user.isActive) {
                req.user = user;
            }
        }
        catch (error) {
            // Invalid token, continue without user
            console.log('Optional auth: Invalid token provided');
        }
        next();
    }
    catch (error) {
        // Error in optional auth, continue without user
        console.error('Optional authentication error:', error);
        next();
    }
};
exports.optionalAuthenticate = optionalAuthenticate;
/**
 * Role-based authorization middleware
 * Must be used after authenticate middleware
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({
                status: 'error',
                message: 'Authentication required'
            });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({
                status: 'error',
                message: 'You do not have permission to perform this action'
            });
            return;
        }
        next();
    };
};
exports.authorize = authorize;
// Convenience aliases for common middleware combinations
exports.requireAuth = exports.authenticate;
exports.optionalAuth = exports.optionalAuthenticate;
exports.requireAdmin = [exports.authenticate, (0, exports.authorize)('admin')];
exports.requireModerator = [exports.authenticate, (0, exports.authorize)('admin', 'moderator')];
//# sourceMappingURL=auth.js.map