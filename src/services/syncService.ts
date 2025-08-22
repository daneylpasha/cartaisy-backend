import mongoose from 'mongoose';
import { syncProducts, syncCustomers, syncOrders } from './shopifyService';
import Product from '../models/Product';
import User from '../models/User';
import Order from '../models/Order';
import { ApiError } from '../utils/errors';

// Sync status tracking
interface ISyncStatus {
  lastFullSync?: Date;
  lastIncrementalSync?: Date;
  inProgress: boolean;
  errors: string[];
  stats: {
    productsSync: number;
    customersSync: number;
    ordersSync: number;
  };
}

let syncStatus: ISyncStatus = {
  inProgress: false,
  errors: [],
  stats: {
    productsSync: 0,
    customersSync: 0,
    ordersSync: 0
  }
};

/**
 * Perform complete data synchronization (products, customers, orders)
 */
export const performFullSync = async (): Promise<ISyncStatus> => {
  if (syncStatus.inProgress) {
    throw new Error('Sync already in progress');
  }

  console.log('🔄 Starting full data synchronization...');
  syncStatus.inProgress = true;
  syncStatus.errors = [];
  
  const startTime = Date.now();

  try {
    // Step 1: Sync Products
    console.log('📦 Syncing products...');
    const productResult = await syncProducts();
    syncStatus.stats.productsSync = productResult.synced;
    syncStatus.errors.push(...productResult.errors);

    // Step 2: Sync Customers
    console.log('👥 Syncing customers...');
    const customerResult = await syncCustomers();
    syncStatus.stats.customersSync = customerResult.synced;
    syncStatus.errors.push(...customerResult.errors);

    // Step 3: Sync Orders (last 90 days)
    console.log('📋 Syncing orders...');
    const orderResult = await syncOrders(90);
    syncStatus.stats.ordersSync = orderResult.synced;
    syncStatus.errors.push(...orderResult.errors);

    // Step 4: Validate sync integrity
    console.log('🔍 Validating sync integrity...');
    await validateSyncIntegrity();

    syncStatus.lastFullSync = new Date();
    syncStatus.inProgress = false;

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ Full sync completed in ${duration}s`);
    console.log(`📊 Stats: ${syncStatus.stats.productsSync} products, ${syncStatus.stats.customersSync} customers, ${syncStatus.stats.ordersSync} orders`);
    
    if (syncStatus.errors.length > 0) {
      console.warn(`⚠️ ${syncStatus.errors.length} errors occurred during sync`);
    }

    return { ...syncStatus };
  } catch (error) {
    syncStatus.inProgress = false;
    syncStatus.errors.push(`Full sync failed: ${error}`);
    console.error('❌ Full sync failed:', error);
    throw error;
  }
};

/**
 * Perform incremental sync - only recent changes since last sync
 */
export const performIncrementalSync = async (): Promise<ISyncStatus> => {
  if (syncStatus.inProgress) {
    throw new Error('Sync already in progress');
  }

  console.log('🔄 Starting incremental synchronization...');
  syncStatus.inProgress = true;
  
  const startTime = Date.now();
  const incrementalErrors: string[] = [];

  try {
    const lastSync = syncStatus.lastIncrementalSync || syncStatus.lastFullSync;
    const daysSinceLastSync = lastSync ? 
      Math.ceil((Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24)) : 7;

    // Sync recent orders only
    console.log(`📋 Syncing orders from last ${daysSinceLastSync} days...`);
    const orderResult = await syncOrders(daysSinceLastSync);
    incrementalErrors.push(...orderResult.errors);

    // For products and customers, we'll do a more targeted sync
    // This would typically involve using Shopify's updated_at_min parameter
    // For now, we'll skip full product/customer sync in incremental mode

    syncStatus.lastIncrementalSync = new Date();
    syncStatus.inProgress = false;
    syncStatus.errors = incrementalErrors;

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ Incremental sync completed in ${duration}s`);
    console.log(`📊 Stats: ${orderResult.synced} orders`);

    return { ...syncStatus };
  } catch (error) {
    syncStatus.inProgress = false;
    incrementalErrors.push(`Incremental sync failed: ${error}`);
    syncStatus.errors = incrementalErrors;
    console.error('❌ Incremental sync failed:', error);
    throw error;
  }
};

