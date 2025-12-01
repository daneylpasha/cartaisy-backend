import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Customer from '../models/Customer';

/**
 * Get all customer addresses
 * GET /api/v1/customer/addresses
 */
export const getAddresses = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;

    if (!customerId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    const customer = await Customer.findById(customerId).select('addresses');

    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      data: customer.addresses,
    });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get addresses. Please try again.',
    });
  }
};

/**
 * Add a new address
 * POST /api/v1/customer/addresses
 */
export const addAddress = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const {
      label,
      firstName,
      lastName,
      phone,
      address1,
      address2,
      city,
      province,
      zip,
      country,
      countryCode,
      type,
      isDefault,
    } = req.body;

    if (!customerId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    // Validate required fields
    if (!address1 || !province || !country) {
      res.status(400).json({
        status: 'error',
        message: 'Missing required fields: address1, province, country.',
      });
      return;
    }

    const customer = await Customer.findById(customerId);

    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
      return;
    }

    // Determine if this should be the default address
    const shouldBeDefault = isDefault === true || customer.addresses.length === 0;

    // If this address should be default, unset others
    if (shouldBeDefault && customer.addresses.length > 0) {
      customer.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    // Create new address with generated _id
    const newAddress = {
      _id: new mongoose.Types.ObjectId(),
      label,
      type: type || 'both',
      firstName,
      lastName,
      phone,
      address1,
      address2,
      city,
      province,
      country,
      countryCode,
      zip,
      isDefault: shouldBeDefault,
    };

    customer.addresses.push(newAddress as any);
    await customer.save();

    res.status(201).json({
      status: 'success',
      message: 'Address added successfully',
      data: newAddress,
    });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to add address. Please try again.',
    });
  }
};

/**
 * Update an existing address
 * PATCH /api/v1/customer/addresses/:addressId
 */
export const updateAddress = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { addressId } = req.params;
    const {
      label,
      type,
      firstName,
      lastName,
      phone,
      address1,
      address2,
      city,
      province,
      country,
      countryCode,
      zip,
      isDefault,
    } = req.body;

    if (!customerId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    if (!addressId) {
      res.status(400).json({
        status: 'error',
        message: 'Address ID is required.',
      });
      return;
    }

    const customer = await Customer.findById(customerId);

    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
      return;
    }

    // Find address index
    const addressIndex = customer.addresses.findIndex(
      (addr: any) => addr._id?.toString() === addressId
    );

    if (addressIndex === -1) {
      res.status(404).json({
        status: 'error',
        message: 'Address not found',
      });
      return;
    }

    // If setting isDefault to true, unset others first
    if (isDefault === true) {
      customer.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    // Update only provided fields
    const address = customer.addresses[addressIndex];
    if (label !== undefined) address.label = label;
    if (type !== undefined) address.type = type;
    if (firstName !== undefined) address.firstName = firstName;
    if (lastName !== undefined) address.lastName = lastName;
    if (phone !== undefined) address.phone = phone;
    if (address1 !== undefined) address.address1 = address1;
    if (address2 !== undefined) address.address2 = address2;
    if (city !== undefined) address.city = city;
    if (province !== undefined) address.province = province;
    if (country !== undefined) address.country = country;
    if (countryCode !== undefined) address.countryCode = countryCode;
    if (zip !== undefined) address.zip = zip;
    if (isDefault !== undefined) address.isDefault = isDefault;

    await customer.save();

    res.status(200).json({
      status: 'success',
      message: 'Address updated successfully',
      data: address,
    });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update address. Please try again.',
    });
  }
};

/**
 * Delete an address
 * DELETE /api/v1/customer/addresses/:addressId
 */
export const deleteAddress = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { addressId } = req.params;

    if (!customerId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    if (!addressId) {
      res.status(400).json({
        status: 'error',
        message: 'Address ID is required.',
      });
      return;
    }

    const customer = await Customer.findById(customerId);

    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
      return;
    }

    // Find address index
    const addressIndex = customer.addresses.findIndex(
      (addr: any) => addr._id?.toString() === addressId
    );

    if (addressIndex === -1) {
      res.status(404).json({
        status: 'error',
        message: 'Address not found',
      });
      return;
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

    res.status(200).json({
      status: 'success',
      message: 'Address deleted successfully',
    });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete address. Please try again.',
    });
  }
};

/**
 * Set an address as default
 * PATCH /api/v1/customer/addresses/:addressId/default
 */
export const setDefaultAddress = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { addressId } = req.params;

    if (!customerId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    if (!addressId) {
      res.status(400).json({
        status: 'error',
        message: 'Address ID is required.',
      });
      return;
    }

    const customer = await Customer.findById(customerId);

    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
      return;
    }

    // Find address index
    const addressIndex = customer.addresses.findIndex(
      (addr: any) => addr._id?.toString() === addressId
    );

    if (addressIndex === -1) {
      res.status(404).json({
        status: 'error',
        message: 'Address not found',
      });
      return;
    }

    // Set all addresses isDefault to false
    customer.addresses.forEach((addr) => {
      addr.isDefault = false;
    });

    // Set target address isDefault to true
    customer.addresses[addressIndex].isDefault = true;

    await customer.save();

    res.status(200).json({
      status: 'success',
      message: 'Default address updated successfully',
      data: customer.addresses[addressIndex],
    });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to set default address. Please try again.',
    });
  }
};
