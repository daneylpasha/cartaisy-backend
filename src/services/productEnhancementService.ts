import mongoose from 'mongoose';
import Product from '../models/Product';
import ProductView from '../models/ProductView';
import ProductReview from '../models/ProductReview';
import SearchHistory from '../models/SearchHistory';
import Order from '../models/Order';
import Wishlist from '../models/Wishlist';
import { IProduct, IShopifyProduct, IProductImage, IProductBadge } from '../types/index';
import { ApiError } from '../utils/errors';

interface ProductEnhancement {
  mobileDisplay: {
    thumbnailUrl: string;
    priority: number;
    isFeatured: boolean;
    shortDescription: string;
    badges: IProductBadge[];
    quickViewData: {
      keyFeatures: string[];
      sizingInfo: any;
      shippingInfo: any;
    };
  };
  seo: {
    title: string;
    description: string;
    keywords: string[];
    slug: string;
    structuredData: any;
    socialMedia: {
      ogTitle: string;
      ogDescription: string;
      ogImage: string;
      twitterCard: string;
    };
  };
  richMedia: {
    gallery: IProductImage[];
    videos: any[];
    ar3d: any;
    userContent: any[];
  };
}

interface ProductAnalytics {
  viewCount: number;
  favoriteCount: number;
  conversionRate: number;
  averageRating: number;
  reviewCount: number;
  searchAppearances: number;
  clickThroughRate: number;
  averageTimeOnPage: number;
  bounceRate: number;
}

/**
 * Enhance Shopify product data with mobile-specific features
 */
export const enhanceProductData = async (shopifyProduct: IShopifyProduct): Promise<ProductEnhancement> => {
  try {
    const enhancements = {
      // Mobile display optimizations
      mobileDisplay: {
        thumbnailUrl: optimizeImageForMobile(shopifyProduct.images?.[0]?.src),
        priority: calculateProductPriority(shopifyProduct),
        isFeatured: false, // Can be set manually or based on criteria
        shortDescription: generateShortDescription(shopifyProduct.body_html, shopifyProduct.title),
        badges: generateProductBadges(shopifyProduct),
        quickViewData: {
          keyFeatures: extractKeyFeatures(shopifyProduct.body_html),
          sizingInfo: extractSizingInfo(shopifyProduct),
          shippingInfo: generateShippingInfo(shopifyProduct)
        }
      },

      // Enhanced SEO metadata
      seo: {
        title: optimizeSEOTitle(shopifyProduct.title, shopifyProduct.product_type),
        description: generateSEODescription(shopifyProduct),
        keywords: generateSEOKeywords(shopifyProduct),
        slug: shopifyProduct.handle,
        structuredData: generateStructuredData(shopifyProduct),
        socialMedia: {
          ogTitle: shopifyProduct.title,
          ogDescription: generateSocialDescription(shopifyProduct),
          ogImage: shopifyProduct.images?.[0]?.src,
          twitterCard: 'summary_large_image'
        }
      },

      // Rich media content
      richMedia: {
        gallery: processImageGallery(shopifyProduct.images),
        videos: [], // To be populated from product metafields
        ar3d: null, // 3D/AR model data if available
        userContent: [] // User-generated content to be populated
      },

      // Mobile-specific analytics initialization
      analytics: {
        viewCount: 0,
        favoriteCount: 0,
        conversionRate: 0,
        averageTimeOnPage: 0,
        mobileMetrics: {
          mobileViews: 0,
          mobileConversions: 0,
          averageMobileSessionTime: 0,
          mobileCartAdditions: 0,
          mobileWishlistAdditions: 0
        },
        conversionEvents: [],
        lastViewedAt: new Date()
      },

      // Enhanced categorization
      categoryEnhancements: {
        breadcrumbs: [], // To be populated based on category hierarchy
        relatedCategories: [],
        seasonality: detectSeasonality(shopifyProduct),
        trending: false,
        newArrival: isNewArrival(shopifyProduct.created_at)
      },

      // Personalization data
      personalization: {
        recommendationScore: 0,
        userSegments: [], // Target user segments
        affinityTags: generateAffinityTags(shopifyProduct),
        crossSellOpportunities: [],
        bundleRecommendations: []
      }
    };

    return enhancements;
  } catch (error) {
    console.error('Error enhancing product data:', error);
    throw error;
  }
};

