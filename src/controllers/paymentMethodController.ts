import { Body, Controller, Delete, Get, Patch, Path, Post, Request, Route, Security, Tags, Response } from 'tsoa';
import PaymentMethod from '../models/PaymentMethod';
import User from '../models/User';
import stripeService from '../services/stripeService';
import {
  AddPaymentMethodRequest,
  AddPaymentMethodResponse,
  GetPaymentMethodsResponse,
  DeletePaymentMethodResponse,
  SetDefaultPaymentMethodResponse,
} from '../types/api/paymentMethod';

/**
 * Payment Method Controller
 *
 * Manages customer payment methods for checkout
 * - Add/remove payment methods
 * - Set default payment method
 * - List all payment methods
 *
 * Security: All endpoints require JWT authentication
 * Integration: Stripe for payment method storage (PCI compliant)
 */
@Route('payment-methods')
@Tags('Payment Methods')
export class PaymentMethodController extends Controller {
  /**
   * Get all payment methods for authenticated user
   * @param request - Express request with authenticated user
   * @returns List of user's payment methods
   */
  @Get()
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async getPaymentMethods(@Request() request: any): Promise<GetPaymentMethodsResponse> {
    try {
      const userId = request.user._id;

      // Find all payment methods for user (exclude expired by default)
      const paymentMethods = await PaymentMethod.findByUser(userId, { includeExpired: false });

      // Check if user has a default payment method
      const hasDefault = paymentMethods.some((pm) => pm.isDefault);

      return {
        success: true,
        data: {
          paymentMethods: paymentMethods.map((pm) => pm.toSafeObject()),
          count: paymentMethods.length,
          hasDefault,
        },
      };
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      this.setStatus(500);
      throw new Error('Failed to fetch payment methods');
    }
  }

