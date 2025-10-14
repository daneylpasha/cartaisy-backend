import { Body, Controller, Delete, Get, Path, Post, Put, Request, Route, Security, Tags, Response } from 'tsoa';
import User from '../models/User';
import { IAddress } from '../types';

/**
 * Address Controller
 * Manages user addresses for checkout and delivery
 */
@Route('addresses')
@Tags('Addresses')
export class AddressController extends Controller {
  /**
   * Get all addresses for the authenticated user
   */
  @Get()
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async getAddresses(@Request() request: any): Promise<{
    success: boolean;
    data: {
      addresses: IAddress[];
      count: number;
    };
  }> {
    try {
      const userId = request.user._id;

      const user = await User.findById(userId).select('addresses');
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      return {
        success: true,
        data: {
          addresses: user.addresses || [],
          count: user.addresses?.length || 0,
        },
      };
    } catch (error) {
      console.error('Error fetching addresses:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  /**
   * Add a new address for the authenticated user
   * @param addressData - Address details
   */
  @Post()
  @Security('jwt')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async addAddress(
    @Body()
    addressData: {
      label?: string;
      type?: 'billing' | 'shipping' | 'both';
      firstName?: string;
      lastName?: string;
      company?: string;
      address1: string;
      address2?: string;
      city?: string;
      province: string;
      country: string;
      countryCode?: string;
      zip: string;
      phone?: string;
      deliveryInstructions?: string;
      isDefault?: boolean;
    },
    @Request() request: any
  ): Promise<{
    success: boolean;
    data: {
      address: IAddress;
      index: number;
    };
    message: string;
  }> {
    try {
      const userId = request.user._id;

      // Validate required fields
      if (!addressData.address1 || !addressData.province || !addressData.country || !addressData.zip) {
        this.setStatus(400);
        throw new Error('Missing required address fields: address1, province, country, zip');
      }

      // Validate delivery instructions length
      if (addressData.deliveryInstructions && addressData.deliveryInstructions.length > 300) {
        this.setStatus(400);
        throw new Error('Delivery instructions cannot exceed 300 characters');
      }

      const user = await User.findById(userId);
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      // Check address limit
      if (user.addresses.length >= 10) {
        this.setStatus(400);
        throw new Error('Maximum of 10 addresses allowed');
      }

      // If this is the first address or isDefault is true, make it default
      const isFirstAddress = user.addresses.length === 0;
      const shouldBeDefault = isFirstAddress || addressData.isDefault === true;

      // If setting as default, remove default from other addresses
      if (shouldBeDefault) {
        user.addresses.forEach((addr) => {
          if (addr) {
            addr.isDefault = false;
          }
        });
      }

      // Add the new address
      const newAddress: IAddress = {
        ...addressData,
        type: addressData.type || 'both',
        isDefault: shouldBeDefault,
      };

      user.addresses.push(newAddress);
      await user.save();

      const addedIndex = user.addresses.length - 1;

      return {
        success: true,
        data: {
          address: user.addresses[addedIndex] as IAddress,
          index: addedIndex,
        },
        message: 'Address added successfully',
      };
    } catch (error) {
      console.error('Error adding address:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  /**
   * Update an existing address by index
   * @param index - Index of the address in the addresses array
   * @param addressData - Updated address details
   */
  @Put('{index}')
  @Security('jwt')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Address not found')
  @Response(500, 'Internal Server Error')
  public async updateAddress(
    @Path() index: number,
    @Body()
    addressData: {
      label?: string;
      type?: 'billing' | 'shipping' | 'both';
      firstName?: string;
      lastName?: string;
      company?: string;
      address1?: string;
      address2?: string;
      city?: string;
      province?: string;
      country?: string;
      countryCode?: string;
      zip?: string;
      phone?: string;
      deliveryInstructions?: string;
    },
    @Request() request: any
  ): Promise<{
    success: boolean;
    data: {
      address: IAddress;
      index: number;
    };
    message: string;
  }> {
    try {
      const userId = request.user._id;

      // Validate delivery instructions length
      if (addressData.deliveryInstructions && addressData.deliveryInstructions.length > 300) {
        this.setStatus(400);
        throw new Error('Delivery instructions cannot exceed 300 characters');
      }

      const user = await User.findById(userId);
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      if (index < 0 || index >= user.addresses.length) {
        this.setStatus(404);
        throw new Error('Address not found');
      }

      const address = user.addresses[index];
      if (!address) {
        this.setStatus(404);
        throw new Error('Address not found');
      }

      // Update address fields
      Object.assign(address, addressData);

      await user.save();

      return {
        success: true,
        data: {
          address: user.addresses[index] as IAddress,
          index,
        },
        message: 'Address updated successfully',
      };
    } catch (error) {
      console.error('Error updating address:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  /**
   * Delete an address by index
   * @param index - Index of the address in the addresses array
   */
  @Delete('{index}')
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(404, 'Address not found')
  @Response(500, 'Internal Server Error')
  public async deleteAddress(
    @Path() index: number,
    @Request() request: any
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const userId = request.user._id;

      const user = await User.findById(userId);
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      if (index < 0 || index >= user.addresses.length) {
        this.setStatus(404);
        throw new Error('Address not found');
      }

      const addressToRemove = user.addresses[index];
      if (!addressToRemove) {
        this.setStatus(404);
        throw new Error('Address not found');
      }

      const wasDefault = addressToRemove.isDefault;
      user.addresses.splice(index, 1);

      // If the removed address was default and there are other addresses,
      // make the first one default
      if (wasDefault && user.addresses.length > 0 && user.addresses[0]) {
        user.addresses[0].isDefault = true;
      }

      await user.save();

      return {
        success: true,
        message: 'Address deleted successfully',
      };
    } catch (error) {
      console.error('Error deleting address:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  /**
   * Set an address as default by index
   * @param index - Index of the address in the addresses array
   */
  @Put('{index}/default')
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(404, 'Address not found')
  @Response(500, 'Internal Server Error')
  public async setDefaultAddress(
    @Path() index: number,
    @Request() request: any
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const userId = request.user._id;

      const user = await User.findById(userId);
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      if (index < 0 || index >= user.addresses.length) {
        this.setStatus(404);
        throw new Error('Address not found');
      }

      const targetAddress = user.addresses[index];
      if (!targetAddress) {
        this.setStatus(404);
        throw new Error('Address not found');
      }

      // Remove default from all addresses
      user.addresses.forEach((addr) => {
        if (addr) {
          addr.isDefault = false;
        }
      });

      // Set new default
      targetAddress.isDefault = true;

      await user.save();

      return {
        success: true,
        message: 'Default address updated successfully',
      };
    } catch (error) {
      console.error('Error setting default address:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  /**
   * Get the default address for the authenticated user
   */
  @Get('default')
  @Security('jwt')
  @Response(401, 'Unauthorized')
  @Response(404, 'No default address found')
  @Response(500, 'Internal Server Error')
  public async getDefaultAddress(@Request() request: any): Promise<{
    success: boolean;
    data: {
      address: IAddress;
      index: number;
    };
  }> {
    try {
      const userId = request.user._id;

      const user = await User.findById(userId).select('addresses');
      if (!user) {
        this.setStatus(404);
        throw new Error('User not found');
      }

      const defaultIndex = user.addresses.findIndex((addr) => addr.isDefault === true);

      if (defaultIndex === -1) {
        this.setStatus(404);
        throw new Error('No default address found');
      }

      return {
        success: true,
        data: {
          address: user.addresses[defaultIndex] as IAddress,
          index: defaultIndex,
        },
      };
    } catch (error) {
      console.error('Error fetching default address:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }
}