/**
 * Generate AI-powered product recommendations
 */
export const generateProductRecommendations = async (
  productId: string,
  userId?: string,
  limit: number = 8
): Promise<any[]> => {
  try {
    const baseProduct = await Product.findById(productId)
      .populate('category');

    if (!baseProduct) {
      throw new Error('Product not found');
    }

    let recommendations = [];

    // 1. Collaborative Filtering (if user provided)
    if (userId) {
      const userBasedRecs = await getUserBasedRecommendations(userId, productId, limit / 2);
      recommendations.push(...userBasedRecs);
    }

    // 2. Content-Based Filtering
    const contentBasedRecs = await getContentBasedRecommendations(baseProduct, limit - recommendations.length);
    recommendations.push(...contentBasedRecs);

    // 3. Popularity-Based Fallback
    if (recommendations.length < limit) {
      const popularRecs = await getPopularityBasedRecommendations(
        baseProduct.category._id,
        limit - recommendations.length,
        recommendations.map(r => r._id)
      );
      recommendations.push(...popularRecs);
    }

    // 4. Score and rank recommendations
    const scoredRecommendations = await scoreRecommendations(recommendations, baseProduct, userId);

    return scoredRecommendations.slice(0, limit);
  } catch (error) {
    console.error('Error generating product recommendations:', error);
    throw error;
  }
};

/**
 * Update product analytics with new interaction data
 */
export const updateProductAnalytics = async (
  productId: string,
  viewData: {
    userId?: string;
    sessionId: string;
    viewDuration?: number;
    interactions?: {
      imageClicks?: number;
      variantSelections?: number;
      addedToCart?: boolean;
      addedToWishlist?: boolean;
    };
    source?: string;
    device?: string;
  }
): Promise<void> => {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    // Update view count
    product.analytics.viewCount += 1;
    product.analytics.lastViewedAt = new Date();

    // Update mobile-specific metrics
    if (viewData.device === 'mobile') {
      product.analytics.mobileMetrics.mobileViews += 1;
      
      if (viewData.viewDuration) {
        const currentAvg = product.analytics.mobileMetrics.averageMobileSessionTime;
        const totalSessions = product.analytics.mobileMetrics.mobileViews;
        product.analytics.mobileMetrics.averageMobileSessionTime = 
          ((currentAvg * (totalSessions - 1)) + viewData.viewDuration) / totalSessions;
      }

      if (viewData.interactions?.addedToCart) {
        product.analytics.mobileMetrics.mobileCartAdditions += 1;
      }

      if (viewData.interactions?.addedToWishlist) {
        product.analytics.mobileMetrics.mobileWishlistAdditions += 1;
      }
    }

    // Update average time on page
    if (viewData.viewDuration) {
      const currentAvg = product.analytics.averageTimeOnPage;
      const totalViews = product.analytics.viewCount;
      product.analytics.averageTimeOnPage = 
        ((currentAvg * (totalViews - 1)) + viewData.viewDuration) / totalViews;
    }

    // Add conversion event
    if (viewData.interactions?.addedToCart || viewData.interactions?.addedToWishlist) {
      product.analytics.conversionEvents.push({
        type: viewData.interactions.addedToCart ? 'cart_addition' : 'wishlist_addition',
        timestamp: new Date(),
        userId: viewData.userId,
        sessionId: viewData.sessionId,
        source: viewData.source || 'direct'
      });

      // Recalculate conversion rate
      const cartEvents = product.analytics.conversionEvents.filter(e => e.type === 'cart_addition').length;
      product.analytics.conversionRate = (cartEvents / product.analytics.viewCount) * 100;
    }

    await product.save();

    // Update recommendation scores asynchronously
    updateRecommendationScores(productId);

  } catch (error) {
    console.error('Error updating product analytics:', error);
    throw error;
  }
};

