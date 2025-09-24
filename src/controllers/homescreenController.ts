import { Request, Response } from 'express';
import CarouselItem from '../models/CarouselItem';
import Product from '../models/Product';
import ProductCategory from '../models/ProductCategory';
import CategoryGrid from '../models/CategoryGrid';
import CalloutBanner from '../models/CalloutBanner';

// Homescreen component services - modular and reusable
const homescreenServices = {
  // Carousel component data
  async getCarouselData() {
    return CarouselItem.find({ isActive: true })
      .sort({ position: 1 })
      .select('imageUrl label title subTitle buttonText collectionId')
      .lean();
  },

  // Featured products component data
  async getFeaturedProducts() {
    return Product.find({ featured: true, published: true })
      .limit(10)
      .select('title images price compareAtPrice handle shopifyId')
      .lean();
  },

  // Categories component data
  async getCategories() {
    return ProductCategory.find({ isActive: true })
      .limit(8)
      .select('name slug imageUrl productsCount')
      .lean();
  },

  // Category grid component data (icon-based category navigation)
  async getCategoryGrid() {
    return CategoryGrid.find({ isActive: true })
      .sort({ position: 1 })
      .select('imageUrl title collectionId')
      .lean();
  },

  // Callout banners component data (promotional announcements)
  async getCalloutBanners() {
    return CalloutBanner.find({ isActive: true })
      .sort({ position: 1 })
      .select('imageUrl title subTitle buttonText action backgroundColor textColor buttonColor')
      .lean();
  },

  // New arrivals component data
  async getNewArrivals() {
    return Product.find({ published: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title images price compareAtPrice handle shopifyId')
      .lean();
  },

  // Best sellers component data
  async getBestSellers() {
    return Product.find({ published: true } as any)
      .sort({ salesCount: -1 } as any)
      .limit(10)
      .select('title images price compareAtPrice handle shopifyId salesCount')
      .lean();
  },

  // Future homescreen components can be added here:
  // async getPromoBanners() { ... }
  // async getRecentlyViewed(userId) { ... }
  // async getRecommendations(userId) { ... }
  // async getBrandSpotlight() { ... }
  // async getSaleCountdown() { ... }
};

export const homescreenController = {
  async getHomescreenData(req: Request, res: Response) {
    try {
      // Fetch all homescreen components in parallel for optimal performance
      const [
        carousel,
        featuredProducts,
        categories,
        categoryGrid,
        calloutBanners,
        newArrivals,
        bestSellers
      ] = await Promise.all([
        homescreenServices.getCarouselData(),
        homescreenServices.getFeaturedProducts(),
        homescreenServices.getCategories(),
        homescreenServices.getCategoryGrid(),
        homescreenServices.getCalloutBanners(),
        homescreenServices.getNewArrivals(),
        homescreenServices.getBestSellers()
      ]);

      // Structured response with clear component separation
      res.status(200).json({
        success: true,
        data: {
          // Main hero section
          carousel,

          // Product sections
          featuredProducts,
          newArrivals,
          bestSellers,

          // Navigation/discovery
          categories,
          categoryGrid,

          // Promotional content
          calloutBanners,

          // Future components will go here:
          // promoBanners: await homescreenServices.getPromoBanners(),
          // recentlyViewed: await homescreenServices.getRecentlyViewed(userId),
          // recommendations: await homescreenServices.getRecommendations(userId),
          // brandSpotlight: await homescreenServices.getBrandSpotlight(),

          // Metadata for UI handling
          metadata: {
            carouselItemsCount: carousel.length,
            featuredProductsCount: featuredProducts.length,
            categoriesCount: categories.length,
            categoryGridItemsCount: categoryGrid.length,
            calloutBannersCount: calloutBanners.length,
            newArrivalsCount: newArrivals.length,
            bestSellersCount: bestSellers.length,
            lastUpdated: new Date().toISOString()
          }
        }
      });
    } catch (error: any) {
      console.error('Error fetching homescreen data:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch homescreen data'
      });
    }
  }

  // Individual component endpoints can be added for specific updates:
  // async getCarouselOnly(req: Request, res: Response) {
  //   try {
  //     const carousel = await homescreenServices.getCarouselData();
  //     res.json({ success: true, data: carousel });
  //   } catch (error: any) {
  //     res.status(500).json({ success: false, error: error.message });
  //   }
  // }
};