import { Request, Response } from 'express';
export declare const getUserWishlists: (req: Request, res: Response) => Promise<void>;
export declare const getWishlist: (req: Request, res: Response) => Promise<void>;
export declare const createWishlist: (req: Request, res: Response) => Promise<void>;
export declare const updateWishlist: (req: Request, res: Response) => Promise<void>;
export declare const deleteWishlist: (req: Request, res: Response) => Promise<void>;
export declare const addToWishlist: (req: Request, res: Response) => Promise<void>;
export declare const removeFromWishlist: (req: Request, res: Response) => Promise<void>;
export declare const checkWishlistStatus: (req: Request, res: Response) => Promise<void>;
export declare const shareWishlist: (req: Request, res: Response) => Promise<void>;
export declare const getSharedWishlist: (req: Request, res: Response) => Promise<void>;
export declare const moveItemBetweenWishlists: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=wishlistController.d.ts.map