/**
 * Optimize product search indexing and relevance
 */
export const optimizeProductSearch = async (productId?: string): Promise<void> => {
  try {
    const products = productId ? 
      [await Product.findById(productId)] : 
      await Product.find({ status: 'active' });

    for (const product of products) {
      if (!product) continue;

      // Generate search keywords
      const searchKeywords = generateSearchKeywords(product);
      
      // Update search optimization fields
      product.searchOptimization = {
        keywords: searchKeywords,
        searchScore: calculateSearchScore(product),
        lastOptimized: new Date(),
        synonyms: generateSynonyms(product),
        boostFactor: calculateBoostFactor(product)
      };

      await product.save();
    }

    console.log(`🔍 Optimized search for ${products.length} products`);
  } catch (error) {
    console.error('Error optimizing product search:', error);
    throw error;
  }
};

/**
 * Auto-generate SEO and mobile metadata
 */
export const generateProductMeta = async (product: any): Promise<any> => {
  try {
    const meta = {
      // Core SEO
      title: optimizeSEOTitle(product.title, product.productType),
      description: generateSEODescription(product),
      keywords: generateSEOKeywords(product),
      
      // Open Graph
      openGraph: {
        title: product.title,
        description: generateSocialDescription(product),
        image: product.images?.[0]?.url,
        type: 'product',
        productData: {
          price: product.price,
          currency: product.currency || 'USD',
          availability: product.inventoryTracking.totalQuantity > 0 ? 'in stock' : 'out of stock',
          brand: product.vendor,
          category: product.productType
        }
      },

      // Twitter Cards
      twitter: {
        card: 'summary_large_image',
        title: product.title,
        description: generateSocialDescription(product),
        image: product.images?.[0]?.url
      },

      // Mobile App Deep Linking
      appLinks: {
        ios: {
          url: `cartaisy://product/${product.handle}`,
          appName: 'Cartaisy'
        },
        android: {
          url: `cartaisy://product/${product.handle}`,
          package: 'com.cartaisy.app'
        }
      },

      // Rich Snippets / Structured Data
      structuredData: generateStructuredData(product),

      // Mobile-specific meta
      mobileMeta: {
        viewport: 'width=device-width, initial-scale=1',
        appleTouch: true,
        themeColor: '#E91E63',
        statusBarStyle: 'black-translucent'
      }
    };

    return meta;
  } catch (error) {
    console.error('Error generating product meta:', error);
    throw error;
  }
};

/**
 * Optimize product images for mobile display
 */
export const processProductImages = async (product: any): Promise<any> => {
  try {
    const processedImages = [];

    for (const image of product.images || []) {
      const processed = {
        original: image.url,
        thumbnail: generateThumbnailUrl(image.url, 150, 150),
        mobile: generateThumbnailUrl(image.url, 400, 400),
        tablet: generateThumbnailUrl(image.url, 600, 600),
        desktop: generateThumbnailUrl(image.url, 800, 800),
        zoom: generateThumbnailUrl(image.url, 1200, 1200),
        alt: image.alt || product.title,
        position: image.position || processedImages.length + 1,
        
        // Lazy loading optimization
        lazy: {
          placeholder: generatePlaceholderImage(image.url),
          blurHash: generateBlurHash(image.url), // Would integrate with BlurHash library
          dominant: extractDominantColor(image.url)
        },

        // Performance metrics
        optimized: {
          webp: convertToWebP(image.url),
          avif: convertToAVIF(image.url),
          quality: 85,
          compression: 'auto'
        }
      };

      processedImages.push(processed);
    }

    return {
      images: processedImages,
      hero: processedImages[0] || null,
      gallery: processedImages.slice(1),
      count: processedImages.length
    };
  } catch (error) {
    console.error('Error processing product images:', error);
    throw error;
  }
};

/**
 * Calculate dynamic product ranking score
 */
