/**
 * US State Sales Tax Rates Configuration
 *
 * These are base state tax rates. Note that actual tax rates may vary
 * by county/city. For production, consider using a tax service like
 * TaxJar or Avalara for accurate rates.
 *
 * Last updated: January 2026
 */

export interface TaxRate {
  state: string;
  stateCode: string;
  rate: number; // Decimal (e.g., 0.0725 for 7.25%)
  hasLocalTax: boolean;
}

// US State Tax Rates (base state rates only)
export const US_STATE_TAX_RATES: Record<string, TaxRate> = {
  // States with sales tax
  'AL': { state: 'Alabama', stateCode: 'AL', rate: 0.04, hasLocalTax: true },
  'AZ': { state: 'Arizona', stateCode: 'AZ', rate: 0.056, hasLocalTax: true },
  'AR': { state: 'Arkansas', stateCode: 'AR', rate: 0.065, hasLocalTax: true },
  'CA': { state: 'California', stateCode: 'CA', rate: 0.0725, hasLocalTax: true },
  'CO': { state: 'Colorado', stateCode: 'CO', rate: 0.029, hasLocalTax: true },
  'CT': { state: 'Connecticut', stateCode: 'CT', rate: 0.0635, hasLocalTax: false },
  'DC': { state: 'District of Columbia', stateCode: 'DC', rate: 0.06, hasLocalTax: false },
  'FL': { state: 'Florida', stateCode: 'FL', rate: 0.06, hasLocalTax: true },
  'GA': { state: 'Georgia', stateCode: 'GA', rate: 0.04, hasLocalTax: true },
  'HI': { state: 'Hawaii', stateCode: 'HI', rate: 0.04, hasLocalTax: true },
  'ID': { state: 'Idaho', stateCode: 'ID', rate: 0.06, hasLocalTax: true },
  'IL': { state: 'Illinois', stateCode: 'IL', rate: 0.0625, hasLocalTax: true },
  'IN': { state: 'Indiana', stateCode: 'IN', rate: 0.07, hasLocalTax: false },
  'IA': { state: 'Iowa', stateCode: 'IA', rate: 0.06, hasLocalTax: true },
  'KS': { state: 'Kansas', stateCode: 'KS', rate: 0.065, hasLocalTax: true },
  'KY': { state: 'Kentucky', stateCode: 'KY', rate: 0.06, hasLocalTax: false },
  'LA': { state: 'Louisiana', stateCode: 'LA', rate: 0.0445, hasLocalTax: true },
  'ME': { state: 'Maine', stateCode: 'ME', rate: 0.055, hasLocalTax: false },
  'MD': { state: 'Maryland', stateCode: 'MD', rate: 0.06, hasLocalTax: false },
  'MA': { state: 'Massachusetts', stateCode: 'MA', rate: 0.0625, hasLocalTax: false },
  'MI': { state: 'Michigan', stateCode: 'MI', rate: 0.06, hasLocalTax: false },
  'MN': { state: 'Minnesota', stateCode: 'MN', rate: 0.06875, hasLocalTax: true },
  'MS': { state: 'Mississippi', stateCode: 'MS', rate: 0.07, hasLocalTax: false },
  'MO': { state: 'Missouri', stateCode: 'MO', rate: 0.04225, hasLocalTax: true },
  'NE': { state: 'Nebraska', stateCode: 'NE', rate: 0.055, hasLocalTax: true },
  'NV': { state: 'Nevada', stateCode: 'NV', rate: 0.0685, hasLocalTax: true },
  'NJ': { state: 'New Jersey', stateCode: 'NJ', rate: 0.06625, hasLocalTax: false },
  'NM': { state: 'New Mexico', stateCode: 'NM', rate: 0.05125, hasLocalTax: true },
  'NY': { state: 'New York', stateCode: 'NY', rate: 0.04, hasLocalTax: true },
  'NC': { state: 'North Carolina', stateCode: 'NC', rate: 0.0475, hasLocalTax: true },
  'ND': { state: 'North Dakota', stateCode: 'ND', rate: 0.05, hasLocalTax: true },
  'OH': { state: 'Ohio', stateCode: 'OH', rate: 0.0575, hasLocalTax: true },
  'OK': { state: 'Oklahoma', stateCode: 'OK', rate: 0.045, hasLocalTax: true },
  'PA': { state: 'Pennsylvania', stateCode: 'PA', rate: 0.06, hasLocalTax: true },
  'RI': { state: 'Rhode Island', stateCode: 'RI', rate: 0.07, hasLocalTax: false },
  'SC': { state: 'South Carolina', stateCode: 'SC', rate: 0.06, hasLocalTax: true },
  'SD': { state: 'South Dakota', stateCode: 'SD', rate: 0.045, hasLocalTax: true },
  'TN': { state: 'Tennessee', stateCode: 'TN', rate: 0.07, hasLocalTax: true },
  'TX': { state: 'Texas', stateCode: 'TX', rate: 0.0625, hasLocalTax: true },
  'UT': { state: 'Utah', stateCode: 'UT', rate: 0.0485, hasLocalTax: true },
  'VT': { state: 'Vermont', stateCode: 'VT', rate: 0.06, hasLocalTax: true },
  'VA': { state: 'Virginia', stateCode: 'VA', rate: 0.053, hasLocalTax: true },
  'WA': { state: 'Washington', stateCode: 'WA', rate: 0.065, hasLocalTax: true },
  'WV': { state: 'West Virginia', stateCode: 'WV', rate: 0.06, hasLocalTax: true },
  'WI': { state: 'Wisconsin', stateCode: 'WI', rate: 0.05, hasLocalTax: true },
  'WY': { state: 'Wyoming', stateCode: 'WY', rate: 0.04, hasLocalTax: true },

  // States with NO sales tax
  'AK': { state: 'Alaska', stateCode: 'AK', rate: 0, hasLocalTax: true }, // No state tax but has local taxes
  'DE': { state: 'Delaware', stateCode: 'DE', rate: 0, hasLocalTax: false },
  'MT': { state: 'Montana', stateCode: 'MT', rate: 0, hasLocalTax: false },
  'NH': { state: 'New Hampshire', stateCode: 'NH', rate: 0, hasLocalTax: false },
  'OR': { state: 'Oregon', stateCode: 'OR', rate: 0, hasLocalTax: false },
};

// Default tax rate if state not found (0%)
export const DEFAULT_TAX_RATE = 0;

/**
 * Get tax rate for a US state
 */
export const getTaxRateByState = (stateCode: string): number => {
  const upperStateCode = stateCode?.toUpperCase();
  return US_STATE_TAX_RATES[upperStateCode]?.rate ?? DEFAULT_TAX_RATE;
};

/**
 * Get tax info for a US state
 */
export const getTaxInfoByState = (stateCode: string): TaxRate | null => {
  const upperStateCode = stateCode?.toUpperCase();
  return US_STATE_TAX_RATES[upperStateCode] ?? null;
};

/**
 * Calculate tax amount for a given subtotal and state
 */
export const calculateStateTax = (subtotal: number, stateCode: string): number => {
  const rate = getTaxRateByState(stateCode);
  const tax = subtotal * rate;
  // Round to 2 decimal places
  return Math.round(tax * 100) / 100;
};

export default US_STATE_TAX_RATES;