  /**
   * Add a new payment method
   *
   * Flow:
   * 1. Frontend creates payment method with Stripe.js (PCI compliant)
   * 2. Frontend sends stripePaymentMethodId to backend
   * 3. Backend attaches to Stripe customer
   * 4. Backend saves to database
   *
   * @param requestBody - Payment method details
   * @param request - Express request with authenticated user
   * @returns Created payment method
   */
  @Post()
  @Security('jwt')
  @Response(400, 'Bad Request - Invalid payment method')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async addPaymentMethod(
    @Body() requestBody: AddPaymentMethodRequest,
    @Request() request: any
  ): Promise<AddPaymentMethodResponse> {
    try {
      const userId = request.user._id;

      // Validate required fields
      if (!requestBody.stripePaymentMethodId) {
        this.setStatus(400);
        throw new Error('Stripe payment method ID is required');
      }

      if (!requestBody.billingAddress) {
        this.setStatus(400);
        throw new Error('Billing address is required');
      }

      // Get user to retrieve or create Stripe customer
      const user = await User.findById(userId);
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      // Ensure user has Stripe customer ID
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        // Create Stripe customer
        const stripeCustomer = await stripeService.createCustomer(user.email, {
          userId: userId.toString(),
          name: user.name || '',
        });
        stripeCustomerId = stripeCustomer.id;

        // Save Stripe customer ID to user
        user.stripeCustomerId = stripeCustomerId;
        await user.save();
      }

      // Attach payment method to Stripe customer
      const stripePaymentMethod = await stripeService.attachPaymentMethod(
        requestBody.stripePaymentMethodId,
        stripeCustomerId
      );

      // Determine if this should be default (first payment method)
      const existingPaymentMethods = await PaymentMethod.findByUser(userId);
      const isDefault = requestBody.isDefault ?? existingPaymentMethods.length === 0;

      // Extract payment method details from Stripe
      const paymentMethodData: any = {
        userId,
        stripePaymentMethodId: stripePaymentMethod.id,
        stripeCustomerId,
        type: stripePaymentMethod.type as 'card' | 'google_pay' | 'apple_pay',
        billingAddress: requestBody.billingAddress,
        isDefault,
      };

      // Add card details if it's a card payment method
      if (stripePaymentMethod.type === 'card' && stripePaymentMethod.card) {
        paymentMethodData.card = {
          brand: stripePaymentMethod.card.brand,
          last4: stripePaymentMethod.card.last4,
          expMonth: stripePaymentMethod.card.exp_month,
          expYear: stripePaymentMethod.card.exp_year,
          fingerprint: stripePaymentMethod.card.fingerprint,
        };
      }

      // Create payment method in database
      const paymentMethod = new PaymentMethod(paymentMethodData);
      await paymentMethod.save();

      return {
        success: true,
        data: {
          paymentMethod: paymentMethod.toSafeObject(),
        },
        message: 'Payment method added successfully',
      };
    } catch (error) {
      console.error('Error adding payment method:', error);

      // Handle Stripe errors
      if ((error as any).type === 'StripeCardError') {
        this.setStatus(400);
        throw new Error((error as Error).message);
      }

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Delete a payment method
   * @param id - Payment method ID
   * @param request - Express request with authenticated user
   * @returns Success message
   */
  @Delete('{id}')
  @Security('jwt')
  @Response(400, 'Bad Request - Cannot delete default payment method')
  @Response(401, 'Unauthorized')
  @Response(404, 'Payment method not found')
  @Response(500, 'Internal Server Error')
  public async deletePaymentMethod(
    @Path() id: string,
    @Request() request: any
  ): Promise<DeletePaymentMethodResponse> {
    try {
      const userId = request.user._id;

      // Find payment method
      const paymentMethod = await PaymentMethod.findById(id);

      if (!paymentMethod) {
        this.setStatus(404);
        throw new Error('Payment method not found');
      }

      // Verify ownership
      if (!paymentMethod.belongsToUser(userId)) {
        this.setStatus(403);
        throw new Error('You do not have permission to delete this payment method');
      }

      // Prevent deletion of default payment method if other methods exist
      if (paymentMethod.isDefault) {
        const otherMethods = await PaymentMethod.findByUser(userId);
        if (otherMethods.length > 1) {
          this.setStatus(400);
          throw new Error('Cannot delete default payment method. Set another as default first.');
        }
      }

      // Detach from Stripe
      try {
        await stripeService.detachPaymentMethod(paymentMethod.stripePaymentMethodId);
      } catch (stripeError) {
        // Log error but continue with deletion
        console.warn('Failed to detach payment method from Stripe:', stripeError);
      }

      // Delete from database
      await PaymentMethod.findByIdAndDelete(id);

      return {
        success: true,
        message: 'Payment method deleted successfully',
      };
    } catch (error) {
      console.error('Error deleting payment method:', error);

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Set payment method as default
   * @param id - Payment method ID
   * @param request - Express request with authenticated user
   * @returns Updated payment method
   */
  @Patch('{id}/default')
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(404, 'Payment method not found')
  @Response(500, 'Internal Server Error')
  public async setDefaultPaymentMethod(
    @Path() id: string,
    @Request() request: any
  ): Promise<SetDefaultPaymentMethodResponse> {
    try {
      const userId = request.user._id;

      // Find payment method
      const paymentMethod = await PaymentMethod.findById(id);

      if (!paymentMethod) {
        this.setStatus(404);
        throw new Error('Payment method not found');
      }

      // Verify ownership
      if (!paymentMethod.belongsToUser(userId)) {
        this.setStatus(403);
        throw new Error('You do not have permission to modify this payment method');
      }

      // Check if expired
      if (paymentMethod.isExpired) {
        this.setStatus(400);
        throw new Error('Cannot set expired payment method as default');
      }

      // Set as default (static method handles removing default from others)
      const updatedPaymentMethod = await PaymentMethod.setDefault(id, userId);

      if (!updatedPaymentMethod) {
        this.setStatus(500);
        throw new Error('Failed to set payment method as default');
      }

      return {
        success: true,
        data: {
          paymentMethod: updatedPaymentMethod.toSafeObject(),
        },
        message: 'Default payment method updated successfully',
      };
    } catch (error) {
      console.error('Error setting default payment method:', error);

      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }
}
