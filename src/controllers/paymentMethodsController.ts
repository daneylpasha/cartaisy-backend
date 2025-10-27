import { Controller, Get, Post, Delete, Put, Body, Path, Request, Route, Tags, Security, Response, SuccessResponse } from 'tsoa';
import { AuthenticatedRequest } from '../types';
import User from '../models/User';
import Stripe from 'stripe';
import {
  StorePaymentMethodRequest,
  StorePaymentMethodResponse,
  ListStoredPaymentMethodsResponse,
  DeleteStoredPaymentMethodResponse,
  UpdateDefaultPaymentMethodRequest,
  UpdateDefaultPaymentMethodResponse,
  GetDefaultStoredPaymentMethodResponse,
  StoredPaymentMethod
} from '../types/api/paymentMethods';

// Import Stripe service
import stripeService from '../services/stripeService';

/**
 * Payment Methods Controller
 * Manages user payment methods via Stripe
 *
 * Security & Compliance:
 * - Never handles raw card data (PCI compliant)
 * - Frontend creates PaymentMethods using Stripe SDK
 * - Backend only attaches/detaches payment methods
 * - All sensitive data stays with Stripe
 */
@Route('payment-methods')
@Tags('Payment Methods')
export class PaymentMethodsController extends Controller {
  /**
   * Transform Stripe PaymentMethod to sanitized format
   */
  private transformPaymentMethod(pm: Stripe.PaymentMethod, defaultPmId?: string): StoredPaymentMethod {
    return {
      id: pm.id,
      type: pm.type,
      card: pm.card ? {
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
        country: pm.card.country || undefined
      } : undefined,
      isDefault: pm.id === defaultPmId,
      created: pm.created,
      allow_redisplay: pm.allow_redisplay || undefined
    };
  }

  /**
   * Ensure user has a Stripe customer ID
   * Creates one if it doesn't exist
   */
  private async ensureStripeCustomer(user: any): Promise<string> {
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Create Stripe customer
    const customer = await stripeService.createCustomer(user.email, {
      userId: user._id.toString(),
      name: user.name || user.email
    });

    // Save customer ID to user
    user.stripeCustomerId = customer.id;
    await user.save();

    return customer.id;
  }

  /**
   * List all payment methods for the authenticated user
   * @summary Get all saved payment methods
   * @param request Express request with authenticated user
   * @returns List of payment methods
   */
  @Get()
  @Security('jwt')
  @SuccessResponse(200, 'Payment methods retrieved successfully')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async listPaymentMethods(@Request() request: AuthenticatedRequest): Promise<ListStoredPaymentMethodsResponse> {
    try {
      if (!request.user) {
        this.setStatus(401);
        return {
          success: false,
          data: {
            paymentMethods: [],
            count: 0
          }
        };
      }

      // Get user from database
      const user = await User.findById(request.user._id);
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      // If user doesn't have Stripe customer ID, return empty list
      if (!user.stripeCustomerId) {
        return {
          success: true,
          data: {
            paymentMethods: [],
            count: 0
          }
        };
      }

      // Get customer to find default payment method
      const customer = await stripeService.getCustomer(user.stripeCustomerId);
      const defaultPmId = (customer as Stripe.Customer).invoice_settings?.default_payment_method as string | undefined;

      // List payment methods from Stripe
      const paymentMethods = await stripeService.listPaymentMethods(user.stripeCustomerId, 'card');

      // Transform payment methods
      const transformedPms = paymentMethods.map(pm =>
        this.transformPaymentMethod(pm, defaultPmId)
      );

      return {
        success: true,
        data: {
          paymentMethods: transformedPms,
          defaultPaymentMethodId: defaultPmId,
          count: transformedPms.length
        }
      };
    } catch (error) {
      console.error('List payment methods error:', error);
      this.setStatus(500);
      throw error;
    }
  }

  /**
   * Add a new payment method
   * @summary Attach payment method created on frontend
   * @param requestBody Payment method ID from Stripe SDK
   * @param request Express request with authenticated user
   * @returns Added payment method details
   */
  @Post()
  @Security('jwt')
  @SuccessResponse(201, 'Payment method added successfully')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async addPaymentMethod(
    @Body() requestBody: StorePaymentMethodRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<StorePaymentMethodResponse> {
    try {
      if (!request.user) {
        this.setStatus(401);
        return {
          success: false,
          message: 'User not authenticated'
        };
      }

      const { paymentMethodId, setAsDefault } = requestBody;

      if (!paymentMethodId) {
        this.setStatus(400);
        return {
          success: false,
          message: 'Payment method ID is required'
        };
      }

      // Get user from database
      const user = await User.findById(request.user._id);
      if (!user) {
        this.setStatus(404);
        return {
          success: false,
          message: 'User not found'
        };
      }

      // Ensure user has Stripe customer ID
      const customerId = await this.ensureStripeCustomer(user);

      // Attach payment method to customer
      const paymentMethod = await stripeService.attachPaymentMethod(paymentMethodId, customerId);

      // Set as default if requested
      if (setAsDefault) {
        await stripeService.updateCustomer(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });
      }

      this.setStatus(201);
      return {
        success: true,
        message: 'Payment method added successfully',
        data: {
          paymentMethod: this.transformPaymentMethod(paymentMethod, setAsDefault ? paymentMethodId : undefined)
        }
      };
    } catch (error) {
      console.error('Add payment method error:', error);
      this.setStatus(500);
      return {
        success: false,
        message: `Failed to add payment method: ${(error as Error).message}`
      };
    }
  }