/**
 * Merge Shopify product data with our enhanced features
 */
export const syncProductData = async (shopifyProduct: any, existingProduct?: any): Promise<any> => {
  const mergedData = {
    // Core Shopify data
    shopifyProductId: shopifyProduct.id?.toString(),
    title: shopifyProduct.title,
    description: shopifyProduct.body_html || '',
    handle: shopifyProduct.handle,
    vendor: shopifyProduct.vendor || 'Unknown',
    productType: shopifyProduct.product_type || 'General',
    tags: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((tag: string) => tag.trim()) : [],
    status: shopifyProduct.status === 'active' ? 'active' as const : 'draft' as const,
    
    // Pricing from variants
    price: shopifyProduct.variants?.[0] ? parseFloat(shopifyProduct.variants[0].price) : 0,
    compareAtPrice: shopifyProduct.variants?.[0]?.compare_at_price ? 
      parseFloat(shopifyProduct.variants[0].compare_at_price) : undefined,
    
    // Images
    images: shopifyProduct.images?.map((img: any, index: number) => ({
      url: img.src,
      alt: img.alt || shopifyProduct.title,
      position: img.position || index + 1,
      width: img.width,
      height: img.height
    })) || [],
    
    // Enhanced features (preserve existing or create new)
    mobileDisplay: existingProduct?.mobileDisplay || {
      thumbnailUrl: shopifyProduct.images?.[0]?.src || '',
      priority: 1,
      isFeatured: false,
      shortDescription: shopifyProduct.body_html ? 
        shopifyProduct.body_html.replace(/<[^>]*>/g, '').substring(0, 100) + '...' : ''
    },
    
    // Analytics (preserve existing)
    analytics: existingProduct?.analytics || {
      viewCount: 0,
      favoriteCount: 0,
      conversionRate: 0,
      averageTimeOnPage: 0,
      conversionEvents: [],
      lastViewedAt: new Date()
    },
    
    // Reviews (preserve existing)
    reviews: existingProduct?.reviews || {
      count: 0,
      averageRating: 0,
      totalRating: 0
    },
    
    // SEO enhancements
    seo: {
      title: shopifyProduct.title,
      description: existingProduct?.seo?.description || 
        (shopifyProduct.body_html ? 
          shopifyProduct.body_html.replace(/<[^>]*>/g, '').substring(0, 160) : ''),
      keywords: shopifyProduct.tags ? shopifyProduct.tags.split(',').map((tag: string) => tag.trim()) : [],
      slug: shopifyProduct.handle
    },
    
    // Inventory tracking
    inventoryTracking: {
      totalQuantity: shopifyProduct.variants?.reduce((total: number, variant: any) => 
        total + (variant.inventory_quantity || 0), 0) || 0,
      tracked: shopifyProduct.variants?.some((variant: any) => 
        variant.inventory_management === 'shopify') || false,
      lowStockThreshold: existingProduct?.inventoryTracking?.lowStockThreshold || 5,
      history: existingProduct?.inventoryTracking?.history || []
    },
    
    // Variants
    variants: shopifyProduct.variants?.map((variant: any) => ({
      id: variant.id.toString(),
      title: variant.title,
      price: parseFloat(variant.price),
      compareAtPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : undefined,
      sku: variant.sku,
      inventory: {
        quantity: variant.inventory_quantity || 0,
        policy: variant.inventory_policy,
        tracked: variant.inventory_management === 'shopify'
      },
      weight: variant.weight,
      weightUnit: variant.weight_unit || 'kg',
      options: {
        option1: variant.option1,
        option2: variant.option2,
        option3: variant.option3
      }
    })) || []
  };

  return mergedData;
};

/**
 * Merge Shopify customer data with our enhanced user features
 */
