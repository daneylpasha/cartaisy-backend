import { Resend } from 'resend';
import Store, { IStoreDocument } from '../models/Store';

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

interface StatusDetails {
  title: string;
  message: string;
  emoji: string;
  color: string;
}

export class EmailService {
  /**
   * Send order confirmation email
   */
  static async sendOrderConfirmation(order: any): Promise<void> {
    try {
      // Get store for email config
      const store = (await Store.findById(order.storeId)) as IStoreDocument | null;
      if (!store) {
        console.error('Store not found for order email');
        return;
      }

      // Check if store wants to send this type of email
      if (!store.email?.preferences?.sendOrderConfirmation) {
        console.log('Order confirmation emails disabled for this store');
        return;
      }

      const recipientEmail = order.email || order.guestContact?.email;
      if (!recipientEmail) {
        console.log('No email address for order confirmation');
        return;
      }

      const emailConfig = store.getEmailConfig();

      // Generate email HTML
      const html = this.generateOrderConfirmationHTML(order, store);
      const text = this.generateOrderConfirmationText(order);

      // Send via Resend
      await resend.emails.send({
        from: `${emailConfig.fromName} <${emailConfig.fromAddress}>`,
        to: recipientEmail,
        replyTo: emailConfig.replyTo,
        subject: `Order Confirmation - ${order.orderNumber}`,
        html,
        text,
      });

      console.log(`Order confirmation email sent to ${recipientEmail}`);
    } catch (error: any) {
      console.error('Order confirmation email error:', error);
      console.error('Error details:', error.response?.body || error.message);
      // Don't throw - email failure shouldn't break order flow
    }
  }

  /**
   * Send order status update email
   */
  static async sendOrderStatusUpdate(
    order: any,
    newStatus: string,
    additionalInfo?: string
  ): Promise<void> {
    try {
      const store = (await Store.findById(order.storeId)) as IStoreDocument | null;
      if (!store) return;

      // Check preferences based on status
      if (newStatus === 'shipped' && !store.email?.preferences?.sendShippingUpdates) {
        return;
      }
      if (newStatus === 'delivered' && !store.email?.preferences?.sendDeliveryConfirmation) {
        return;
      }

      const recipientEmail = order.email || order.guestContact?.email;
      if (!recipientEmail) return;

      const emailConfig = store.getEmailConfig();

      // Get status-specific details
      const statusDetails = this.getStatusDetails(newStatus);

      const html = this.generateStatusUpdateHTML(order, newStatus, statusDetails, additionalInfo, store);
      const text = this.generateStatusUpdateText(order, newStatus, statusDetails);

      await resend.emails.send({
        from: `${emailConfig.fromName} <${emailConfig.fromAddress}>`,
        to: recipientEmail,
        replyTo: emailConfig.replyTo,
        subject: `${statusDetails.title} - ${order.orderNumber}`,
        html,
        text,
      });

      console.log(`Status update (${newStatus}) email sent to ${recipientEmail}`);
    } catch (error: any) {
      console.error('Status update email error:', error);
      console.error('Error details:', error.response?.body || error.message);
    }
  }

  /**
   * Send order cancellation email
   */
  static async sendOrderCancellation(order: any, reason?: string): Promise<void> {
    try {
      const store = (await Store.findById(order.storeId)) as IStoreDocument | null;
      if (!store) return;

      const recipientEmail = order.email || order.guestContact?.email;
      if (!recipientEmail) return;

      const emailConfig = store.getEmailConfig();

      const html = this.generateCancellationHTML(order, reason, store);
      const text = `Your order ${order.orderNumber} has been cancelled. ${reason ? `Reason: ${reason}` : ''}`;

      await resend.emails.send({
        from: `${emailConfig.fromName} <${emailConfig.fromAddress}>`,
        to: recipientEmail,
        replyTo: emailConfig.replyTo,
        subject: `Order Cancelled - ${order.orderNumber}`,
        html,
        text,
      });

      console.log(`Cancellation email sent to ${recipientEmail}`);
    } catch (error: any) {
      console.error('Cancellation email error:', error);
    }
  }

