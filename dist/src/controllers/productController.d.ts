import { Request, Response } from 'express';
export declare const getProducts: (req: Request, res: Response) => Promise<void>;
export declare const getProduct: (req: Request, res: Response) => Promise<void>;
export declare const searchProducts: (req: Request, res: Response) => Promise<void>;
export declare const getFeaturedProducts: (req: Request, res: Response) => Promise<void>;
export declare const getProductsByCategory: (req: Request, res: Response) => Promise<void>;
export declare const getRecommendations: (req: Request, res: Response) => Promise<void>;
export declare const trackProductView: (productId: string, userId: string, req: Request) => Promise<void>;
export declare const getProductReviews: (req: Request, res: Response) => Promise<void>;
export declare const getRelatedProducts: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=productController.d.ts.map