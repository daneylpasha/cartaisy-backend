import Product, { IProductDocument } from '../models/Product';

export const findStoreProductById = async (
  productId: string,
  storeId: string
): Promise<IProductDocument | null> => {
  return Product.findOne({ _id: productId, storeId }) as Promise<IProductDocument | null>;
};