  /**
   * Get status-specific details (title, message, emoji, color)
   */
  private static getStatusDetails(status: string): StatusDetails {
    const statusMap: Record<string, StatusDetails> = {
      confirmed: {
        title: 'Order Confirmed',
        message: 'Your order has been confirmed and is being prepared.',
        emoji: '✅',
        color: '#10B981',
      },
      processing: {
        title: 'Order Processing',
        message: 'Your order is being processed and will ship soon.',
        emoji: '⚙️',
        color: '#3B82F6',
      },
      shipped: {
        title: 'Order Shipped',
        message: 'Great news! Your order has been shipped and is on its way.',
        emoji: '🚚',
        color: '#8B5CF6',
      },
      out_for_delivery: {
        title: 'Out for Delivery',
        message: 'Your order is out for delivery and will arrive soon!',
        emoji: '📦',
        color: '#F59E0B',
      },
      delivered: {
        title: 'Order Delivered',
        message: 'Your order has been delivered. We hope you love it!',
        emoji: '🎉',
        color: '#10B981',
      },
      cancelled: {
        title: 'Order Cancelled',
        message: 'Your order has been cancelled.',
        emoji: '❌',
        color: '#EF4444',
      },
    };

    return (
      statusMap[status] || {
        title: 'Order Update',
        message: `Your order status: ${status.replace(/_/g, ' ')}`,
        emoji: '📋',
        color: '#6B7280',
      }
    );
  }

