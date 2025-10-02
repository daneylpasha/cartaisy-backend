import ProductRating from '../models/ProductRating';
import { Product } from '../types/api/products';
import { ShopifyProduct } from '../types/shopify/storefront';

/**
 * Product Enrichment Service
 * Enriches Shopify product data with MongoDB ratings and reviews
 */
class ProductEnrichmentService {
  /**
   * Get ratings for multiple products
   */
  async getProductRatings(productIds: string[]): Promise<Map<string, { rating: number; reviewsCount: number }>> {
    const ratings = await ProductRating.find({
      productId: { $in: productIds }
    }).lean();

    const ratingsMap = new Map();
    ratings.forEach((rating) => {
      ratingsMap.set(rating.productId, {
        rating: rating.averageRating,
        reviewsCount: rating.reviewsCount
      });
    });

    return ratingsMap;
  }

  /**
   * Enrich a list of products with ratings data
   */
  async enrichProducts(products: Omit<Product, 'rating' | 'reviewsCount'>[]): Promise<Product[]> {
    if (!products.length) return [];

    const productIds = products.map(p => p.productId);
    const ratingsMap = await this.getProductRatings(productIds);

    return products.map(product => ({
      ...product,
      rating: ratingsMap.get(product.productId)?.rating || 0,
      reviewsCount: ratingsMap.get(product.productId)?.reviewsCount || 0
    }));
  }

  /**
   * Get or create default rating for a product
   */
  async ensureProductRating(productId: string): Promise<{ rating: number; reviewsCount: number }> {
    let productRating = await ProductRating.findOne({ productId }).lean();

    if (!productRating) {
      // Create default rating entry
      productRating = await ProductRating.create({
        productId,
        averageRating: 0,
        reviewsCount: 0,
        ratings: {
          five: 0,
          four: 0,
          three: 0,
          two: 0,
          one: 0
        }
      });
    }

    return {
      rating: productRating.averageRating,
      reviewsCount: productRating.reviewsCount
    };
  }
}

export default new ProductEnrichmentService();
