import { Response } from 'express';
import { Resend } from 'resend';
import Store, { IStoreDocument } from '../models/Store';
import { AuthenticatedRequest } from '../types';

// Only initialize Resend if API key is available
let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('⚠️  RESEND_API_KEY not found - email functionality will be disabled');
}

/**
 * Get email configuration for store
 */
export const getEmailConfig = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params as { storeId: string };

    const store = (await Store.findById(storeId).select('email name')) as IStoreDocument | null;
    if (!store) {
      res.status(404).json({
        status: 'error',
        message: 'Store not found',
      });
      return;
    }

    res.json({
      status: 'success',
      data: {
        email: store.email || {},
        currentConfig: store.getEmailConfig(),
      },
    });
  } catch (error) {
    console.error('Get email config error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch email configuration',
    });
  }
};

/**
 * Update email configuration
 */
export const updateEmailConfig = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params as { storeId: string };
    const { domain, fromName, replyTo, preferences } = req.body as {
      domain?: string;
      fromName?: string;
      replyTo?: string;
      preferences?: {
        sendOrderConfirmation?: boolean;
        sendShippingUpdates?: boolean;
        sendDeliveryConfirmation?: boolean;
      };
    };

    const store = (await Store.findById(storeId)) as IStoreDocument | null;
    if (!store) {
      res.status(404).json({
        status: 'error',
        message: 'Store not found',
      });
      return;
    }

    // Initialize email config if not exists
    if (!store.email) {
      store.email = {
        provider: 'resend',
        verified: false,
        dnsRecords: [],
        preferences: {
          sendOrderConfirmation: true,
          sendShippingUpdates: true,
          sendDeliveryConfirmation: true,
        },
      };
    }

    // Update email configuration
    if (domain) {
      store.email.domain = domain;
      store.email.fromAddress = `orders@${domain}`;
      store.email.verified = false; // Will be verified separately
    }

    if (fromName) {
      store.email.fromName = fromName;
    }

    if (replyTo) {
      store.email.replyTo = replyTo;
    }

    if (preferences) {
      store.email.preferences = {
        ...store.email.preferences,
        ...preferences,
      };
    }

    await store.save();

    res.json({
      status: 'success',
      message: 'Email configuration updated',
      data: {
        email: store.email,
        currentConfig: store.getEmailConfig(),
      },
    });
  } catch (error) {
    console.error('Update email config error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update email configuration',
    });
  }
};

/**
 * Send test email
 */
export const sendTestEmail = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params as { storeId: string };
    const { to } = req.body as { to: string };

    if (!to) {
      res.status(400).json({
        status: 'error',
        message: 'Recipient email is required',
      });
      return;
    }

    const store = (await Store.findById(storeId)) as IStoreDocument | null;
    if (!store) {
      res.status(404).json({
        status: 'error',
        message: 'Store not found',
      });
      return;
    }

    const emailConfig = store.getEmailConfig();

    if (!resend) {
      res.status(503).json({
        status: 'error',
        message: 'Email service is not configured. Please set RESEND_API_KEY environment variable.',
      });
      return;
    }

    await resend.emails.send({
      from: `${emailConfig.fromName} <${emailConfig.fromAddress}>`,
      to,
      subject: 'Test Email from Cartaisy',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F9FAFB;">
          <div style="text-align: center; margin-bottom: 40px; padding: 30px 0;">
            <h1 style="color: #8B5CF6; margin: 0 0 8px 0; font-size: 28px;">Test Email</h1>
            <p style="font-size: 16px; color: #6B7280; margin: 0;">Email configuration is working!</p>
          </div>

          <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Configuration Details</h2>
            <div>
              <p style="margin: 5px 0;"><strong>Store:</strong> ${store.name}</p>
              <p style="margin: 5px 0;"><strong>From Name:</strong> ${emailConfig.fromName}</p>
              <p style="margin: 5px 0;"><strong>From Address:</strong> ${emailConfig.fromAddress}</p>
              <p style="margin: 5px 0;"><strong>Reply To:</strong> ${emailConfig.replyTo}</p>
              <p style="margin: 5px 0;"><strong>Domain Verified:</strong> ${emailConfig.verified ? 'Yes' : 'No (using Cartaisy domain)'}</p>
            </div>
          </div>

          <div style="text-align: center; color: #9CA3AF; font-size: 14px; padding: 24px 0;">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${store.name}. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `Test Email from ${store.name}\n\nThis is a test email to confirm your email configuration is working correctly.\n\nConfiguration:\n- From Name: ${emailConfig.fromName}\n- From Address: ${emailConfig.fromAddress}\n- Reply To: ${emailConfig.replyTo}\n- Domain Verified: ${emailConfig.verified ? 'Yes' : 'No'}`,
    });

    res.json({
      status: 'success',
      message: 'Test email sent successfully',
    });
  } catch (error: any) {
    console.error('Send test email error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to send test email',
    });
  }
};

/**
 * Update email preferences
 */
export const updateEmailPreferences = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params as { storeId: string };
    const { sendOrderConfirmation, sendShippingUpdates, sendDeliveryConfirmation } = req.body as {
      sendOrderConfirmation?: boolean;
      sendShippingUpdates?: boolean;
      sendDeliveryConfirmation?: boolean;
    };

    const store = (await Store.findById(storeId)) as IStoreDocument | null;
    if (!store) {
      res.status(404).json({
        status: 'error',
        message: 'Store not found',
      });
      return;
    }

    // Initialize email config if not exists
    if (!store.email) {
      store.email = {
        provider: 'resend',
        verified: false,
        dnsRecords: [],
        preferences: {
          sendOrderConfirmation: true,
          sendShippingUpdates: true,
          sendDeliveryConfirmation: true,
        },
      };
    }

    // Update preferences
    if (sendOrderConfirmation !== undefined) {
      store.email.preferences.sendOrderConfirmation = sendOrderConfirmation;
    }
    if (sendShippingUpdates !== undefined) {
      store.email.preferences.sendShippingUpdates = sendShippingUpdates;
    }
    if (sendDeliveryConfirmation !== undefined) {
      store.email.preferences.sendDeliveryConfirmation = sendDeliveryConfirmation;
    }

    await store.save();

    res.json({
      status: 'success',
      message: 'Email preferences updated',
      data: {
        preferences: store.email.preferences,
      },
    });
  } catch (error) {
    console.error('Update email preferences error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update email preferences',
    });
  }
};
