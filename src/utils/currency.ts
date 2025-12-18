/**
 * Currency Utility
 *
 * Provides locale-aware currency formatting using Intl.NumberFormat.
 * Supports all ISO 4217 currency codes.
 */

/**
 * Currency code to locale mapping for optimal formatting.
 * Falls back to 'en-US' if currency is not mapped.
 */
const CURRENCY_LOCALE_MAP: Record<string, string> = {
  USD: 'en-US',
  CAD: 'en-CA',
  GBP: 'en-GB',
  EUR: 'de-DE', // Euro uses German locale for proper formatting
  AUD: 'en-AU',
  NZD: 'en-NZ',
  JPY: 'ja-JP',
  CNY: 'zh-CN',
  INR: 'en-IN',
  MXN: 'es-MX',
  BRL: 'pt-BR',
  CHF: 'de-CH',
  SEK: 'sv-SE',
  NOK: 'nb-NO',
  DKK: 'da-DK',
  PLN: 'pl-PL',
  CZK: 'cs-CZ',
  HUF: 'hu-HU',
  RUB: 'ru-RU',
  TRY: 'tr-TR',
  ZAR: 'en-ZA',
  SGD: 'en-SG',
  HKD: 'zh-HK',
  KRW: 'ko-KR',
  THB: 'th-TH',
  MYR: 'ms-MY',
  PHP: 'en-PH',
  IDR: 'id-ID',
  VND: 'vi-VN',
  AED: 'ar-AE',
  SAR: 'ar-SA',
  ILS: 'he-IL',
  TWD: 'zh-TW',
};

/**
 * Get the appropriate locale for a currency code.
 */
export function getLocaleForCurrency(currencyCode: string): string {
  return CURRENCY_LOCALE_MAP[currencyCode.toUpperCase()] || 'en-US';
}

/**
 * Format a price amount with the correct currency symbol and locale formatting.
 *
 * @param amount - The numeric amount to format
 * @param currencyCode - ISO 4217 currency code (e.g., 'USD', 'GBP', 'EUR')
 * @param locale - Optional locale override (defaults to currency's natural locale)
 * @returns Formatted price string (e.g., '$99.99', '£79.99', '€89,99')
 *
 * @example
 * formatPrice(99.99, 'USD') // '$99.99'
 * formatPrice(79.99, 'GBP') // '£79.99'
 * formatPrice(89.99, 'EUR') // '89,99 €'
 * formatPrice(1000, 'JPY')  // '¥1,000'
 */
export function formatPrice(
  amount: number | string,
  currencyCode: string,
  locale?: string
): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numericAmount)) {
    return `${currencyCode} 0.00`;
  }

  const resolvedLocale = locale || getLocaleForCurrency(currencyCode);

  try {
    return new Intl.NumberFormat(resolvedLocale, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: getCurrencyDecimals(currencyCode),
      maximumFractionDigits: getCurrencyDecimals(currencyCode),
    }).format(numericAmount);
  } catch {
    // Fallback for invalid currency codes
    return `${currencyCode} ${numericAmount.toFixed(2)}`;
  }
}

/**
 * Format a price without the currency symbol (just the number with locale formatting).
 *
 * @param amount - The numeric amount to format
 * @param currencyCode - ISO 4217 currency code for determining decimal places
 * @param locale - Optional locale override
 * @returns Formatted number string (e.g., '99.99', '1,000.00')
 */
export function formatPriceWithoutSymbol(
  amount: number | string,
  currencyCode: string,
  locale?: string
): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numericAmount)) {
    return '0.00';
  }

  const resolvedLocale = locale || getLocaleForCurrency(currencyCode);
  const decimals = getCurrencyDecimals(currencyCode);

  try {
    return new Intl.NumberFormat(resolvedLocale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numericAmount);
  } catch {
    return numericAmount.toFixed(decimals);
  }
}

/**
 * Get the number of decimal places for a currency.
 * Most currencies use 2, but some (like JPY, KRW) use 0.
 */
