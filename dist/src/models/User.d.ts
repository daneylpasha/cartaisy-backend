import mongoose from 'mongoose';
import { IUser, IAddress, IUserPreferences, IUserProfile, IMarketing, MongooseDocument } from '../types/index';
export interface IUserDocument extends MongooseDocument<IUser> {
    comparePassword(candidatePassword: string): Promise<boolean>;
    createPasswordResetToken(): string;
    createEmailVerificationToken(): string;
    updateLastLogin(): Promise<void>;
    addAddress(address: Omit<IAddress, 'isDefault'>): void;
    updateAddress(index: number, updates: Partial<IAddress>): boolean;
    removeAddress(index: number): boolean;
    setDefaultAddress(index: number): boolean;
}
export interface IUserModel extends mongoose.Model<IUserDocument> {
    findByEmail(email: string): mongoose.Query<IUserDocument | null, IUserDocument>;
    findByEmailWithPassword(email: string): mongoose.Query<IUserDocument | null, IUserDocument>;
    findByPasswordResetToken(token: string): mongoose.Query<IUserDocument | null, IUserDocument>;
    findByEmailVerificationToken(token: string): mongoose.Query<IUserDocument | null, IUserDocument>;
}
export type { IUser, IAddress, IUserPreferences, IUserProfile, IMarketing };
declare const User: IUserModel;
export default User;
//# sourceMappingURL=User.d.ts.map