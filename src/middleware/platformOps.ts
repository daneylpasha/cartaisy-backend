import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

/**
 * Platform-ops gate for cross-store admin build routes (issue #170).
 *
 * Access is granted only when either:
 * - the user document has `isPlatformOperator: true`, or
 * - the user's email is verified and listed in `PLATFORM_OPS_EMAILS`.
 *
 * Store-owner `super_admin` is not enough. An unset allowlist, an unverified
 * account, and a missing user all fail closed.
 */

export function parsePlatformOpsAllowlist(raw: string | undefined | null): Set<string> {
  if (typeof raw !== 'string') {
    return new Set();
  }

  const emails = raw
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(entry => entry.length > 0);

  return new Set(emails);
}

export function hasPlatformOpsAccess(
  user:
    | {
        email?: string | null;
        isVerified?: boolean | null;
        isPlatformOperator?: boolean | null;
      }
    | null
    | undefined,
  allowlistRaw: string | undefined | null = process.env.PLATFORM_OPS_EMAILS
): boolean {
  if (!user) {
    return false;
  }

  if (user.isPlatformOperator === true) {
    return true;
  }

  if (user.isVerified !== true) {
    return false;
  }

  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!email) {
    return false;
  }

  return parsePlatformOpsAllowlist(allowlistRaw).has(email);
}

export const requirePlatformOps = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!hasPlatformOpsAccess(req.user)) {
    res.status(403).json({
      success: false,
      error: 'Platform admin access required',
    });
    return;
  }

  next();
};
