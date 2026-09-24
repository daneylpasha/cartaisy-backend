import { OAuth2Client, TokenPayload } from 'google-auth-library';

export type GoogleAuthErrorCode = 'GOOGLE_NOT_CONFIGURED' | 'GOOGLE_TOKEN_INVALID';

export class GoogleIdTokenVerificationError extends Error {
  readonly code: GoogleAuthErrorCode;

  constructor(code: GoogleAuthErrorCode, message: string) {
    super(message);
    this.name = 'GoogleIdTokenVerificationError';
    this.code = code;
  }
}

export interface VerifiedGoogleIdentity {
  email: string;
  sub: string;
}

/**
 * Google OAuth web client IDs accepted as the ID token audience.
 * Read on each request so an unset value does not crash process startup.
 * A comma-separated list is allowed (for example web and additional GIS clients).
 */
export function getConfiguredGoogleClientIds(raw = process.env.GOOGLE_CLIENT_ID): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);
}

function audienceMatches(payloadAud: string | string[] | undefined, configured: string[]): boolean {
  const presented = Array.isArray(payloadAud) ? payloadAud : payloadAud ? [payloadAud] : [];
  return presented.some(value => configured.includes(value));
}

/**
 * Verify a Google Identity Services ID token (the browser `credential`).
 * Requires `email_verified === true` and an audience in `GOOGLE_CLIENT_ID`.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleIdentity> {
  const audiences = getConfiguredGoogleClientIds();
  if (audiences.length === 0) {
    throw new GoogleIdTokenVerificationError(
      'GOOGLE_NOT_CONFIGURED',
      'Google sign-in is not configured'
    );
  }

  const client = new OAuth2Client();
  let payload: TokenPayload | undefined;

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: audiences,
    });
    payload = ticket.getPayload();
  } catch {
    // Do not log the library error. Several google-auth-library failures
    // append the decoded token payload (email, name, sub) to the message.
    console.error('Google ID token verification failed');
    throw new GoogleIdTokenVerificationError('GOOGLE_TOKEN_INVALID', 'Google ID token is invalid');
  }

  const email = payload?.email?.trim().toLowerCase();
  if (
    !payload ||
    !email ||
    payload.email_verified !== true ||
    !payload.sub ||
    !audienceMatches(payload.aud, audiences)
  ) {
    throw new GoogleIdTokenVerificationError('GOOGLE_TOKEN_INVALID', 'Google ID token is invalid');
  }

  return { email, sub: payload.sub };
}
