import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { tenantConfig } from '../config/tenant';

// Email configuration from tenant config (defaults)
const EMAIL_FROM_NAME = tenantConfig.email.fromName;
const EMAIL_FROM_ADDRESS = tenantConfig.email.fromAddress;
const EMAIL_REPLY_TO = tenantConfig.email.replyTo;
const FRONTEND_URL = tenantConfig.api.frontendUrl;
const STORE_NAME = tenantConfig.store.name;
const STORE_PRIMARY_COLOR = tenantConfig.store.primaryColor;
const STORE_LOGO_URL = tenantConfig.store.logoUrl;

// Initialize Resend client if API key is configured
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/**
 * Email options for customizing sender info (multi-tenant support)
 */
export interface EmailOptions {
  fromName?: string;
  fromAddress?: string;
  replyTo?: string;
}

/**
 * Store email configuration for branded emails
 */
export interface StoreEmailConfig {
  storeName: string;
  logoUrl?: string;
  primaryColor?: string;
  fromName: string;
  fromAddress: string;
  replyTo: string;
}

/**
 * Create nodemailer SMTP transporter
 */
const createSmtpTransporter = () => {
  return nodemailer.createTransport({
    host: tenantConfig.email.smtp.host,
    port: tenantConfig.email.smtp.port,
    secure: tenantConfig.email.smtp.secure,
    auth: tenantConfig.email.smtp.user && tenantConfig.email.smtp.pass ? {
      user: tenantConfig.email.smtp.user,
      pass: tenantConfig.email.smtp.pass
    } : undefined
  });
};

/**
 * Send email via Resend
 */
const sendViaResend = async (
  to: string,
  subject: string,
  html: string,
  from: string,
  replyTo: string
): Promise<boolean> => {
  if (!resend) {
    console.error('[Email] Resend API key not configured');
    return false;
  }

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    replyTo,
  });

  if (error) {
    console.error('[Email] Resend error:', error);
    return false;
  }

  console.log(`[Email] Sent via Resend to ${to}, ID: ${data?.id}`);
  return true;
};

/**
 * Send email via SMTP (nodemailer)
 */
const sendViaSmtp = async (
  to: string,
  subject: string,
  html: string,
  from: string,
  replyTo: string
): Promise<boolean> => {
  const transporter = createSmtpTransporter();

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
    replyTo,
  });

  console.log(`[Email] Sent via SMTP to ${to}`);
  return true;
};

/**
 * Sends an email using the configured provider (Resend or SMTP)
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param html - HTML content of the email
 * @param options - Optional email configuration for multi-tenant support
 * @returns Promise<boolean> - true if email was sent successfully
 */
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  options?: EmailOptions
): Promise<boolean> => {
  try {
    // Use custom options or fall back to defaults
    const fromName = options?.fromName || EMAIL_FROM_NAME;
    const fromAddress = options?.fromAddress || EMAIL_FROM_ADDRESS;
    const replyTo = options?.replyTo || EMAIL_REPLY_TO;
    const from = `${fromName} <${fromAddress}>`;

    // Development mode: log and return true (unless explicitly testing email)
    if (process.env.NODE_ENV !== 'production' && process.env.FORCE_EMAIL_SEND !== 'true') {
      console.log('📧 Email would be sent:', {
        to,
        subject,
        from,
        replyTo,
        provider: tenantConfig.email.serviceType
      });
      return true;
    }

    const serviceType = tenantConfig.email.serviceType;

    // Option 1: Use Resend (recommended for production)
    if (serviceType === 'resend') {
      return await sendViaResend(to, subject, html, from, replyTo);
    }

    // Option 2: Use SMTP (nodemailer)
    if (serviceType === 'smtp') {
      return await sendViaSmtp(to, subject, html, from, replyTo);
    }

    // Option 3: Mock mode (for testing/development)
    console.log('[Email] Mock mode - would send:', { to, subject, from });
    return true;

  } catch (error) {
    console.error('[Email] Failed to send:', error);
    return false;
  }
};

/**
 * Sends welcome email to new user
 * @param email - User's email address
 * @param name - User's name
 * @returns Promise<boolean> - true if email was sent successfully
 */
