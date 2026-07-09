import shopifyStorefront from './shopifyStorefrontService';

export interface ShopifyCollectionReference {
  collectionId: unknown;
  field: string;
}

export class HomeModuleShopifyValidationError extends Error {
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'HomeModuleShopifyValidationError';
  }
}

const normalizeStoreId = (storeId: unknown): string => {
  if (storeId && typeof (storeId as { toString?: () => string }).toString === 'function') {
    return (storeId as { toString: () => string }).toString();
  }

  return '';
};

export const validateHomeModuleCollectionReferences = async (
  storeId: unknown,
  references: ShopifyCollectionReference[]
): Promise<void> => {
  const normalizedStoreId = normalizeStoreId(storeId);
  const uniqueReferences = new Map<string, ShopifyCollectionReference>();

  for (const reference of references) {
    if (reference.collectionId === undefined || reference.collectionId === null) {
      throw new HomeModuleShopifyValidationError(
        `Invalid Shopify collection ID at ${reference.field}`
      );
    }

    const collectionId = String(reference.collectionId).trim();
    if (!collectionId) {
      throw new HomeModuleShopifyValidationError(
        `Invalid Shopify collection ID at ${reference.field}`
      );
    }

    if (!uniqueReferences.has(collectionId)) {
      uniqueReferences.set(collectionId, { collectionId, field: reference.field });
    }
  }

  if (uniqueReferences.size === 0) {
    return;
  }

  try {
    const storefrontClient = await shopifyStorefront.getStorefrontClientForStore(normalizedStoreId);

    for (const reference of uniqueReferences.values()) {
      const collectionId = reference.collectionId as string;
      const response = await shopifyStorefront.getCollectionByIdWithClient(
        storefrontClient,
        collectionId,
        1
      ) as any;

      if (response.errors?.length || !response.data?.collection) {
        throw new HomeModuleShopifyValidationError(
          `Invalid Shopify collection ID at ${reference.field}`
        );
      }
    }
  } catch (error) {
    if (error instanceof HomeModuleShopifyValidationError) {
      throw error;
    }

    throw new HomeModuleShopifyValidationError(
      'Unable to validate Shopify collection IDs for this store'
    );
  }
};

export const singleCollectionReference = (
  collectionId: unknown,
  field: string
): ShopifyCollectionReference[] => [{ collectionId, field }];

export const collectionArrayReferences = (
  collections: unknown,
  field: string
): ShopifyCollectionReference[] => {
  if (!Array.isArray(collections)) {
    throw new HomeModuleShopifyValidationError(`Invalid Shopify collection ID at ${field}`);
  }

  return collections.map((collection, index) => ({
    collectionId: (collection as { collectionId?: unknown })?.collectionId,
    field: `${field}[${index}].collectionId`,
  }));
};
