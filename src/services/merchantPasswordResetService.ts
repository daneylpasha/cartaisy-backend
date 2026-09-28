import crypto from 'crypto';
import User, { IUserDocument } from '../models/User';
import { generateRefreshToken, generateToken } from '../utils/jwt';
import {
  sendMerchantGoogleSignInEmail,
  sendMerchantPasswordResetEmail,
} from '../utils/email';

/**
 * Same text for every forgot-password response so callers cannot tell
 * whether the email belongs to a merchant, a Google-only account, or nobody.
 */
export const MERCHANT_FORGOT_PASSWORD_MESSAGE =
  'If an account exists with this email, you will receive a password reset link shortly.';

export const INVALID_RESET_TOKEN_MESSAGE = 'Invalid or expired reset token';

/**
 * Dashboard roles that may receive a merchant password reset.
 * Matches POST /api/v1/auth/google. Shopper roles stay on customer auth.
 */
const DASHBOARD_RESET_ROLES = ['super_admin', 'admin', 'moderator'] as const;

type DashboardResetRole = (typeof DASHBOARD_RESET_ROLES)[number];

const RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function isDashboardRole(role: string): role is DashboardResetRole {
  return (DASHBOARD_RESET_ROLES as readonly string[]).includes(role);
}

export function userHasPassword(password: unknown): boolean {
  return typeof password === 'string' && password.length > 0;
}

/**
 * Signup rules: 6–128 characters, at least one letter and one number.
 */
export function isAcceptableNewPassword(password: unknown): password is string {
  return (
    typeof password === 'string' &&
    password.length >= 6 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

async function clearResetCredentials(userId: IUserDocument['_id']): Promise<void> {
  await User.updateOne(
    { _id: userId },
    { $unset: { passwordResetToken: 1, passwordResetExpires: 1 } }
  );
}

/**
 * Request a merchant password reset.
 *
 * Always completes without throwing for expected cases (unknown email,
 * Google-only account, ambiguous email, inactive user, email send failure)
 * so the HTTP handler can return one generic success body.
 *
 * Google-only / no-password dashboard users do not get a reset link.
 * They get an email that tells them to use Continue with Google.
 * Issuing a link would create a password on an account that has none.
 * Skipping the email would look like a broken reset. The API response
 * stays the same either way.
 */
export async function requestMerchantPasswordReset(email: unknown): Promise<void> {
  try {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return;
    }

    const matches = await User.find({
      email: normalizedEmail,
      role: { $in: [...DASHBOARD_RESET_ROLES] },
      isActive: true,
    })
      .select('+password')
      .limit(2);

    if (matches.length !== 1) {
      if (matches.length > 1) {
        console.error(
          'Merchant password reset skipped because more than one dashboard account matched'
        );
      }
      return;
    }

    const user = matches[0];
    if (!user) {
      return;
    }

    if (!userHasPassword(user.password)) {
      const sent = await sendMerchantGoogleSignInEmail(user.email);
      if (!sent) {
        console.error('Merchant Google sign-in guidance email could not be sent');
      }
      return;
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    let sent = false;
    try {
      sent = await sendMerchantPasswordResetEmail(user.email, resetToken);
    } catch {
      sent = false;
    }

    if (!sent) {
      await clearResetCredentials(user._id);
      console.error('Merchant password reset email could not be sent');
    }
  } catch {
    console.error('Merchant password reset request failed');
  }
}

export type ResetMerchantPasswordResult =
  | { status: 'success'; token: string; refreshToken: string }
  | { status: 'error'; message: string };

/**
 * Set a new password from a single-use reset token.
 * Clears the token, records passwordChangedAt so older access and refresh
 * tokens fail, and returns a new session pair.
 */
export async function resetMerchantPassword(
  token: unknown,
  newPassword: unknown
): Promise<ResetMerchantPasswordResult> {
  if (typeof token !== 'string' || !RESET_TOKEN_PATTERN.test(token.trim())) {
    return { status: 'error', message: INVALID_RESET_TOKEN_MESSAGE };
  }

  if (!isAcceptableNewPassword(newPassword)) {
    return {
      status: 'error',
      message:
        'Password must be at least 6 characters long and include a letter and a number',
    };
  }

  const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');
  // Consume the token in one write so a second request cannot reuse it.
  const consumed = await User.findOneAndUpdate(
    {
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    },
    { $unset: { passwordResetToken: 1, passwordResetExpires: 1 } },
    { new: false }
  );

  if (!consumed) {
    return { status: 'error', message: INVALID_RESET_TOKEN_MESSAGE };
  }

  const user = await User.findById(consumed._id).select('+password');
  if (!user || !isDashboardRole(user.role) || user.isActive !== true || !userHasPassword(user.password)) {
    return { status: 'error', message: INVALID_RESET_TOKEN_MESSAGE };
  }

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  const userId = String(user._id);
  return {
    status: 'success',
    token: generateToken(userId),
    refreshToken: generateRefreshToken(userId),
  };
}
