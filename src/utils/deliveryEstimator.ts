/**
 * Utility functions for parsing and formatting delivery estimates
 */

/**
 * Parse Shopify delivery description and format it properly
 *
 * Examples:
 * - "Arrives Jan 25-27" → "Jan 25-27, 2025"
 * - "5-7 business days" → "5-7 business days"
 * - "Standard Shipping" → Calculate from title
 *
 * @param description - Shopify delivery description
 * @param shippingTitle - Shipping rate title (fallback)
 * @returns Formatted delivery estimate
 */
export function parseDeliveryEstimate(description?: string, shippingTitle?: string): string {
  // If no description, try to extract from title
  if (!description || description.trim() === '') {
    return extractFromTitle(shippingTitle);
  }

  // Check if description contains "Arrives" with date range
  const arrivesMatch = description.match(/Arrives\s+([A-Za-z]+\s+\d+)-(\d+)/i);
  if (arrivesMatch) {
    const month = arrivesMatch[1];
    const endDay = arrivesMatch[2];
    const currentYear = new Date().getFullYear();
    return `${month}-${endDay}, ${currentYear}`;
  }

  // Check if description contains "Arrives" with single date
  const arrivesSingleMatch = description.match(/Arrives\s+([A-Za-z]+\s+\d+)/i);
  if (arrivesSingleMatch) {
    const date = arrivesSingleMatch[1];
    const currentYear = new Date().getFullYear();
    return `${date}, ${currentYear}`;
  }

  // Check for "X-Y business days" format
  const businessDaysMatch = description.match(/(\d+)-(\d+)\s+business\s+days/i);
  if (businessDaysMatch) {
    const minDays = parseInt(businessDaysMatch[1]);
    const maxDays = parseInt(businessDaysMatch[2]);
    return calculateDeliveryDateRange(minDays, maxDays);
  }

  // Check for "X business days" format
  const singleBusinessDayMatch = description.match(/(\d+)\s+business\s+days?/i);
  if (singleBusinessDayMatch) {
    const days = parseInt(singleBusinessDayMatch[1]);
    return calculateDeliveryDate(days);
  }

  // If nothing matches, return as-is
  return description;
}

/**
 * Extract delivery estimate from shipping title
 *
 * Examples:
 * - "Standard (5-7 business days)" → "Delivers by Feb 1, 2025"
 * - "Express (2-3 days)" → "Delivers by Jan 27, 2025"
 *
 * @param title - Shipping rate title
 * @returns Formatted delivery estimate
 */
function extractFromTitle(title?: string): string {
  if (!title) {
    return 'Estimated delivery not available';
  }

  // Match patterns like "5-7 business days" or "5-7 days"
  const rangeMatch = title.match(/(\d+)-(\d+)\s+(business\s+)?days?/i);
  if (rangeMatch) {
    const minDays = parseInt(rangeMatch[1]);
    const maxDays = parseInt(rangeMatch[2]);
    return calculateDeliveryDateRange(minDays, maxDays);
  }

  // Match single day pattern like "2 business days"
  const singleMatch = title.match(/(\d+)\s+(business\s+)?days?/i);
  if (singleMatch) {
    const days = parseInt(singleMatch[1]);
    return calculateDeliveryDate(days);
  }

  // Default based on shipping method name
  if (title.toLowerCase().includes('express') || title.toLowerCase().includes('expedited')) {
    return calculateDeliveryDateRange(2, 3);
  }

  if (title.toLowerCase().includes('overnight') || title.toLowerCase().includes('next day')) {
    return calculateDeliveryDate(1);
  }

  if (title.toLowerCase().includes('standard')) {
    return calculateDeliveryDateRange(5, 7);
  }

  return 'Estimated delivery not available';
}

/**
 * Calculate delivery date by adding business days to current date
 *
 * @param days - Number of business days
 * @returns Formatted date string
 */
function calculateDeliveryDate(days: number): string {
  const deliveryDate = addBusinessDays(new Date(), days);
  return `Delivers by ${formatDate(deliveryDate)}`;
}

/**
 * Calculate delivery date range by adding business days to current date
 *
 * @param minDays - Minimum business days
 * @param maxDays - Maximum business days
 * @returns Formatted date range string
 */
function calculateDeliveryDateRange(minDays: number, maxDays: number): string {
  const startDate = addBusinessDays(new Date(), minDays);
  const endDate = addBusinessDays(new Date(), maxDays);

  // If same month, show as "Jan 25-27"
  if (startDate.getMonth() === endDate.getMonth()) {
    const month = formatMonth(startDate);
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    const year = startDate.getFullYear();
    return `${month} ${startDay}-${endDay}, ${year}`;
  }

  // Different months, show full range
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

/**
 * Add business days to a date (excluding weekends)
 *
 * @param date - Starting date
 * @param days - Number of business days to add
 * @returns New date
 */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let addedDays = 0;

  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      addedDays++;
    }
  }

  return result;
}

/**
 * Format date as "Jan 25, 2025"
 *
 * @param date - Date to format
 * @returns Formatted string
 */
function formatDate(date: Date): string {
  const month = formatMonth(date);
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

/**
 * Get short month name (Jan, Feb, etc.)
 *
 * @param date - Date
 * @returns Short month name
 */
function formatMonth(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[date.getMonth()];
}

/**
 * Get human-readable delivery timeframe
 *
 * @param description - Delivery description
 * @param title - Shipping title
 * @returns Human-readable string like "5-7 business days"
 */
export function getDeliveryTimeframe(description?: string, title?: string): string {
  if (description && description.includes('business days')) {
    return description;
  }

  if (title) {
    const match = title.match(/(\d+)-(\d+)\s+(business\s+)?days?/i);
    if (match) {
      return `${match[1]}-${match[2]} business days`;
    }

    const singleMatch = title.match(/(\d+)\s+(business\s+)?days?/i);
    if (singleMatch) {
      return `${singleMatch[1]} business days`;
    }
  }

  return '5-7 business days';
}
