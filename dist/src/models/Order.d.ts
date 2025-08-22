import mongoose from 'mongoose';
import { IOrder, IOrderLineItem, IOrderAddress, IOrderShipping, IOrderNotification, IOrderRating, ISupportTicket, IReturnExchange, MongooseDocument } from '../types/index';
export interface IOrderDocument extends MongooseDocument<IOrder> {
    updateMobileStatus(status: string, note?: string, location?: string): Promise<void>;
    sendNotification(type: 'push' | 'email' | 'sms', title: string, message: string): Promise<void>;
    canBeCancelled(): boolean;
    canBeReturned(): boolean;
    getTotalWeight(): number;
}
export interface IOrderModel extends mongoose.Model<IOrderDocument> {
    findByUser(userId: string, options?: {
        limit?: number;
        skip?: number;
        status?: string;
    }): mongoose.Query<IOrderDocument[], IOrderDocument>;
    findByTrackingNumber(trackingNumber: string): mongoose.Query<IOrderDocument | null, IOrderDocument>;
    findRequiringAttention(): mongoose.Query<IOrderDocument[], IOrderDocument>;
}
export type { IOrder, IOrderLineItem, IOrderAddress, IOrderShipping, IOrderNotification, IOrderRating, ISupportTicket, IReturnExchange };
declare const Order: IOrderModel;
export default Order;
//# sourceMappingURL=Order.d.ts.map