  /**
   * Remove a payment method
   * @summary Detach payment method from customer
   * @param paymentMethodId Payment method ID to remove
   * @param request Express request with authenticated user
   * @returns Success message
   */
  @Delete('{paymentMethodId}')
  @Security('jwt')
  @SuccessResponse(200, 'Payment method removed successfully')
  @Response(401, 'Unauthorized')
  @Response(404, 'Payment method not found')
  @Response(500, 'Internal Server Error')
  public async removePaymentMethod(
    @Path() paymentMethodId: string,
    @Request() request: AuthenticatedRequest
  ): Promise<DeleteStoredPaymentMethodResponse> {
    try {
      if (!request.user) {
        this.setStatus(401);
        return {
          success: false,
          message: 'User not authenticated'
        };
      }

      // Get user from database
      const user = await User.findById(request.user._id);
      if (!user || !user.stripeCustomerId) {
        this.setStatus(404);
        return {
          success: false,
          message: 'User or Stripe customer not found'
        };
      }

      // Get payment method to verify it belongs to this customer
      const paymentMethod = await stripeService.getPaymentMethod(paymentMethodId);

      if (paymentMethod.customer !== user.stripeCustomerId) {
        this.setStatus(403);
        return {
          success: false,
          message: 'Payment method does not belong to this user'
        };
      }

      // Detach payment method
      await stripeService.detachPaymentMethod(paymentMethodId);

      return {
        success: true,
        message: 'Payment method removed successfully'
      };
    } catch (error) {
      console.error('Remove payment method error:', error);
      this.setStatus(500);
      return {
        success: false,
        message: `Failed to remove payment method: ${(error as Error).message}`
      };
    }
  }

  /**
   * Set a payment method as default
   * @summary Set default payment method for future charges
   * @param requestBody Payment method ID to set as default
   * @param request Express request with authenticated user
   * @returns Success message
   */
  @Put('default')
  @Security('jwt')
  @SuccessResponse(200, 'Default payment method updated successfully')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Payment method not found')
  @Response(500, 'Internal Server Error')
  public async setDefaultPaymentMethod(
    @Body() requestBody: UpdateDefaultPaymentMethodRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<UpdateDefaultPaymentMethodResponse> {
    try {
      if (!request.user) {
        this.setStatus(401);
        return {
          success: false,
          message: 'User not authenticated'
        };
      }

      const { paymentMethodId } = requestBody;

      if (!paymentMethodId) {
        this.setStatus(400);
        return {
          success: false,
          message: 'Payment method ID is required'
        };
      }

      // Get user from database
      const user = await User.findById(request.user._id);
      if (!user || !user.stripeCustomerId) {
        this.setStatus(404);
        return {
          success: false,
          message: 'User or Stripe customer not found'
        };
      }

      // Verify payment method belongs to this customer
      const paymentMethod = await stripeService.getPaymentMethod(paymentMethodId);

      if (paymentMethod.customer !== user.stripeCustomerId) {
        this.setStatus(403);
        return {
          success: false,
          message: 'Payment method does not belong to this user'
        };
      }

      // Update default payment method
      await stripeService.updateCustomer(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      return {
        success: true,
        message: 'Default payment method updated successfully',
        data: {
          paymentMethodId
        }
      };
    } catch (error) {
      console.error('Set default payment method error:', error);
      this.setStatus(500);
      return {
        success: false,
        message: `Failed to set default payment method: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get default payment method
   * @summary Get the default payment method for the user
   * @param request Express request with authenticated user
   * @returns Default payment method details
   */
  @Get('default')
  @Security('jwt')
  @SuccessResponse(200, 'Default payment method retrieved successfully')
  @Response(401, 'Unauthorized')
  @Response(404, 'No default payment method found')
  @Response(500, 'Internal Server Error')
  public async getDefaultPaymentMethod(@Request() request: AuthenticatedRequest): Promise<GetDefaultStoredPaymentMethodResponse> {
    try {
      if (!request.user) {
        this.setStatus(401);
        return {
          success: false,
          message: 'User not authenticated'
        };
      }

      // Get user from database
      const user = await User.findById(request.user._id);
      if (!user || !user.stripeCustomerId) {
        this.setStatus(404);
        return {
          success: false,
          message: 'User or Stripe customer not found'
        };
      }

      // Get customer
      const customer = await stripeService.getCustomer(user.stripeCustomerId);
      const defaultPmId = (customer as Stripe.Customer).invoice_settings?.default_payment_method as string | undefined;

      if (!defaultPmId) {
        this.setStatus(404);
        return {
          success: false,
          message: 'No default payment method found'
        };
      }

      // Get payment method details
      const paymentMethod = await stripeService.getPaymentMethod(defaultPmId);

      return {
        success: true,
        data: {
          paymentMethod: this.transformPaymentMethod(paymentMethod, defaultPmId)
        }
      };
    } catch (error) {
      console.error('Get default payment method error:', error);
      this.setStatus(500);
      return {
        success: false,
        message: `Failed to get default payment method: ${(error as Error).message}`
      };
    }
  }
}
