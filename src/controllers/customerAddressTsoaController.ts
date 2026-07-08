import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Request,
  Route,
  Security,
  Tags,
  Response,
  SuccessResponse,
} from '@tsoa/runtime';
import mongoose from 'mongoose';
import Customer from '../models/Customer';
import { IAddress } from '../types';

/**
 * Customer Address interface for request body
 */
interface CustomerAddAddressRequest {
  /** Address label like "Home", "Work" */
  label?: string;
  /** Address type */
  type?: 'billing' | 'shipping' | 'both';
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Phone number */
  phone?: string;
  /** Street address line 1 */
  address1: string;
  /** Street address line 2 */
  address2?: string;
  /** City */
  city?: string;
  /** State/Province */
  province: string;
  /** Country name */
  country: string;
  /** ISO country code like "US", "GB" */
  countryCode?: string;
  /** Postal/ZIP code */
  zip?: string;
  /** Delivery instructions (max 300 characters) */
  deliveryInstructions?: string;
  /** Set as default address */
  isDefault?: boolean;
}

interface CustomerUpdateAddressRequest {
  label?: string;
  type?: 'billing' | 'shipping' | 'both';
  firstName?: string;
  lastName?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  country?: string;
  countryCode?: string;
  zip?: string;
  deliveryInstructions?: string;
  isDefault?: boolean;
}

interface CustomerAddressResponse {
  _id?: string;
  label?: string;
  type?: 'billing' | 'shipping' | 'both';
  firstName?: string;
  lastName?: string;
  phone?: string;
  address1: string;
  address2?: string;
  city?: string;
  province: string;
  country: string;
  countryCode?: string;
  zip?: string;
  deliveryInstructions?: string;
  isDefault?: boolean;
}

/**
 * Customer Address Controller
 * Manages customer addresses for checkout and delivery (Mobile App)
 */