  /**
   * Generate order confirmation HTML
   */
  private static generateOrderConfirmationHTML(order: any, store: IStoreDocument): string {
    const itemsHTML = order.lineItems
      .map(
        (item: any) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">
            <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${item.title || item.name}</div>
            ${item.variantTitle ? `<div style="font-size: 14px; color: #6B7280;">${item.variantTitle}</div>` : ''}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: center; color: #374151;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 500; color: #111827;">${Number(item.price).toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F9FAFB;">

        <div style="text-align: center; margin-bottom: 40px; padding: 30px 0;">
          <h1 style="color: #8B5CF6; margin: 0 0 8px 0; font-size: 28px;">Order Confirmed!</h1>
          <p style="font-size: 16px; color: #6B7280; margin: 0;">Thank you for your order</p>
        </div>

        <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Order Details</h2>
          <div>
            <p style="margin: 5px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(order.placedAt || order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #10B981;">${(order.mobileStatus?.current || 'Placed').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</span></p>
          </div>
        </div>

        <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Order Items</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #E5E7EB;">
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #6B7280; font-size: 14px;">Item</th>
                <th style="padding: 12px; text-align: center; font-weight: 600; color: #6B7280; font-size: 14px;">Qty</th>
                <th style="padding: 12px; text-align: right; font-weight: 600; color: #6B7280; font-size: 14px;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>
        </div>

        <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between;">
              <span>Subtotal:</span>
              <span>${Number(order.subtotalPrice).toFixed(2)}</span>
            </div>
            ${
              order.totalTax
                ? `
            <div style="display: flex; justify-content: space-between;">
              <span>Tax:</span>
              <span>${Number(order.totalTax).toFixed(2)}</span>
            </div>
            `
                : ''
            }
            ${
              order.shipping?.cost
                ? `
            <div style="display: flex; justify-content: space-between;">
              <span>Shipping:</span>
              <span>${Number(order.shipping.cost).toFixed(2)}</span>
            </div>
            `
                : ''
            }
            <div style="border-top: 2px solid #E5E7EB; padding-top: 12px; margin-top: 4px;"></div>
            <div style="display: flex; justify-content: space-between; font-size: 20px; font-weight: 700;">
              <span>Total:</span>
              <span style="color: #8B5CF6;">${Number(order.totalPrice).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Shipping Address</h3>
          <div style="color: #6B7280; line-height: 1.6;">
            ${order.shippingAddress?.firstName || ''} ${order.shippingAddress?.lastName || ''}<br>
            ${order.shippingAddress?.address1 || ''}<br>
            ${order.shippingAddress?.address2 ? order.shippingAddress.address2 + '<br>' : ''}
            ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.province || ''} ${order.shippingAddress?.zip || ''}<br>
            ${order.shippingAddress?.country || ''}
          </div>
        </div>

        <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
          <p style="margin: 0; color: #6B7280;">We'll send you shipping updates when your order is on its way.</p>
        </div>

        <div style="text-align: center; color: #9CA3AF; font-size: 14px; padding: 24px 0;">
          <p style="margin: 0 0 8px 0;">Questions? Reply to this email.</p>
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${store.name}. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate order confirmation plain text
   */
  private static generateOrderConfirmationText(order: any): string {
    return `
Order Confirmation

Order Number: ${order.orderNumber}
Date: ${new Date(order.placedAt || order.createdAt).toLocaleDateString()}
Total: ${Number(order.totalPrice).toFixed(2)}

We've received your order and will send you shipping updates when it's on its way.

Thank you for your order!
    `.trim();
  }

  /**
   * Generate status update HTML
   */
  private static generateStatusUpdateHTML(
    order: any,
    status: string,
    statusDetails: StatusDetails,
    additionalInfo: string | undefined,
    store: IStoreDocument
  ): string {
    const trackingHTML = order.shipping?.trackingNumber
      ? `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px; margin: 24px 0; color: white;">
          <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Track Your Package</h3>
          <div style="background: rgba(255,255,255,0.1); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <div style="margin-bottom: 8px;">
              <span style="opacity: 0.9;">Carrier:</span>
              <span style="font-weight: 600; margin-left: 8px;">${order.shipping.carrier || 'Standard Shipping'}</span>
            </div>
            <div>
              <span style="opacity: 0.9;">Tracking:</span>
              <span style="font-weight: 600; margin-left: 8px; font-family: monospace;">${order.shipping.trackingNumber}</span>
            </div>
          </div>
          ${
            order.shipping.trackingUrl
              ? `
            <div style="text-align: center;">
              <a href="${order.shipping.trackingUrl}"
                 style="display: inline-block; background: white; color: #8B5CF6; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Track Package
              </a>
            </div>
          `
              : ''
          }
        </div>
      `
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F9FAFB;">

        <div style="text-align: center; margin-bottom: 40px; padding: 30px 0;">
          <div style="font-size: 48px; margin-bottom: 16px;">${statusDetails.emoji}</div>
          <h1 style="color: ${statusDetails.color}; margin: 0 0 8px 0; font-size: 28px;">${statusDetails.title}</h1>
          <p style="font-size: 16px; color: #6B7280; margin: 0;">Order ${order.orderNumber}</p>
        </div>

        <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; border-left: 4px solid ${statusDetails.color};">
          <p style="font-size: 18px; margin: 0; font-weight: 500;">${statusDetails.message}</p>
          ${additionalInfo ? `<p style="font-size: 14px; margin: 12px 0 0 0; color: #6B7280;">${additionalInfo}</p>` : ''}
        </div>

        ${trackingHTML}

        <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Order Summary</h3>
          <div>
            <p style="margin: 5px 0;"><strong>Items:</strong> ${order.lineItems.length} item(s)</p>
            <p style="margin: 5px 0;"><strong>Total:</strong> ${Number(order.totalPrice).toFixed(2)}</p>
          </div>
        </div>

        <div style="text-align: center; color: #9CA3AF; font-size: 14px; padding: 24px 0;">
          <p style="margin: 0 0 8px 0;">Questions? Reply to this email.</p>
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${store.name}. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate status update plain text
   */
  private static generateStatusUpdateText(order: any, status: string, statusDetails: StatusDetails): string {
    return `
${statusDetails.title}

Order ${order.orderNumber}

${statusDetails.message}

${order.shipping?.trackingNumber ? `Tracking Number: ${order.shipping.trackingNumber}` : ''}
    `.trim();
  }

  /**
   * Generate cancellation HTML
   */
  private static generateCancellationHTML(order: any, reason: string | undefined, store: IStoreDocument): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F9FAFB;">

        <div style="text-align: center; margin-bottom: 40px; padding: 30px 0;">
          <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
          <h1 style="color: #EF4444; margin: 0 0 8px 0; font-size: 28px;">Order Cancelled</h1>
          <p style="font-size: 16px; color: #6B7280; margin: 0;">Order ${order.orderNumber}</p>
        </div>

        <div style="background: #FEE2E2; padding: 24px; border-radius: 12px; margin-bottom: 24px; border-left: 4px solid #EF4444;">
          <p style="margin: 0; color: #991B1B; font-weight: 500;">Your order has been cancelled.</p>
          ${reason ? `<p style="margin: 12px 0 0 0; color: #991B1B;"><strong>Reason:</strong> ${reason}</p>` : ''}
        </div>

        <div style="background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">Refund Information</h3>
          <p style="margin: 0 0 16px 0; color: #6B7280;">If payment was processed, a refund will be issued to your original payment method within 5-7 business days.</p>
          <div style="background: #F3F4F6; padding: 16px; border-radius: 8px;">
            <p style="margin: 0;"><strong>Refund Amount:</strong> <span style="color: #10B981; font-weight: 600;">${Number(order.totalPrice).toFixed(2)}</span></p>
          </div>
        </div>

        <div style="text-align: center; color: #9CA3AF; font-size: 14px; padding: 24px 0;">
          <p style="margin: 0 0 8px 0;">Questions? Reply to this email.</p>
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${store.name}. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;
  }
}

export default EmailService;
