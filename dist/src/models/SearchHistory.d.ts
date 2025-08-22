import mongoose, { Document } from 'mongoose';
export interface ISearchFilters {
    category?: string;
    priceMin?: number;
    priceMax?: number;
    brand?: string;
    tags?: string[];
    inStock?: boolean;
    rating?: number;
    sortBy?: string;
}
export interface ISearchResults {
    totalResults: number;
    resultsShown: number;
    hasResults: boolean;
    topResultId?: mongoose.Types.ObjectId;
    clickedResults: mongoose.Types.ObjectId[];
}
export interface ISearchHistory extends Document {
    user?: mongoose.Types.ObjectId;
    anonymousId?: string;
    sessionId: string;
    query: string;
    normalizedQuery: string;
    queryType: 'text' | 'voice' | 'barcode' | 'image';
    searchedAt: Date;
    source: string;
    filters: ISearchFilters;
    results: ISearchResults;
    selectedResultPosition?: number;
    timeSpentOnResults?: number;
    refinedSearch: boolean;
    followUpQueries: mongoose.Types.ObjectId[];
    location?: {
        country?: string;
        timezone?: string;
    };
    device?: {
        platform: string;
        isMobile: boolean;
    };
    isSuccessful: boolean;
    conversionValue?: number;
    isAnonymized: boolean;
    createdAt: Date;
}
declare const _default: mongoose.Model<ISearchHistory, {}, {}, {}, mongoose.Document<unknown, {}, ISearchHistory, {}, {}> & ISearchHistory & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=SearchHistory.d.ts.map