export function getCurrencyDecimals(currencyCode: string): number {
  const zeroDecimalCurrencies = [
    'JPY', // Japanese Yen
    'KRW', // Korean Won
    'VND', // Vietnamese Dong
    'IDR', // Indonesian Rupiah (often displayed without decimals)
    'CLP', // Chilean Peso
    'PYG', // Paraguayan Guarani
    'UGX', // Ugandan Shilling
    'RWF', // Rwandan Franc
    'GNF', // Guinean Franc
    'XOF', // West African CFA Franc
    'XAF', // Central African CFA Franc
  ];

  const threeDecimalCurrencies = [
    'BHD', // Bahraini Dinar
    'KWD', // Kuwaiti Dinar
    'OMR', // Omani Rial
    'JOD', // Jordanian Dinar
    'TND', // Tunisian Dinar
    'LYD', // Libyan Dinar
    'IQD', // Iraqi Dinar
  ];

  const upperCode = currencyCode.toUpperCase();

  if (zeroDecimalCurrencies.includes(upperCode)) {
    return 0;
  }

  if (threeDecimalCurrencies.includes(upperCode)) {
    return 3;
  }

  return 2;
}

/**
 * Get the currency symbol for a currency code.
 *
 * @param currencyCode - ISO 4217 currency code
 * @returns Currency symbol (e.g., '$', '£', '€', '¥')
 */
export function getCurrencySymbol(currencyCode: string): string {
  const locale = getLocaleForCurrency(currencyCode);

  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
    }).formatToParts(0);

    const symbolPart = parts.find((part) => part.type === 'currency');
    return symbolPart?.value || currencyCode;
  } catch {
    return currencyCode;
  }
}

/**
 * Parse a formatted price string back to a number.
 * Handles various locale formats.
 *
 * @param formattedPrice - The formatted price string
 * @returns The numeric value
 */
export function parsePriceString(formattedPrice: string): number {
  // Remove currency symbols and whitespace
  let cleaned = formattedPrice.replace(/[^\d.,\-]/g, '');

  // Handle European format (1.234,56) vs US format (1,234.56)
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // European format: comma is decimal separator
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // US format: dot is decimal separator
    cleaned = cleaned.replace(/,/g, '');
  }

  return parseFloat(cleaned) || 0;
}

/**
 * Convert an amount from one currency to another using a given exchange rate.
 * Note: This does not fetch live rates - you must provide the rate.
 *
 * @param amount - The amount to convert
 * @param exchangeRate - The exchange rate (target/source)
 * @returns The converted amount
 */
export function convertCurrency(amount: number, exchangeRate: number): number {
  return amount * exchangeRate;
}

/**
 * Country code to default currency mapping.
 * Used to determine customer's preferred currency from their country.
 */
export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  US: 'USD',
  CA: 'CAD',
  GB: 'GBP',
  UK: 'GBP', // Alias
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  IE: 'EUR',
  PT: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
  AU: 'AUD',
  NZ: 'NZD',
  JP: 'JPY',
  CN: 'CNY',
  IN: 'INR',
  MX: 'MXN',
  BR: 'BRL',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RU: 'RUB',
  TR: 'TRY',
  ZA: 'ZAR',
  SG: 'SGD',
  HK: 'HKD',
  KR: 'KRW',
  TH: 'THB',
  MY: 'MYR',
  PH: 'PHP',
  ID: 'IDR',
  VN: 'VND',
  AE: 'AED',
  SA: 'SAR',
  IL: 'ILS',
  TW: 'TWD',
};

/**
 * Get the default currency for a country code.
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns ISO 4217 currency code (defaults to 'USD' if not mapped)
 */
export function getCurrencyForCountry(countryCode: string): string {
  return COUNTRY_CURRENCY_MAP[countryCode.toUpperCase()] || 'USD';
}

/**
 * Validate if a string is a valid ISO 4217 currency code.
 */
export function isValidCurrencyCode(code: string): boolean {
  if (!code || typeof code !== 'string' || code.length !== 3) {
    return false;
  }

  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}
