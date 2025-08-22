import mongoose, { Document } from 'mongoose';
export interface ICategoryDisplay {
    icon?: string;
    color?: string;
    bannerImage?: string;
    description?: string;
    featuredProducts: mongoose.Types.ObjectId[];
    showInNavigation: boolean;
    sortOrder: number;
}
export interface ICategorySEO {
    metaTitle?: string;
    metaDescription?: string;
    keywords: string[];
    slug: string;
    canonicalUrl?: string;
}
export interface ICategoryAnalytics {
    viewCount: number;
    productCount: number;
    conversionRate: number;
    popularityScore: number;
    lastViewedAt?: Date;
}
export interface IProductCategory extends Document {
    name: string;
    description?: string;
    handle: string;
    parent?: mongoose.Types.ObjectId;
    children: mongoose.Types.ObjectId[];
    level: number;
    path: string;
    display: ICategoryDisplay;
    seo: ICategorySEO;
    isActive: boolean;
    isVisible: boolean;
    analytics: ICategoryAnalytics;
    showInMobileApp: boolean;
    mobileIcon?: string;
    mobileBadge?: string;
    createdAt: Date;
    updatedAt: Date;
    getFullPath(): string;
    getAllChildren(): Promise<IProductCategory[]>;
    getAllParents(): Promise<IProductCategory[]>;
    updateProductCount(): Promise<void>;
}
declare const _default: mongoose.Model<IProductCategory, {}, {}, {}, mongoose.Document<unknown, {}, IProductCategory, {}, {}> & IProductCategory & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=ProductCategory.d.ts.map