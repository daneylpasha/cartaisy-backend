import nodemailer from 'nodemailer';
import { tenantConfig } from '../config/tenant';

// Email configuration from tenant config
const EMAIL_FROM_NAME = tenantConfig.email.fromName;
const EMAIL_FROM_ADDRESS = tenantConfig.email.fromAddress;
const EMAIL_REPLY_TO = tenantConfig.email.replyTo;
const FRONTEND_URL = tenantConfig.api.frontendUrl;
const STORE_NAME = tenantConfig.store.name;
const STORE_PRIMARY_COLOR = tenantConfig.store.primaryColor;
const STORE_LOGO_URL = tenantConfig.store.logoUrl;

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
 * @returns Promise<boolean> - true if email was sent successfully
 */
export const sendEmail = async (
  to: string,
  subject: string,
  html: string
): Promise<boolean> => {
  try {
    // For development, just log and return true
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Email would be sent:', { to, subject });
      return true;
    }

    const transporter = createTransporter();
    
    const mailOptions = {
      from: `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`,
      replyTo: EMAIL_REPLY_TO,
      to,
      subject,
      html
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
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
 * @param email - User's email address
 * @param resetToken - Password reset token
 * @returns Promise<boolean> - true if email was sent successfully
 */
export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string
): Promise<boolean> => {
  const subject = `Password Reset Request - ${STORE_NAME}`;
  
  // In production, this would be your actual frontend reset URL
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #FF6B6B; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background-color: #FF6B6B; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          .warning { background-color: #FFF3CD; border: 1px solid #FFC107; padding: 10px; border-radius: 5px; margin-top: 15px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .logo { max-height: 60px; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${STORE_LOGO_URL ? `<img src="${STORE_LOGO_URL}" alt="${STORE_NAME}" class="logo" />` : ''}
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Reset Your Password</h2>
            <p>We received a request to reset your password for your ${STORE_NAME} account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <div class="warning">
              <p><strong>Important:</strong></p>
              <ul>
                <li>This link will expire in 10 minutes</li>
                <li>If you didn't request this, please ignore this email</li>
                <li>Your password won't change until you create a new one</li>
              </ul>
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: #666;">
              Or copy and paste this link into your browser:<br>
              ${resetUrl}
            </p>
          </div>
          <div class="footer">
            <p>© 2024 ${STORE_NAME}. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail(email, subject, html);
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