export const calculateProductScore = async (productId: string): Promise<number> => {
  try {
    const product = await Product.findById(productId);
    if (!product) return 0;

    // Base scoring factors
    let score = 0;

    // 1. Popularity Score (40% weight)
    const viewScore = Math.min(product.analytics.viewCount / 1000, 1) * 40;
    score += viewScore;

    // 2. Rating Score (25% weight)
    const ratingScore = (product.reviews.averageRating / 5) * 25;
    score += ratingScore;

    // 3. Conversion Score (20% weight)
    const conversionScore = Math.min(product.analytics.conversionRate / 10, 1) * 20;
    score += conversionScore;

    // 4. Inventory Score (10% weight)
    const inventoryScore = product.inventoryTracking.totalQuantity > 0 ? 10 : 0;
    score += inventoryScore;

    // 5. Recency Score (5% weight)
    const daysSinceCreated = (Date.now() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, (30 - daysSinceCreated) / 30) * 5;
    score += recencyScore;

    // Normalize to 0-100
    score = Math.min(Math.max(score, 0), 100);

    // Update product with calculated score
    product.analytics.qualityScore = score;
    await product.save();

    return score;
  } catch (error) {
    console.error('Error calculating product score:', error);
    return 0;
  }
};

// Helper Functions

function optimizeImageForMobile(imageUrl?: string): string {
  if (!imageUrl) return '';
  
  // Generate mobile-optimized image URL
  // This would integrate with image optimization service (Cloudinary, ImageKit, etc.)
  return imageUrl.replace(/\.(jpg|jpeg|png)$/i, '_mobile_400x400.$1');
}

