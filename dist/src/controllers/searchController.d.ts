import { Request, Response } from 'express';
export declare const search: (req: Request, res: Response) => Promise<void>;
export declare const getSearchSuggestions: (req: Request, res: Response) => Promise<void>;
export declare const getPopularSearches: (req: Request, res: Response) => Promise<void>;
export declare const getTrendingSearches: (req: Request, res: Response) => Promise<void>;
export declare const getFailedSearches: (req: Request, res: Response) => Promise<void>;
export declare const trackSearchClick: (req: Request, res: Response) => Promise<void>;
export declare const getUserSearchHistory: (req: Request, res: Response) => Promise<void>;
export declare const clearUserSearchHistory: (req: Request, res: Response) => Promise<void>;
export declare const getSearchAnalytics: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=searchController.d.ts.map