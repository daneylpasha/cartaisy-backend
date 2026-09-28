/**
 * Merchant password-reset lifetime.
 * The emailed link, the stored expiry, and the email copy all use this value.
 */
export const PASSWORD_RESET_TTL_MS = 10 * 60 * 1000;

export const PASSWORD_RESET_TTL_MINUTES = PASSWORD_RESET_TTL_MS / (60 * 1000);
