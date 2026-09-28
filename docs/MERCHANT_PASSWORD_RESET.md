# Merchant password reset

Contract for dashboard issue #68 and backend issue #188.

The live routes are the Express handlers on `/api/v1/auth`. Shopper reset stays on `/api/v1/customer/auth` and is unchanged.

## Dashboard page

Agreed path:

```text
{DASHBOARD_URL}/reset-password?token={token}
```

`DASHBOARD_URL` is the dashboard origin with no path and no trailing slash, for example `https://dashboard.example.com` or `http://localhost:3001`. When `DASHBOARD_URL` is unset, the link falls back to `FRONTEND_URL`.

The query parameter name is `token`. The value is 64 hex characters (32 random bytes). The dashboard reads that query value and posts it back. It does not send the token anywhere else, and it does not write the token or the new password to logs.

There is no mobile deep link on the merchant email. Customer reset mail is separate and still includes the app link.

## Forgot password

`POST /api/v1/auth/forgot-password`

```json
{ "email": "merchant@example.com" }
```

Validation matches signup: required email, normalized the same way as register and login.

Success is always HTTP 200 with this body, including when the email is unknown, the account is Google-only, the account is inactive, more than one dashboard user shares the email, or the mail provider fails:

```json
{
  "status": "success",
  "message": "If an account exists with this email, you will receive a password reset link shortly."
}
```

The response never includes a token or a password. Invalid email shape is HTTP 400 `Validation failed`. More than 5 requests per hour from the same IP is HTTP 429.

## Reset password

`POST /api/v1/auth/reset-password`

```json
{
  "token": "64-char-hex",
  "newPassword": "resetpass123"
}
```

`confirmPassword` is not an API field. The dashboard can check it locally.

Password rules match signup:

- 6 to 128 characters
- at least one letter and one number

Success:

```json
{
  "status": "success",
  "message": "Password reset successful",
  "data": {
    "token": "access-jwt",
    "refreshToken": "refresh-jwt"
  }
}
```

Store both tokens the same way as login. `refreshToken` is new on this response. Clients that only read `data.token` still work.

Invalid, expired, already used, or non-dashboard tokens are HTTP 400:

```json
{
  "status": "error",
  "message": "Invalid or expired reset token"
}
```

Those cases use the same message. A token that is not 64 hex characters fails validation before that message (`Validation failed`).

## Token rules

- Raw token is emailed once and stored only as SHA-256 hex.
- Lifetime is 10 minutes (`PASSWORD_RESET_TTL_MS`).
- A later forgot-password request replaces the previous token.
- Success clears the token. A second submit fails.
- The API process does not log the raw token, the hash, or the new password.

## Who receives a reset link

An email is sent only when exactly one active dashboard user (`super_admin`, `admin`, or `moderator`) has that email and has a password hash.

- Unknown email, inactive user, invited user who has not activated, and shopper roles: generic success, no reset email.
- Two or more active dashboard users with the same email: generic success, no reset email, so the wrong store is not updated.
- A dashboard user who has a password and has also used Google: normal reset email. Google sign-in keeps working.

## Google-only accounts

A dashboard user with no password hash (allowed when `authProvider` is `google`) does not get a reset link.

They receive a different email that says the account has no password and to use **Continue with Google**. That email has no reset URL and no token. The HTTP response stays the generic success body above.

This is the product-safe choice:

- A reset link would create a password on an account that never had one.
- Sending nothing would look like a broken reset, which is the failure this flow exists to avoid.
- The API still does not tell the caller which kind of account the email belongs to. Only the inbox sees the Google guidance.

Signing in with Google does not remove an existing password. Those accounts stay on the reset-link path.

## Sessions

Refresh tokens are stateless JWTs, so they are not stored in a revocation list. A successful reset sets `passwordChangedAt`. Access tokens are rejected by `authenticate` and by the TSOA `expressAuthentication` handler. Refresh tokens are rejected by `POST /api/v1/auth/refresh-token`. Rejection applies to tokens issued in an earlier second. The new pair in the reset response remains valid. A token issued in the same second as the change can still be valid, because JWT `iat` is whole seconds. The reset token itself is removed in the same database write that accepts it, so a second request cannot reuse it.

Profile updates cannot set `passwordChangedAt`.

## Email delivery

Merchant reset and Google guidance mail go through `sendEmail` in `src/utils/email.ts` (Resend when `EMAIL_SERVICE_TYPE=resend` and `RESEND_API_KEY` are set, otherwise the existing SMTP or development log path). Development logs the recipient and subject, not the HTML and not the token. A send failure still returns the generic HTTP 200 and deletes any token that was just created.
