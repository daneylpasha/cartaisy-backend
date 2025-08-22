import mongoose, { Document } from 'mongoose';
export interface IDeviceInfo {
    userAgent?: string;
    platform: string;
    os?: string;
    browser?: string;
    version?: string;
    screenWidth?: number;
    screenHeight?: number;
    deviceModel?: string;
}
export interface ILocationData {
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
    coordinates?: {
        lat: number;
        lng: number;
    };
}
export interface ISessionData {
    sessionId: string;
    isNewSession: boolean;
    sessionStartTime: Date;
    previousPage?: string;
    referrer?: string;
    source?: string;
    medium?: string;
    campaign?: string;
}
export interface IProductView extends Document {
    user?: mongoose.Types.ObjectId;
    anonymousId?: string;
    product: mongoose.Types.ObjectId;
    productHandle?: string;
    viewedAt: Date;
    viewDuration?: number;
    scrollDepth?: number;
    session: ISessionData;
    device: IDeviceInfo;
    location?: ILocationData;
    interactions: {
        clickedImages: number;
        clickedVariants: number;
        addedToWishlist: boolean;
        addedToCart: boolean;
        shared: boolean;
        reviewsViewed: boolean;
    };
    viewContext?: string;
    searchQuery?: string;
    categoryId?: mongoose.Types.ObjectId;
    createdAt: Date;
}
declare const _default: mongoose.Model<IProductView, {}, {}, {}, mongoose.Document<unknown, {}, IProductView, {}, {}> & IProductView & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=ProductView.d.ts.map