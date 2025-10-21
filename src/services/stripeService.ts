import Stripe from 'stripe';
import { tenantConfig } from '../config/tenant';

/**
 * Stripe Payment Service
 *
 * Handles all Stripe payment processing operations
 * - Customer management
 * - Payment method management
 * - Payment intent creation and confirmation
 * - Webhook signature verification
 *
 * Security: All sensitive operations happen server-side
 * PCI Compliance: No raw card data is handled
 *
 * Reference: https://stripe.com/docs/api
 */

class StripeService {
  private stripe: Stripe | null = null;
  private webhookSecret: string;
  private isConfigured: boolean = false;

  constructor() {
    const secretKey = tenantConfig.payments.stripe.secretKey;
    this.webhookSecret = tenantConfig.payments.stripe.webhookSecret || '';

    if (!secretKey) {
      console.warn('⚠️ Stripe not configured. Payment features will be disabled.');
      console.warn('Set STRIPE_SECRET_KEY in environment variables to enable payments.');
      this.isConfigured = false;
      return;
    }

    try {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2024-12-18.acacia', // Latest stable version
        typescript: true,
        telemetry: false, // Disable telemetry in production
      });
      this.isConfigured = true;
      console.log('✅ Stripe initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Stripe:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Check if Stripe is properly configured
   */
  public isReady(): boolean {
    return this.isConfigured && this.stripe !== null;
  }

  /**
   * Ensure Stripe is configured before operations
   */
  private ensureConfigured(): void {
    if (!this.isReady()) {
      throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.');
    }
  }

  // =============================================================================
  // CUSTOMER MANAGEMENT
  // =============================================================================

  /**
   * Create a Stripe customer
   * @param email - Customer email
   * @param metadata - Optional metadata (userId, etc.)
   * @returns Stripe customer object
   */
  async createCustomer(
    email: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.Customer> {
    this.ensureConfigured();

    try {
      const customer = await this.stripe!.customers.create({
        email,
        metadata: metadata || {},
      });

      return customer;
    } catch (error) {
      console.error('Stripe createCustomer error:', error);
      throw new Error(`Failed to create Stripe customer: ${(error as Error).message}`);
    }
  }

  /**
   * Get Stripe customer by ID
   */
  async getCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    this.ensureConfigured();

    try {
      return await this.stripe!.customers.retrieve(customerId);
    } catch (error) {
      console.error('Stripe getCustomer error:', error);
      throw new Error(`Failed to retrieve Stripe customer: ${(error as Error).message}`);
    }
  }

  /**
   * Update Stripe customer
   */
  async updateCustomer(
    customerId: string,
    updates: Stripe.CustomerUpdateParams
  ): Promise<Stripe.Customer> {
    this.ensureConfigured();

    try {
      return await this.stripe!.customers.update(customerId, updates);
    } catch (error) {
      console.error('Stripe updateCustomer error:', error);
      throw new Error(`Failed to update Stripe customer: ${(error as Error).message}`);
    }
  }

  // =============================================================================
  // PAYMENT METHOD MANAGEMENT
  // =============================================================================

  /**
   * Attach payment method to customer
   * Important: Payment methods must be created on frontend with Stripe.js for PCI compliance
   * @param paymentMethodId - Payment method ID from frontend
   * @param customerId - Stripe customer ID
   * @returns Attached payment method
   */
  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<Stripe.PaymentMethod> {
    this.ensureConfigured();

    try {
      const paymentMethod = await this.stripe!.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      return paymentMethod;
    } catch (error) {
      console.error('Stripe attachPaymentMethod error:', error);
      throw new Error(`Failed to attach payment method: ${(error as Error).message}`);
    }
  }

  /**
   * Detach payment method from customer (for deletion)
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    this.ensureConfigured();

    try {
      return await this.stripe!.paymentMethods.detach(paymentMethodId);
    } catch (error) {
      console.error('Stripe detachPaymentMethod error:', error);
      throw new Error(`Failed to detach payment method: ${(error as Error).message}`);
    }
  }

  /**
   * Get payment method details
   */
  async getPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    this.ensureConfigured();

    try {
      return await this.stripe!.paymentMethods.retrieve(paymentMethodId);
    } catch (error) {
      console.error('Stripe getPaymentMethod error:', error);
      throw new Error(`Failed to retrieve payment method: ${(error as Error).message}`);
    }
  }

  /**
   * List customer's payment methods
   */
  async listPaymentMethods(customerId: string, type: string = 'card'): Promise<Stripe.PaymentMethod[]> {
    this.ensureConfigured();

    try {
      const paymentMethods = await this.stripe!.paymentMethods.list({
        customer: customerId,
        type: type as Stripe.PaymentMethodListParams.Type,
      });

      return paymentMethods.data;
    } catch (error) {
      console.error('Stripe listPaymentMethods error:', error);
      throw new Error(`Failed to list payment methods: ${(error as Error).message}`);
    }
  }

  // =============================================================================
  // PAYMENT INTENT (CHECKOUT)
  // =============================================================================

