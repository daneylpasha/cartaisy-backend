import nodemailer from 'nodemailer';
import { tenantConfig } from '../config/tenant';

// Email configuration from tenant config (defaults)
const EMAIL_FROM_NAME = tenantConfig.email.fromName;
const EMAIL_FROM_ADDRESS = tenantConfig.email.fromAddress;
const EMAIL_REPLY_TO = tenantConfig.email.replyTo;
const FRONTEND_URL = tenantConfig.api.frontendUrl;
const STORE_NAME = tenantConfig.store.name;
const STORE_PRIMARY_COLOR = tenantConfig.store.primaryColor;
const STORE_LOGO_URL = tenantConfig.store.logoUrl;

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

// For now, we'll create a basic transporter
// In production, you'll configure this with your email service (SendGrid, AWS SES, etc.)
const createTransporter = () => {
  // Use configured SMTP settings
  if (tenantConfig.email.serviceType === 'smtp') {
    return nodemailer.createTransport({
      host: tenantConfig.email.smtp.host,
      port: tenantConfig.email.smtp.port,
      secure: tenantConfig.email.smtp.secure,
      auth: tenantConfig.email.smtp.user && tenantConfig.email.smtp.pass ? {
        user: tenantConfig.email.smtp.user,
        pass: tenantConfig.email.smtp.pass
      } : undefined
    });
  }
  
  // In production, you would configure your actual email service
  // For now, we'll just return a mock transporter
  return {
    sendMail: async (options: any) => {
      console.log('Email would be sent in production:', options);
      return { messageId: 'mock-message-id' };
    }
  };
};

/**
 * Sends an email
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

    // For development, just log and return true
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Email would be sent:', {
        to,
        subject,
        from: `"${fromName}" <${fromAddress}>`,
        replyTo
      });
      return true;
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: `"${fromName}" <${fromAddress}>`,
      replyTo,
      to,
      subject,
      html
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent to ${to} from "${fromName}" <${fromAddress}>`);
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

  // In production, this would be your actual frontend reset URL
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
  const currentYear = new Date().getFullYear();

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${primaryColor}; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .header img { max-height: 50px; margin-bottom: 15px; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px; background: #ffffff; border-left: 1px solid #eee; border-right: 1px solid #eee; }
          .button-container { text-align: center; margin: 25px 0; }
          .button {
            display: inline-block;
            padding: 14px 32px;
            background-color: ${primaryColor};
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
          }
          .warning {
            background: #fff8e6;
            border: 1px solid #ffe082;
            padding: 15px;
            border-radius: 6px;
            margin: 25px 0;
          }
          .warning-title { font-weight: 600; color: #f57c00; margin-bottom: 8px; }
          .warning ul { margin: 8px 0 0 0; padding-left: 20px; color: #666; }
          .warning li { margin: 4px 0; }
          .footer {
            text-align: center;
            padding: 20px;
            font-size: 12px;
            color: #666;
            background: #f9f9f9;
            border-radius: 0 0 8px 8px;
            border: 1px solid #eee;
            border-top: none;
          }
          .link-text {
            margin-top: 20px;
            padding: 15px;
            background: #f9f9f9;
            border-radius: 4px;
            word-break: break-all;
            font-size: 12px;
            color: #666;
          }
          .link-text a { color: ${primaryColor}; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoUrl ? `<img src="${logoUrl}" alt="${storeName}" />` : ''}
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p>We received a request to reset your password for your <strong>${storeName}</strong> account.</p>
            <p>Click the button below to reset your password:</p>

            <div class="button-container">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </div>

            <div class="warning">
              <div class="warning-title">⏰ Important</div>
              <ul>
                <li>This link will expire in <strong>10 minutes</strong></li>
                <li>If you didn't request this, please ignore this email</li>
                <li>Your password won't change until you create a new one</li>
              </ul>
            </div>

            <p>If you're having trouble clicking the button, copy and paste this URL into your browser:</p>
            <div class="link-text">
              <a href="${resetUrl}">${resetUrl}</a>
            </div>

            <p style="margin-top: 30px;">
              Best regards,<br/>
              <strong>The ${storeName} Team</strong>
            </p>
          </div>
          <div class="footer">
            <p>© ${currentYear} ${storeName}. All rights reserved.</p>
            <p>This is an automated message. Please do not reply directly to this email.</p>
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