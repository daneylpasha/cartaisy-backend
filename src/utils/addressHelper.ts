/**
 * Address Helper Utilities
 * Converts full country/state names to ISO codes for Shopify API compatibility
 */

/**
 * Country name to ISO 2-letter code mapping
 */
const COUNTRY_CODES: Record<string, string> = {
  // North America
  'united states': 'US',
  'usa': 'US',
  'us': 'US',
  'canada': 'CA',
  'mexico': 'MX',

  // Europe
  'united kingdom': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
  'germany': 'DE',
  'france': 'FR',
  'italy': 'IT',
  'spain': 'ES',
  'netherlands': 'NL',
  'belgium': 'BE',
  'austria': 'AT',
  'switzerland': 'CH',
  'poland': 'PL',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'ireland': 'IE',
  'portugal': 'PT',
  'greece': 'GR',
  'czech republic': 'CZ',
  'hungary': 'HU',
  'romania': 'RO',

  // Asia Pacific
  'australia': 'AU',
  'new zealand': 'NZ',
  'japan': 'JP',
  'china': 'CN',
  'india': 'IN',
  'singapore': 'SG',
  'hong kong': 'HK',
  'south korea': 'KR',
  'taiwan': 'TW',
  'thailand': 'TH',
  'malaysia': 'MY',
  'indonesia': 'ID',
  'philippines': 'PH',
  'vietnam': 'VN',

  // Middle East
  'united arab emirates': 'AE',
  'uae': 'AE',
  'saudi arabia': 'SA',
  'israel': 'IL',
  'turkey': 'TR',

  // South America
  'brazil': 'BR',
  'argentina': 'AR',
  'chile': 'CL',
  'colombia': 'CO',
  'peru': 'PE',
};

/**
 * US State/Territory name to ISO 2-letter code mapping
 */
const US_STATE_CODES: Record<string, string> = {
  'alabama': 'AL',
  'alaska': 'AK',
  'arizona': 'AZ',
  'arkansas': 'AR',
  'california': 'CA',
  'colorado': 'CO',
  'connecticut': 'CT',
  'delaware': 'DE',
  'florida': 'FL',
  'georgia': 'GA',
  'hawaii': 'HI',
  'idaho': 'ID',
  'illinois': 'IL',
  'indiana': 'IN',
  'iowa': 'IA',
  'kansas': 'KS',
  'kentucky': 'KY',
  'louisiana': 'LA',
  'maine': 'ME',
  'maryland': 'MD',
  'massachusetts': 'MA',
  'michigan': 'MI',
  'minnesota': 'MN',
  'mississippi': 'MS',
  'missouri': 'MO',
  'montana': 'MT',
  'nebraska': 'NE',
  'nevada': 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  'ohio': 'OH',
  'oklahoma': 'OK',
  'oregon': 'OR',
  'pennsylvania': 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  'tennessee': 'TN',
  'texas': 'TX',
  'utah': 'UT',
  'vermont': 'VT',
  'virginia': 'VA',
  'washington': 'WA',
  'west virginia': 'WV',
  'wisconsin': 'WI',
  'wyoming': 'WY',
  'district of columbia': 'DC',
  'puerto rico': 'PR',
  'guam': 'GU',
  'virgin islands': 'VI',
  'american samoa': 'AS',
};

/**
 * Canadian Province/Territory name to ISO 2-letter code mapping
 */
const CANADA_PROVINCE_CODES: Record<string, string> = {
  'alberta': 'AB',
  'british columbia': 'BC',
  'manitoba': 'MB',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  'northwest territories': 'NT',
  'nova scotia': 'NS',
  'nunavut': 'NU',
  'ontario': 'ON',
  'prince edward island': 'PE',
  'quebec': 'QC',
  'saskatchewan': 'SK',
  'yukon': 'YT',
};

/**
 * Australian State/Territory name to ISO 2-letter code mapping
 */
const AUSTRALIA_STATE_CODES: Record<string, string> = {
  'new south wales': 'NSW',
  'victoria': 'VIC',
  'queensland': 'QLD',
  'south australia': 'SA',
  'western australia': 'WA',
  'tasmania': 'TAS',
  'northern territory': 'NT',
  'australian capital territory': 'ACT',
};

/**
 * Convert country name to ISO 2-letter code
 * @param country - Country name or code
 * @returns ISO 2-letter country code
 */
export function getCountryCode(country: string): string {
  if (!country) return '';

  const normalized = country.trim().toLowerCase();

  // Already a 2-letter code
  if (/^[A-Z]{2}$/i.test(country.trim())) {
    return country.trim().toUpperCase();
  }

  // Look up in mapping
  return COUNTRY_CODES[normalized] || country.trim().toUpperCase().substring(0, 2);
}

/**
 * Convert province/state name to ISO code based on country
 * @param province - Province/state name or code
 * @param countryCode - ISO 2-letter country code (e.g., "US", "CA", "AU")
 * @returns ISO province/state code
 */
export function getProvinceCode(province: string, countryCode: string): string {
  if (!province) return '';

  const normalized = province.trim().toLowerCase();
  const country = countryCode.trim().toUpperCase();

  // Already a valid code (2-3 letters)
  if (/^[A-Z]{2,3}$/i.test(province.trim())) {
    return province.trim().toUpperCase();
  }

  // Select appropriate mapping based on country
  let mapping: Record<string, string> = {};

  switch (country) {
    case 'US':
      mapping = US_STATE_CODES;
      break;
    case 'CA':
      mapping = CANADA_PROVINCE_CODES;
      break;
    case 'AU':
      mapping = AUSTRALIA_STATE_CODES;
      break;
    default:
      // For other countries, return first 2 letters uppercase
      return province.trim().toUpperCase().substring(0, 2);
  }

  return mapping[normalized] || province.trim().toUpperCase().substring(0, 2);
}

/**
 * Normalize address for Shopify API
 * Converts full names to ISO codes
 * @param address - Address object with country and province
 * @returns Normalized address with ISO codes
 */
export function normalizeAddressForShopify(address: {
  country: string;
  countryCode?: string;
  province: string;
  provinceCode?: string;
  [key: string]: any;
}): {
  countryCode: string;
  provinceCode: string;
  [key: string]: any;
} {
  // Get country code (prefer existing countryCode, fallback to conversion)
  const countryCode = address.countryCode
    ? address.countryCode.trim().toUpperCase()
    : getCountryCode(address.country);

  // Get province code (prefer existing provinceCode, fallback to conversion)
  const provinceCode = address.provinceCode
    ? address.provinceCode.trim().toUpperCase()
    : getProvinceCode(address.province, countryCode);

  return {
    ...address,
    countryCode,
    provinceCode,
  };
}