  /**
   * Create payment intent for checkout
   * @param amount - Amount in cents (e.g., 1000 = $10.00)
   * @param currency - Currency code (e.g., 'usd')
   * @param customerId - Stripe customer ID
   * @param paymentMethodId - Payment method ID
   * @param metadata - Additional metadata (orderId, sessionId, etc.)
   * @returns Payment intent
   */
  async createPaymentIntent(
    amount: number,
    currency: string,
    customerId: string,
    paymentMethodId: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.PaymentIntent> {
    this.ensureConfigured();

    try {
      const paymentIntent = await this.stripe!.paymentIntents.create({
        amount: Math.round(amount), // Ensure integer
        currency: currency.toLowerCase(),
        customer: customerId,
        payment_method: paymentMethodId,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never', // Prevent redirects for better UX
        },
        metadata: metadata || {},
        // Capture payment immediately upon confirmation
        capture_method: 'automatic',
        // Save payment method for future use
        setup_future_usage: 'off_session',
      });

      return paymentIntent;
    } catch (error) {
      console.error('Stripe createPaymentIntent error:', error);
      throw new Error(`Failed to create payment intent: ${(error as Error).message}`);
    }
  }

  /**
   * Confirm payment intent
   * @param paymentIntentId - Payment intent ID
   * @param paymentMethodId - Optional payment method if not set during creation
   * @returns Confirmed payment intent
   */
  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId?: string
  ): Promise<Stripe.PaymentIntent> {
    this.ensureConfigured();

    try {
      const params: Stripe.PaymentIntentConfirmParams = {};
      if (paymentMethodId) {
        params.payment_method = paymentMethodId;
      }

      return await this.stripe!.paymentIntents.confirm(paymentIntentId, params);
    } catch (error) {
      console.error('Stripe confirmPaymentIntent error:', error);
      throw new Error(`Failed to confirm payment intent: ${(error as Error).message}`);
    }
  }

  /**
   * Get payment intent details
   */
  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    this.ensureConfigured();

    try {
      return await this.stripe!.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      console.error('Stripe getPaymentIntent error:', error);
      throw new Error(`Failed to retrieve payment intent: ${(error as Error).message}`);
    }
  }

  /**
   * Cancel payment intent (before confirmation)
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    this.ensureConfigured();

    try {
      return await this.stripe!.paymentIntents.cancel(paymentIntentId);
    } catch (error) {
      console.error('Stripe cancelPaymentIntent error:', error);
      throw new Error(`Failed to cancel payment intent: ${(error as Error).message}`);
    }
  }

  // =============================================================================
  // REFUNDS
  // =============================================================================

  /**
   * Create refund for a payment
   * @param paymentIntentId - Payment intent ID
   * @param amount - Optional partial refund amount in cents
   * @param reason - Refund reason
   * @returns Refund object
   */
  async createRefund(
    paymentIntentId: string,
    amount?: number,
    reason?: Stripe.RefundCreateParams.Reason
  ): Promise<Stripe.Refund> {
    this.ensureConfigured();

    try {
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
      };

      if (amount) {
        refundParams.amount = Math.round(amount);
      }

      if (reason) {
        refundParams.reason = reason;
      }

      return await this.stripe!.refunds.create(refundParams);
    } catch (error) {
      console.error('Stripe createRefund error:', error);
      throw new Error(`Failed to create refund: ${(error as Error).message}`);
    }
  }

  // =============================================================================
  // WEBHOOKS
  // =============================================================================

  /**
   * Verify webhook signature and construct event
   * Important: Always verify webhook signatures to prevent attacks
   * @param payload - Raw request body
   * @param signature - Stripe-Signature header
   * @returns Verified Stripe event
   */
  constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
    this.ensureConfigured();

    if (!this.webhookSecret) {
      throw new Error('Webhook secret not configured. Set STRIPE_WEBHOOK_SECRET in environment.');
    }

    try {
      return this.stripe!.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (error) {
      console.error('Stripe webhook verification error:', error);
      throw new Error(`Webhook signature verification failed: ${(error as Error).message}`);
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Convert dollars to cents (Stripe uses smallest currency unit)
   * @param dollars - Amount in dollars (e.g., 10.50)
   * @returns Amount in cents (e.g., 1050)
   */
  dollarsToCents(dollars: number): number {
    return Math.round(dollars * 100);
  }

  /**
   * Convert cents to dollars
   * @param cents - Amount in cents (e.g., 1050)
   * @returns Amount in dollars (e.g., 10.50)
   */
  centsToDollars(cents: number): number {
    return cents / 100;
  }

  /**
   * Format amount for display
   * @param amount - Amount in cents
   * @param currency - Currency code
   * @returns Formatted string (e.g., "$10.50")
   */
  formatAmount(amount: number, currency: string = 'usd'): string {
    const dollars = this.centsToDollars(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(dollars);
  }

  /**
   * Check if payment intent requires action (3D Secure, etc.)
   */
  requiresAction(paymentIntent: Stripe.PaymentIntent): boolean {
    return paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action';
  }

  /**
   * Check if payment intent succeeded
   */
  isSucceeded(paymentIntent: Stripe.PaymentIntent): boolean {
    return paymentIntent.status === 'succeeded';
  }

  /**
   * Check if payment intent failed
   */
  isFailed(paymentIntent: Stripe.PaymentIntent): boolean {
    return paymentIntent.status === 'canceled' || paymentIntent.status === 'requires_payment_method';
  }
}

// Export singleton instance
export default new StripeService();
