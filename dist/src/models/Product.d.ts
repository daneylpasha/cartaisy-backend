import mongoose from 'mongoose';
import { IProduct, IProductVariant, IProductImage, IMobileDisplay, IProductAnalytics, IProductReviews, IProductSEO, MongooseDocument } from '../types/index';
export interface IProductDocument extends MongooseDocument<IProduct> {
    updateAnalytics(): Promise<void>;
    isAvailable(): boolean;
    getLowestPrice(): number;
    getHighestPrice(): number;
}
export interface IProductModel extends mongoose.Model<IProductDocument> {
    findByText(query: string, options?: {
        limit?: number;
        skip?: number;
    }): mongoose.Query<IProductDocument[], IProductDocument>;
    findFeatured(limit?: number): mongoose.Query<IProductDocument[], IProductDocument>;
    findLowStock(threshold?: number): mongoose.Query<IProductDocument[], IProductDocument>;
}
export { IProduct, IProductVariant, IProductImage, IMobileDisplay, IProductAnalytics, IProductReviews, IProductSEO };
declare const Product: mongoose.Model<unknown, unknown, unknown, unknown, mongoose.Document<unknown, unknown, unknown, unknown, unknown> & Omit<{
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}, never>, IProductDocument>;
export default Product;
//# sourceMappingURL=Product.d.ts.map