function calculateProductPriority(shopifyProduct: any): number {
  let priority = 1;
  
  // Boost priority for featured products
  if (shopifyProduct.tags?.includes('featured')) priority += 5;
  
  // Boost for new products
  const daysSinceCreated = (Date.now() - new Date(shopifyProduct.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreated <= 30) priority += 3;
  
  // Boost for high-priced items (assuming they're premium)
  const price = parseFloat(shopifyProduct.variants?.[0]?.price || 0);
  if (price > 100) priority += 2;
  
  return Math.min(priority, 10);
}

function generateShortDescription(bodyHtml?: string, title?: string): string {
  if (!bodyHtml) return title?.substring(0, 100) || '';
  
  // Strip HTML and create short description
  const plainText = bodyHtml.replace(/<[^>]*>/g, '').trim();
  return plainText.length > 100 ? plainText.substring(0, 97) + '...' : plainText;
}

function generateProductBadges(shopifyProduct: any): string[] {
  const badges = [];
  
  if (shopifyProduct.tags?.includes('bestseller')) badges.push('Best Seller');
  if (shopifyProduct.tags?.includes('new')) badges.push('New');
  if (shopifyProduct.tags?.includes('sale')) badges.push('Sale');
  
  // Check for discount
  const variant = shopifyProduct.variants?.[0];
  if (variant?.compare_at_price && variant.price < variant.compare_at_price) {
    const discount = Math.round((1 - variant.price / variant.compare_at_price) * 100);
    badges.push(`${discount}% Off`);
  }
  
  return badges;
}

function extractKeyFeatures(bodyHtml?: string): string[] {
  if (!bodyHtml) return [];
  
  // Simple feature extraction - in production, use NLP
  const features = [];
  const text = bodyHtml.replace(/<[^>]*>/g, '');
  
  // Look for bullet points or feature lists
  const bullets = text.match(/[•·▪▫‣⁃]\s*([^\n•·▪▫‣⁃]+)/g);
  if (bullets) {
    features.push(...bullets.slice(0, 5).map(b => b.replace(/[•·▪▫‣⁃]\s*/, '').trim()));
  }
  
  return features;
}

function extractSizingInfo(shopifyProduct: any): any {
  const sizingInfo = {
    hasSize: false,
    sizes: [],
    sizeChart: null,
    fitGuide: null
  };
  
  // Check if product has size variants
  const variants = shopifyProduct.variants || [];
  const sizeOptions = variants
    .map((v: any) => v.option1)
    .filter((option: string) => /^(XXS|XS|S|M|L|XL|XXL|\d+)$/i.test(option));
  
  if (sizeOptions.length > 0) {
    sizingInfo.hasSize = true;
    sizingInfo.sizes = [...new Set(sizeOptions)];
  }
  
  return sizingInfo;
}

function generateShippingInfo(shopifyProduct: any): any {
  return {
    freeShipping: shopifyProduct.tags?.includes('free-shipping') || false,
    estimatedDays: '3-5 business days',
    restrictions: [],
    international: true
  };
}

function optimizeSEOTitle(title: string, productType?: string): string {
  // Optimize title for search engines (max 60 characters)
  let seoTitle = title;
  
  if (productType && !title.toLowerCase().includes(productType.toLowerCase())) {
    seoTitle = `${title} - ${productType}`;
  }
  
  return seoTitle.length > 60 ? seoTitle.substring(0, 57) + '...' : seoTitle;
}

function generateSEODescription(shopifyProduct: any): string {
  const description = shopifyProduct.body_html?.replace(/<[^>]*>/g, '') || '';
  const baseDesc = description.length > 155 ? description.substring(0, 152) + '...' : description;
  
  // Add call to action
  return baseDesc + (baseDesc ? ' ' : '') + 'Shop now with fast shipping!';
}

function generateSEOKeywords(shopifyProduct: any): string[] {
  const keywords = [];
  
  // Add title words
  keywords.push(...shopifyProduct.title.toLowerCase().split(' '));
  
  // Add product type
  if (shopifyProduct.product_type) {
    keywords.push(shopifyProduct.product_type.toLowerCase());
  }
  
  // Add vendor
  if (shopifyProduct.vendor) {
    keywords.push(shopifyProduct.vendor.toLowerCase());
  }
  
  // Add tags
  if (shopifyProduct.tags) {
    keywords.push(...shopifyProduct.tags.split(',').map((tag: string) => tag.trim().toLowerCase()));
  }
  
  // Remove duplicates and filter
  return [...new Set(keywords)].filter(k => k.length > 2);
}

function generateStructuredData(shopifyProduct: any): any {
  const variant = shopifyProduct.variants?.[0];
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: shopifyProduct.title,
    image: shopifyProduct.images?.map((img: any) => img.src) || [],
    description: shopifyProduct.body_html?.replace(/<[^>]*>/g, '') || '',
    brand: {
      '@type': 'Brand',
      name: shopifyProduct.vendor || 'Unknown'
    },
    offers: {
      '@type': 'Offer',
      price: variant?.price || 0,
      priceCurrency: 'USD',
      availability: variant?.inventory_quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: shopifyProduct.vendor || 'Store'
      }
    }
  };
}

function generateSocialDescription(shopifyProduct: any): string {
  const desc = shopifyProduct.body_html?.replace(/<[^>]*>/g, '') || shopifyProduct.title;
  return desc.length > 200 ? desc.substring(0, 197) + '...' : desc;
}

function processImageGallery(images: any[]): any[] {
  return (images || []).map((img, index) => ({
    url: img.src,
    alt: img.alt,
    position: index + 1,
    type: 'image',
    thumbnails: {
      small: generateThumbnailUrl(img.src, 100, 100),
      medium: generateThumbnailUrl(img.src, 300, 300),
      large: generateThumbnailUrl(img.src, 600, 600)
    }
  }));
}

function detectSeasonality(shopifyProduct: any): string | null {
  const title = shopifyProduct.title?.toLowerCase() || '';
  const tags = shopifyProduct.tags?.toLowerCase() || '';
  const description = shopifyProduct.body_html?.toLowerCase() || '';
  
  const text = `${title} ${tags} ${description}`;
  
  if (/spring|easter|march|april|may/i.test(text)) return 'spring';
  if (/summer|june|july|august/i.test(text)) return 'summer';
  if (/fall|autumn|september|october|november/i.test(text)) return 'fall';
  if (/winter|christmas|holiday|december|january|february/i.test(text)) return 'winter';
  
  return null;
}

