import { IShopifyProduct, IProductImage, IProductBadge } from '../types/index';
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
/**
 * Enhance Shopify product data with mobile-specific features
 */
export declare const enhanceProductData: (shopifyProduct: IShopifyProduct) => Promise<ProductEnhancement>;
/**
 * Generate AI-powered product recommendations
 */
export declare const generateProductRecommendations: (productId: string, userId?: string, limit?: number) => Promise<any[]>;
/**
 * Update product analytics with new interaction data
 */
export declare const updateProductAnalytics: (productId: string, viewData: {
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
}) => Promise<void>;
/**
 * Optimize product search indexing and relevance
 */
export declare const optimizeProductSearch: (productId?: string) => Promise<void>;
/**
 * Auto-generate SEO and mobile metadata
 */
export declare const generateProductMeta: (product: any) => Promise<any>;
/**
 * Optimize product images for mobile display
 */
export declare const processProductImages: (product: any) => Promise<any>;
/**
 * Calculate dynamic product ranking score
 */
export declare const calculateProductScore: (productId: string) => Promise<number>;
export {};
//# sourceMappingURL=productEnhancementService.d.ts.map