export const sendWelcomeEmail = async (
  email: string,
  name: string
): Promise<boolean> => {
  const subject = `Welcome to ${STORE_NAME}!`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${STORE_PRIMARY_COLOR}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 10px 20px; background-color: ${STORE_PRIMARY_COLOR}; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .logo { max-height: 60px; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${STORE_LOGO_URL ? `<img src="${STORE_LOGO_URL}" alt="${STORE_NAME}" class="logo" />` : ''}
            <h1>Welcome to ${STORE_NAME}!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Thank you for joining ${STORE_NAME}! We're excited to have you on board.</p>
            <p>With ${STORE_NAME}, you can:</p>
            <ul>
              <li>Shop from amazing products</li>
              <li>Track your orders in real-time</li>
              <li>Get exclusive deals and discounts</li>
              <li>Manage your profile and preferences</li>
            </ul>
            <p>Start exploring our store now!</p>
            <a href="${FRONTEND_URL}" class="button">Visit Store</a>
          </div>
          <div class="footer">
            <p>© 2024 ${STORE_NAME}. All rights reserved.</p>
            <p>If you have any questions, please contact ${EMAIL_REPLY_TO}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};

/**
 * Sends password reset email with token
 * Supports multi-tenant branding when storeConfig is provided
 * Includes both web URL and mobile deep link for app users
 * @param email - User's email address
 * @param resetToken - Password reset token
 * @param storeConfig - Optional store configuration for multi-tenant branding
 * @returns Promise<boolean> - true if email was sent successfully
 */
export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  storeConfig?: StoreEmailConfig
): Promise<boolean> => {
  // Use store config or fall back to global defaults
  const storeName = storeConfig?.storeName || STORE_NAME;
  const logoUrl = storeConfig?.logoUrl || STORE_LOGO_URL;
  const primaryColor = storeConfig?.primaryColor || STORE_PRIMARY_COLOR || '#FF6B6B';
  const fromName = storeConfig?.fromName || EMAIL_FROM_NAME;
  const fromAddress = storeConfig?.fromAddress || EMAIL_FROM_ADDRESS;
  const replyTo = storeConfig?.replyTo || EMAIL_REPLY_TO;

  const subject = `Password Reset Request - ${storeName}`;

  // Web reset URL (for browser/web app)
  const webResetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

  // Mobile deep link URL (for mobile app)
  const mobileDeepLink = `${tenantConfig.app.deepLinkScheme}://reset-password?token=${resetToken}`;

  const currentYear = new Date().getFullYear();

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .email-wrapper { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
          .header { background-color: ${primaryColor}; color: white; padding: 30px 20px; text-align: center; }
          .header img { max-height: 50px; margin-bottom: 15px; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px; }
          .button-container { text-align: center; margin: 25px 0; }
          .button {
            display: inline-block;
            padding: 14px 32px;
            background-color: ${primaryColor};
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
          }
          .mobile-section {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
            text-align: center;
          }
          .mobile-section p { margin: 0 0 15px 0; color: #666; font-size: 14px; }
          .mobile-button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #333;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 500;
            font-size: 14px;
          }
          .warning {
            background: #fff8e6;
            border-left: 4px solid #ffb800;
            padding: 15px;
            border-radius: 0 8px 8px 0;
            margin: 25px 0;
            font-size: 14px;
          }
          .footer {
            text-align: center;
            padding: 25px;
            font-size: 12px;
            color: #999;
            background: #f9f9f9;
          }
          .divider {
            border: none;
            border-top: 1px solid #eee;
            margin: 25px 0;
          }
          .help-text { font-size: 13px; color: #888; margin-top: 20px; }
          .help-text a { color: ${primaryColor}; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="email-wrapper">
            <div class="header">
              ${logoUrl ? `<img src="${logoUrl}" alt="${storeName}" />` : ''}
              <h1>Reset Your Password</h1>
            </div>

            <div class="content">
              <p>Hi there,</p>
              <p>We received a request to reset your password for your <strong>${storeName}</strong> account. Click the button below to set a new password:</p>

              <div class="button-container">
                <a href="${webResetUrl}" class="button">Reset Password</a>
              </div>

              <div class="mobile-section">
                <p>📱 <strong>Using our mobile app?</strong></p>
                <a href="${mobileDeepLink}" class="mobile-button">Open in App</a>
              </div>

              <div class="warning">
                ⏰ <strong>This link expires in 10 minutes</strong> for your security.
              </div>

              <hr class="divider" />

              <p>If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>

              <p class="help-text">
                Having trouble? Copy and paste this URL into your browser:<br/>
                <a href="${webResetUrl}">${webResetUrl}</a>
              </p>
            </div>

            <div class="footer">
              <p>© ${currentYear} ${storeName}. All rights reserved.</p>
              <p>This is an automated message, please do not reply directly to this email.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  // Pass store-specific email options
  return sendEmail(email, subject, html, {
    fromName,
    fromAddress,
    replyTo,
  });
};

/**
 * Sends email verification link
 * @param email - User's email address
 * @param name - User's name
 * @param verificationToken - Email verification token
 * @returns Promise<boolean> - true if email was sent successfully
 */
export const sendVerificationEmail = async (
  email: string,
  name: string,
  verificationToken: string
): Promise<boolean> => {
  const subject = 'Verify Your Email - Cartaisy';
  
  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verify Your Email</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Please verify your email address to complete your registration.</p>
            <p>Click the button below to verify your email:</p>
            <a href="${verifyUrl}" class="button">Verify Email</a>
            <p style="margin-top: 20px; font-size: 12px; color: #666;">
              Or copy and paste this link into your browser:<br>
              ${verifyUrl}
            </p>
            <p style="margin-top: 20px;">This link will expire in 24 hours.</p>
          </div>
          <div class="footer">
            <p>© 2024 Cartaisy. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail(email, subject, html);
};