function isNewArrival(createdAt: string): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const daysDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 30; // New if created within 30 days
}

function generateAffinityTags(shopifyProduct: any): string[] {
  const tags = [];
  
  // Price-based tags
  const price = parseFloat(shopifyProduct.variants?.[0]?.price || 0);
  if (price < 25) tags.push('budget-friendly');
  else if (price > 100) tags.push('premium');
  
  // Category-based tags
  if (shopifyProduct.product_type) {
    tags.push(shopifyProduct.product_type.toLowerCase().replace(/\s+/g, '-'));
  }
  
  return tags;
}

// Recommendation helper functions

async function getUserBasedRecommendations(userId: string, productId: string, limit: number): Promise<any[]> {
  // Find users who viewed/bought similar products
  const similarUsers = await ProductView.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: '$user', viewCount: { $sum: 1 } } },
    { $sort: { viewCount: -1 } },
    { $limit: 20 }
  ]);

  if (similarUsers.length === 0) return [];

  // Get products viewed by similar users
  const recommendations = await ProductView.aggregate([
    { $match: { user: { $in: similarUsers.map(u => u._id) } } },
    { $group: { _id: '$product', score: { $sum: 1 } } },
    { $match: { _id: { $ne: new mongoose.Types.ObjectId(productId) } } },
    { $sort: { score: -1 } },
    { $limit: limit },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $replaceRoot: { newRoot: '$product' } }
  ]);

  return recommendations;
}

async function getContentBasedRecommendations(baseProduct: any, limit: number): Promise<any[]> {
  const recommendations = await Product.aggregate([
    {
      $match: {
        _id: { $ne: baseProduct._id },
        status: 'active',
        $or: [
          { category: baseProduct.category._id },
          { vendor: baseProduct.vendor },
          { tags: { $in: baseProduct.tags || [] } }
        ]
      }
    },
    {
      $addFields: {
        similarityScore: {
          $sum: [
            { $cond: [{ $eq: ['$category', baseProduct.category._id] }, 3, 0] },
            { $cond: [{ $eq: ['$vendor', baseProduct.vendor] }, 2, 0] },
            { $size: { $setIntersection: ['$tags', baseProduct.tags || []] } }
          ]
        }
      }
    },
    { $sort: { similarityScore: -1, 'analytics.viewCount': -1 } },
    { $limit: limit }
  ]);

  return recommendations;
}

async function getPopularityBasedRecommendations(categoryId: string, limit: number, excludeIds: string[]): Promise<any[]> {
  const recommendations = await Product.find({
    category: categoryId,
    status: 'active',
    _id: { $nin: excludeIds.map(id => new mongoose.Types.ObjectId(id)) }
  })
    .sort({ 'analytics.viewCount': -1, 'reviews.averageRating': -1 })
    .limit(limit);

  return recommendations;
}

async function scoreRecommendations(recommendations: any[], baseProduct: any, userId?: string): Promise<any[]> {
  // Add scoring logic based on various factors
  return recommendations.map(rec => ({
    ...rec,
    recommendationScore: calculateRecommendationScore(rec, baseProduct, userId)
  })).sort((a, b) => b.recommendationScore - a.recommendationScore);
}

function calculateRecommendationScore(product: any, baseProduct: any, userId?: string): number {
  let score = 0;
  
  // Category match bonus
  if (product.category?.toString() === baseProduct.category?._id?.toString()) {
    score += 30;
  }
  
  // Vendor match bonus
  if (product.vendor === baseProduct.vendor) {
    score += 20;
  }
  
  // Price similarity bonus
  const priceDiff = Math.abs(product.price - baseProduct.price);
  const maxPrice = Math.max(product.price, baseProduct.price);
  const priceScore = Math.max(0, 20 - (priceDiff / maxPrice) * 20);
  score += priceScore;
  
  // Popularity bonus
  score += Math.min(product.analytics?.viewCount || 0, 1000) / 100;
  
  // Rating bonus
  score += (product.reviews?.averageRating || 0) * 2;
  
  return score;
}