@Route('customer/addresses')
@Tags('Customer Addresses')
export class CustomerAddressTsoaController extends Controller {
  /**
   * Get all addresses for the authenticated customer
   * @summary Get customer addresses
   */
  @Get()
  @Security('jwt')
  @SuccessResponse(200, 'Addresses retrieved successfully')
  @Response(401, 'Unauthorized')
  @Response(404, 'Customer not found')
  @Response(500, 'Internal Server Error')
  public async customerGetAddresses(@Request() request: any): Promise<{
    status: 'success' | 'error';
    data?: CustomerAddressResponse[];
    message?: string;
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      const customer = await Customer.findById(customerId).select('addresses');

      if (!customer) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Customer not found',
        };
      }

      this.setStatus(200);
      return {
        status: 'success',
        data: customer.addresses || [],
      };
    } catch (error) {
      console.error('Get addresses error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to get addresses. Please try again.',
      };
    }
  }

  /**
   * Add a new address for the authenticated customer
   * @summary Add new address
   * @param requestBody Address details
   */
  @Post()
  @Security('jwt')
  @SuccessResponse(201, 'Address added successfully')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Customer not found')
  @Response(500, 'Internal Server Error')
  public async customerAddAddress(
    @Body() requestBody: CustomerAddAddressRequest,
    @Request() request: any
  ): Promise<{
    status: 'success' | 'error';
    message: string;
    data?: CustomerAddressResponse;
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      // Validate required fields
      if (!requestBody.address1 || !requestBody.province || !requestBody.country) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Missing required fields: address1, province, country.',
        };
      }

      // Validate delivery instructions length
      if (requestBody.deliveryInstructions && requestBody.deliveryInstructions.length > 300) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Delivery instructions cannot exceed 300 characters',
        };
      }

      const customer = await Customer.findById(customerId);

      if (!customer) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Customer not found',
        };
      }

      // Determine if this should be the default address
      const shouldBeDefault = requestBody.isDefault === true || customer.addresses.length === 0;

      // If this address should be default, unset others
      if (shouldBeDefault && customer.addresses.length > 0) {
        customer.addresses.forEach((addr) => {
          addr.isDefault = false;
        });
      }

      // Create new address with generated _id
      const newAddress = {
        _id: new mongoose.Types.ObjectId(),
        label: requestBody.label,
        type: requestBody.type || 'both',
        firstName: requestBody.firstName,
        lastName: requestBody.lastName,
        phone: requestBody.phone,
        address1: requestBody.address1,
        address2: requestBody.address2,
        city: requestBody.city,
        province: requestBody.province,
        country: requestBody.country,
        countryCode: requestBody.countryCode,
        zip: requestBody.zip,
        deliveryInstructions: requestBody.deliveryInstructions,
        isDefault: shouldBeDefault,
      };

      customer.addresses.push(newAddress as any);
      await customer.save();

      this.setStatus(201);
      return {
        status: 'success',
        message: 'Address added successfully',
        data: {
          ...newAddress,
          _id: newAddress._id.toString(),
        },
      };
    } catch (error) {
      console.error('Add address error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to add address. Please try again.',
      };
    }
  }

  /**
   * Update an existing address by ID
   * @summary Update address
   * @param addressId MongoDB ObjectId of the address
   * @param requestBody Updated address details
   */
  @Patch('{addressId}')
  @Security('jwt')
  @SuccessResponse(200, 'Address updated successfully')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Address not found')
  @Response(500, 'Internal Server Error')
  public async customerUpdateAddress(
    @Path() addressId: string,
    @Body() requestBody: CustomerUpdateAddressRequest,
    @Request() request: any
  ): Promise<{
    status: 'success' | 'error';
    message: string;
    data?: CustomerAddressResponse;
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      if (!addressId) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Address ID is required.',
        };
      }

      // Validate delivery instructions length
      if (requestBody.deliveryInstructions && requestBody.deliveryInstructions.length > 300) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Delivery instructions cannot exceed 300 characters',
        };
      }

      const customer = await Customer.findById(customerId);

      if (!customer) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Customer not found',
        };
      }

      // Find address index
      const addressIndex = customer.addresses.findIndex(
        (addr: any) => addr._id?.toString() === addressId
      );

      if (addressIndex === -1) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Address not found',
        };
      }

      // If setting isDefault to true, unset others first
      if (requestBody.isDefault === true) {
        customer.addresses.forEach((addr) => {
          addr.isDefault = false;
        });
      }

      // Update only provided fields
      const address = customer.addresses[addressIndex];
      if (requestBody.label !== undefined) address.label = requestBody.label;
      if (requestBody.type !== undefined) address.type = requestBody.type;
      if (requestBody.firstName !== undefined) address.firstName = requestBody.firstName;
      if (requestBody.lastName !== undefined) address.lastName = requestBody.lastName;
      if (requestBody.phone !== undefined) address.phone = requestBody.phone;
      if (requestBody.address1 !== undefined) address.address1 = requestBody.address1;
      if (requestBody.address2 !== undefined) address.address2 = requestBody.address2;
      if (requestBody.city !== undefined) address.city = requestBody.city;
      if (requestBody.province !== undefined) address.province = requestBody.province;
      if (requestBody.country !== undefined) address.country = requestBody.country;
      if (requestBody.countryCode !== undefined) address.countryCode = requestBody.countryCode;
      if (requestBody.zip !== undefined) address.zip = requestBody.zip;
      if (requestBody.deliveryInstructions !== undefined) (address as any).deliveryInstructions = requestBody.deliveryInstructions;
      if (requestBody.isDefault !== undefined) address.isDefault = requestBody.isDefault;

      await customer.save();

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Address updated successfully',
        data: address as any,
      };
    } catch (error) {
      console.error('Update address error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to update address. Please try again.',
      };
    }
  }

  /**
   * Delete an address by ID
   * @summary Delete address
   * @param addressId MongoDB ObjectId of the address
   */
  @Delete('{addressId}')
  @Security('jwt')
  @SuccessResponse(200, 'Address deleted successfully')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Address not found')
  @Response(500, 'Internal Server Error')
  public async customerDeleteAddress(
    @Path() addressId: string,
    @Request() request: any
  ): Promise<{
    status: 'success' | 'error';
    message: string;
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      if (!addressId) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Address ID is required.',
        };
      }

      const customer = await Customer.findById(customerId);

      if (!customer) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Customer not found',
        };
      }

      // Find address index
      const addressIndex = customer.addresses.findIndex(
        (addr: any) => addr._id?.toString() === addressId
      );

      if (addressIndex === -1) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Address not found',
        };
      }

      // Check if deleted address was default
      const wasDefault = customer.addresses[addressIndex].isDefault;

      // Remove the address
      customer.addresses.splice(addressIndex, 1);

      // If deleted address was default and other addresses exist, make first one default
      if (wasDefault && customer.addresses.length > 0) {
        customer.addresses[0].isDefault = true;
      }

      await customer.save();

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Address deleted successfully',
      };
    } catch (error) {
      console.error('Delete address error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to delete address. Please try again.',
      };
    }
  }

  /**
   * Set an address as default
   * @summary Set default address
   * @param addressId MongoDB ObjectId of the address
   */
  @Patch('{addressId}/default')
  @Security('jwt')
  @SuccessResponse(200, 'Default address updated successfully')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Address not found')
  @Response(500, 'Internal Server Error')
  public async customerSetDefaultAddress(
    @Path() addressId: string,
    @Request() request: any
  ): Promise<{
    status: 'success' | 'error';
    message: string;
    data?: CustomerAddressResponse;
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      if (!addressId) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Address ID is required.',
        };
      }

      const customer = await Customer.findById(customerId);

      if (!customer) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Customer not found',
        };
      }

      // Find address index
      const addressIndex = customer.addresses.findIndex(
        (addr: any) => addr._id?.toString() === addressId
      );

      if (addressIndex === -1) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Address not found',
        };
      }

      // Set all addresses isDefault to false
      customer.addresses.forEach((addr) => {
        addr.isDefault = false;
      });

      // Set target address isDefault to true
      customer.addresses[addressIndex].isDefault = true;

      await customer.save();

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Default address updated successfully',
        data: customer.addresses[addressIndex] as any,
      };
    } catch (error) {
      console.error('Set default address error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to set default address. Please try again.',
      };
    }
  }

  /**
   * Get the default address for the authenticated customer
   * @summary Get default address
   */
  @Get('default')
  @Security('jwt')
  @SuccessResponse(200, 'Default address retrieved successfully')
  @Response(401, 'Unauthorized')
  @Response(404, 'No default address found')
  @Response(500, 'Internal Server Error')
  public async customerGetDefaultAddress(@Request() request: any): Promise<{
    status: 'success' | 'error';
    data?: {
      address: CustomerAddressResponse;
    };
    message?: string;
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      const customer = await Customer.findById(customerId).select('addresses');

      if (!customer) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Customer not found',
        };
      }

      const defaultAddress = customer.addresses.find((addr) => addr.isDefault === true);

      if (!defaultAddress) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'No default address found',
        };
      }

      this.setStatus(200);
      return {
        status: 'success',
        data: {
          address: defaultAddress as any,
        },
      };
    } catch (error) {
      console.error('Get default address error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to get default address. Please try again.',
      };
    }
  }
}
