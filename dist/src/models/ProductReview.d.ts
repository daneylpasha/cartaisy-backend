import mongoose, { Document } from 'mongoose';
export interface IReviewImage {
    url: string;
    alt?: string;
    thumbnail?: string;
}
export interface IAdminResponse {
    response: string;
    respondedBy: mongoose.Types.ObjectId;
    respondedAt: Date;
}
export interface IProductReview extends Document {
    user: mongoose.Types.ObjectId;
    product: mongoose.Types.ObjectId;
    orderId?: string;
    rating: number;
    title?: string;
    reviewText: string;
    images: IReviewImage[];
    verifiedPurchase: boolean;
    status: 'pending' | 'approved' | 'rejected' | 'spam';
    helpfulVotes: {
        helpful: mongoose.Types.ObjectId[];
        notHelpful: mongoose.Types.ObjectId[];
    };
    helpfulCount: number;
    reportCount: number;
    reportedBy: mongoose.Types.ObjectId[];
    moderatedBy?: mongoose.Types.ObjectId;
    moderatedAt?: Date;
    moderationReason?: string;
    adminResponse?: IAdminResponse;
    deviceInfo?: {
        platform: string;
        browser?: string;
        isMobile: boolean;
    };
    createdAt: Date;
    updatedAt: Date;
    updateHelpfulCount(): void;
    canBeEditedBy(userId: string): boolean;
    isSpam(): boolean;
}
declare const _default: mongoose.Model<IProductReview, {}, {}, {}, mongoose.Document<unknown, {}, IProductReview, {}, {}> & IProductReview & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=ProductReview.d.ts.map