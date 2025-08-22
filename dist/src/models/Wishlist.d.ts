import mongoose, { Document } from 'mongoose';
export interface IWishlistItem {
    product: mongoose.Types.ObjectId;
    variant?: string;
    addedAt: Date;
    notes?: string;
    priority: number;
}
export interface IWishlistShare {
    token: string;
    isPublic: boolean;
    sharedWith: string[];
    sharedAt: Date;
    expiresAt?: Date;
    viewCount: number;
}
export interface IWishlist extends Document {
    user: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    isDefault: boolean;
    items: IWishlistItem[];
    itemCount: number;
    isPrivate: boolean;
    sharing?: IWishlistShare;
    coverImage?: string;
    color?: string;
    lastViewedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    addItem(productId: string, variantId?: string, notes?: string, priority?: number): Promise<void>;
    removeItem(productId: string, variantId?: string): Promise<void>;
    hasItem(productId: string, variantId?: string): boolean;
    generateShareToken(): string;
    updateItemCount(): Promise<void>;
}
declare const _default: mongoose.Model<IWishlist, {}, {}, {}, mongoose.Document<unknown, {}, IWishlist, {}, {}> & IWishlist & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=Wishlist.d.ts.map