export const syncCustomerData = async (shopifyCustomer: any, existingUser?: any): Promise<any> => {
  const mergedData = {
    // Core Shopify data
    shopifyCustomerId: shopifyCustomer.id?.toString(),
    name: `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim(),
    email: shopifyCustomer.email,
    phone: shopifyCustomer.phone,
    isVerified: shopifyCustomer.verified_email || false,
    
    // Addresses
    addresses: shopifyCustomer.addresses?.map((addr: any) => ({
      type: addr.default ? 'shipping' as const : 'billing' as const,
      firstName: addr.first_name,
      lastName: addr.last_name,
      company: addr.company,
      address1: addr.address1,
      address2: addr.address2,
      city: addr.city,
      province: addr.province,
      country: addr.country,
      zip: addr.zip,
      phone: addr.phone,
      isDefault: addr.default || false
    })) || [],
    
    // Preserve enhanced features
    role: existingUser?.role || 'customer',
    isActive: existingUser?.isActive !== undefined ? existingUser.isActive : true,
    
    preferences: existingUser?.preferences || {
      notifications: { email: true, push: true, sms: false },
      currency: 'USD',
      language: 'en',
      wishlistItemsCount: 0
    },
    
    // Profile data (preserve existing)
    profile: existingUser?.profile || {
      avatar: '',
      dateOfBirth: null,
      gender: null,
      interests: []
    },
    
    // Marketing (preserve existing or set from Shopify)
    marketing: {
      acceptsMarketing: shopifyCustomer.accepts_marketing || false,
      marketingOptInLevel: shopifyCustomer.marketing_opt_in_level || 'unknown',
      emailMarketingConsent: existingUser?.marketing?.emailMarketingConsent || {
        state: shopifyCustomer.email_marketing_consent?.state || 'not_subscribed',
        optInLevel: shopifyCustomer.email_marketing_consent?.opt_in_level || 'unknown',
        consentUpdatedAt: shopifyCustomer.email_marketing_consent?.consent_updated_at ? 
          new Date(shopifyCustomer.email_marketing_consent.consent_updated_at) : new Date()
      }
    }
  };

  return mergedData;
};

/**
 * Resolve data inconsistencies between local and Shopify data
 */
export const handleDataConflicts = (localData: any, shopifyData: any, type: 'product' | 'customer' | 'order'): any => {
  const conflicts: any[] = [];
  const resolution: any = { ...localData };

  switch (type) {
    case 'product':
      // Price conflicts
      if (localData.price !== shopifyData.price) {
        conflicts.push({
          field: 'price',
          local: localData.price,
          shopify: shopifyData.price,
          resolution: 'use_shopify'
        });
        resolution.price = shopifyData.price;
      }

      // Inventory conflicts
      if (localData.inventoryTracking?.totalQuantity !== shopifyData.inventoryTracking?.totalQuantity) {
        conflicts.push({
          field: 'inventory',
          local: localData.inventoryTracking?.totalQuantity,
          shopify: shopifyData.inventoryTracking?.totalQuantity,
          resolution: 'use_shopify'
        });
        resolution.inventoryTracking.totalQuantity = shopifyData.inventoryTracking.totalQuantity;
      }

      // Status conflicts
      if (localData.status !== shopifyData.status) {
        conflicts.push({
          field: 'status',
          local: localData.status,
          shopify: shopifyData.status,
          resolution: 'use_shopify'
        });
        resolution.status = shopifyData.status;
      }
      break;

    case 'customer':
      // Email verification conflicts
      if (localData.isVerified !== shopifyData.isVerified) {
        conflicts.push({
          field: 'isVerified',
          local: localData.isVerified,
          shopify: shopifyData.isVerified,
          resolution: 'use_shopify'
        });
        resolution.isVerified = shopifyData.isVerified;
      }

      // Phone number conflicts
      if (localData.phone !== shopifyData.phone && shopifyData.phone) {
        conflicts.push({
          field: 'phone',
          local: localData.phone,
          shopify: shopifyData.phone,
          resolution: 'use_shopify'
        });
        resolution.phone = shopifyData.phone;
      }
      break;

    case 'order':
      // Financial status conflicts
      if (localData.financialStatus !== shopifyData.financialStatus) {
        conflicts.push({
          field: 'financialStatus',
          local: localData.financialStatus,
          shopify: shopifyData.financialStatus,
          resolution: 'use_shopify'
        });
        resolution.financialStatus = shopifyData.financialStatus;
      }

      // Fulfillment status conflicts
      if (localData.fulfillmentStatus !== shopifyData.fulfillmentStatus) {
        conflicts.push({
          field: 'fulfillmentStatus',
          local: localData.fulfillmentStatus,
          shopify: shopifyData.fulfillmentStatus,
          resolution: 'use_shopify'
        });
        resolution.fulfillmentStatus = shopifyData.fulfillmentStatus;
      }
      break;
  }

  if (conflicts.length > 0) {
    console.log(`⚠️ Resolved ${conflicts.length} conflicts for ${type}:`, conflicts);
  }

  return { resolved: resolution, conflicts };
};

/**
 * Validate data consistency between our system and Shopify
 */
export const validateSyncIntegrity = async (): Promise<{ issues: any[]; valid: boolean }> => {
  const issues: any[] = [];

  try {
    // Check for products without Shopify IDs
    const orphanedProducts = await Product.countDocuments({ 
      shopifyProductId: { $exists: false } 
    });
    
    if (orphanedProducts > 0) {
      issues.push({
        type: 'orphaned_products',
        count: orphanedProducts,
        description: 'Products in local database without Shopify IDs'
      });
    }

    // Check for users without Shopify customer IDs (normal for app-only users)
    const localOnlyUsers = await User.countDocuments({ 
      shopifyCustomerId: { $exists: false },
      role: 'customer'
    });
    
    if (localOnlyUsers > 0) {
      issues.push({
        type: 'local_only_users',
        count: localOnlyUsers,
        description: 'Users registered only in mobile app (not in Shopify)'
      });
    }

    // Check for orders without Shopify order IDs (mobile-only orders)
    const mobileOnlyOrders = await Order.countDocuments({ 
      shopifyOrderId: { $exists: false } 
    });
    
    if (mobileOnlyOrders > 0) {
      issues.push({
        type: 'mobile_only_orders',
        count: mobileOnlyOrders,
        description: 'Orders created in mobile app not yet synced to Shopify'
      });
    }

    // Check for recent product updates that might need re-sync
    const staleProducts = await Product.countDocuments({
      updatedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Older than 24 hours
      shopifyProductId: { $exists: true }
    });

    if (staleProducts > 100) { // Only flag if significant number
      issues.push({
        type: 'stale_products',
        count: staleProducts,
        description: 'Products not updated in last 24 hours'
      });
    }

    const isValid = issues.filter(issue => 
      issue.type === 'orphaned_products'
    ).length === 0;

    console.log(`🔍 Sync integrity check: ${isValid ? 'VALID' : 'ISSUES FOUND'}`);
    if (issues.length > 0) {
      console.log('📋 Issues found:', issues);
    }

    return { issues, valid: isValid };
  } catch (error) {
    console.error('Error validating sync integrity:', error);
    return { 
      issues: [{ type: 'validation_error', description: error }], 
      valid: false 
    };
  }
};

/**
 * Get current sync status and statistics
 */
export const getSyncStatus = (): ISyncStatus => {
  return { ...syncStatus };
};

/**
 * Automated sync function for scheduled execution
 */
export const scheduledSync = async (type: 'full' | 'incremental' = 'incremental'): Promise<void> => {
  try {
    console.log(`⏰ Running scheduled ${type} sync...`);
    
    if (type === 'full') {
      await performFullSync();
    } else {
      await performIncrementalSync();
    }
    
    console.log(`✅ Scheduled ${type} sync completed successfully`);
  } catch (error) {
    console.error(`❌ Scheduled ${type} sync failed:`, error);
    
    // Could implement retry logic or alerting here
    // For now, just log the error
  }
};

/**
 * Reset sync status (for testing or recovery)
 */
export const resetSyncStatus = (): void => {
  syncStatus = {
    inProgress: false,
    errors: [],
    stats: {
      productsSync: 0,
      customersSync: 0,
      ordersSync: 0
    }
  };
  console.log('🔄 Sync status reset');
};