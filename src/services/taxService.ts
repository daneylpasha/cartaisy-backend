/**
 * Tax Calculation Service
 *
 * Handles tax calculation for orders based on shipping address.
 * Uses US state tax rates for domestic orders.
 */

import {
  calculateStateTax,
  getTaxInfoByState,
  getTaxRateByState,
  TaxRate,
} from '../config/taxRates';

export interface TaxCalculationResult {
  taxAmount: number;
  taxRate: number;
  taxRatePercent: string;
  stateName: string;
  stateCode: string;
  isTaxable: boolean;
}

export interface ShippingAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string; // State code (e.g., 'CA')
  provinceCode?: string; // Alternative field name
  state?: string; // Alternative field name
  country?: string;
  countryCode?: string;
  zip?: string;
}

/**
 * Calculate tax for an order based on shipping address
 */
export const calculateTax = (
  subtotal: number,
  shippingAddress: ShippingAddress | null | undefined
): TaxCalculationResult => {
  // Default result for no tax
  const noTaxResult: TaxCalculationResult = {
    taxAmount: 0,
    taxRate: 0,
    taxRatePercent: '0%',
    stateName: '',
    stateCode: '',
    isTaxable: false,
  };

  if (!shippingAddress) {
    return noTaxResult;
  }

  // Get state code from various possible field names
  const stateCode =
    shippingAddress.provinceCode ||
    shippingAddress.province ||
    shippingAddress.state ||
    '';

  if (!stateCode) {
    return noTaxResult;
  }

  // Get country code
  const countryCode =
    shippingAddress.countryCode ||
    shippingAddress.country ||
    'US';

  // Only calculate US taxes for now
  if (countryCode.toUpperCase() !== 'US' && countryCode.toUpperCase() !== 'USA') {
    return noTaxResult;
  }

  // Get tax info for the state
  const taxInfo = getTaxInfoByState(stateCode);

  if (!taxInfo || taxInfo.rate === 0) {
    return {
      ...noTaxResult,
      stateCode: stateCode.toUpperCase(),
      stateName: taxInfo?.state || '',
    };
  }

  // Calculate tax
  const taxAmount = calculateStateTax(subtotal, stateCode);

  return {
    taxAmount,
    taxRate: taxInfo.rate,
    taxRatePercent: `${(taxInfo.rate * 100).toFixed(2)}%`,
    stateName: taxInfo.state,
    stateCode: stateCode.toUpperCase(),
    isTaxable: true,
  };
};

/**
 * Get tax rate for display purposes
 */
export const getTaxRateForState = (stateCode: string): string => {
  const rate = getTaxRateByState(stateCode);
  return `${(rate * 100).toFixed(2)}%`;
};

/**
 * Check if a state is taxable
 */
export const isStateTaxable = (stateCode: string): boolean => {
  const rate = getTaxRateByState(stateCode);
  return rate > 0;
};

/**
 * Get all taxable states
 */
export const getTaxableStates = (): TaxRate[] => {
  const { US_STATE_TAX_RATES } = require('../config/taxRates');
  return (Object.values(US_STATE_TAX_RATES) as TaxRate[]).filter(
    (state) => state.rate > 0
  );
};

export default {
  calculateTax,
  getTaxRateForState,
  isStateTaxable,
  getTaxableStates,
};