async function updateRecommendationScores(productId: string): Promise<void> {
  // Update recommendation scores for related products asynchronously
  setTimeout(async () => {
    try {
      const product = await Product.findById(productId);
      if (product) {
        const score = await calculateProductScore(productId);
        console.log(`📊 Updated recommendation score for ${product.title}: ${score}`);
      }
    } catch (error) {
      console.error('Error updating recommendation scores:', error);
    }
  }, 5000); // Delay to avoid blocking main request
}

function generateSearchKeywords(product: any): string[] {
  const keywords = new Set<string>();
  
  // Title words
  product.title?.toLowerCase().split(' ').forEach((word: string) => {
    if (word.length > 2) keywords.add(word);
  });
  
  // Product type
  if (product.productType) {
    keywords.add(product.productType.toLowerCase());
  }
  
  // Vendor
  if (product.vendor) {
    keywords.add(product.vendor.toLowerCase());
  }
  
  // Tags
  product.tags?.forEach((tag: string) => {
    keywords.add(tag.toLowerCase());
  });
  
  return Array.from(keywords);
}

function calculateSearchScore(product: any): number {
  let score = 0;
  
  // Popularity
  score += Math.min(product.analytics?.viewCount || 0, 1000) / 10;
  
  // Rating
  score += (product.reviews?.averageRating || 0) * 20;
  
  // Availability
  score += product.inventoryTracking?.totalQuantity > 0 ? 50 : 0;
  
  // Recency
  const daysSinceCreated = (Date.now() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  score += Math.max(0, (365 - daysSinceCreated) / 365) * 30;
  
  return Math.min(score, 100);
}

function generateSynonyms(product: any): string[] {
  // Simple synonym generation - in production, use NLP service
  const synonyms = [];
  const title = product.title?.toLowerCase() || '';
  
  // Basic synonym mapping
  const synonymMap: { [key: string]: string[] } = {
    'shirt': ['top', 'blouse', 'tee'],
    'pants': ['trousers', 'jeans', 'slacks'],
    'shoes': ['footwear', 'sneakers', 'boots'],
    'bag': ['purse', 'handbag', 'tote']
  };
  
  Object.entries(synonymMap).forEach(([word, syns]) => {
    if (title.includes(word)) {
      synonyms.push(...syns);
    }
  });
  
  return synonyms;
}

function calculateBoostFactor(product: any): number {
  let boost = 1.0;
  
  // Boost high-rated products
  if (product.reviews?.averageRating >= 4.5) boost += 0.3;
  else if (product.reviews?.averageRating >= 4.0) boost += 0.2;
  
  // Boost products with good conversion
  if (product.analytics?.conversionRate >= 5) boost += 0.2;
  
  // Boost featured products
  if (product.mobileDisplay?.isFeatured) boost += 0.4;
  
  return Math.min(boost, 2.0);
}

// Image processing helper functions (would integrate with actual image service)

function generateThumbnailUrl(originalUrl: string, width: number, height: number): string {
  // This would integrate with image optimization service
  return originalUrl.replace(/\.(jpg|jpeg|png)$/i, `_${width}x${height}.$1`);
}

function generatePlaceholderImage(originalUrl: string): string {
  // Generate low-quality placeholder
  return originalUrl.replace(/\.(jpg|jpeg|png)$/i, '_placeholder_20x20.$1');
}

function generateBlurHash(originalUrl: string): string {
  // Would integrate with BlurHash library
  return 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH';
}

function extractDominantColor(originalUrl: string): string {
  // Would use color extraction library
  return '#E91E63';
}

function convertToWebP(originalUrl: string): string {
  return originalUrl.replace(/\.(jpg|jpeg|png)$/i, '.webp');
}

function convertToAVIF(originalUrl: string): string {
  return originalUrl.replace(/\.(jpg|jpeg|png)$/i, '.avif');
}