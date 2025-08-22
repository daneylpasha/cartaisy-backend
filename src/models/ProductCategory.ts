import mongoose, { Document, Schema } from 'mongoose';

export interface ICategoryDisplay {
  icon?: string; // Icon name or URL
  color?: string; // Hex color code
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
  // Basic information
  name: string;
  description?: string;
  handle: string;
  
  // Hierarchy
  parent?: mongoose.Types.ObjectId;
  children: mongoose.Types.ObjectId[];
  level: number; // 0 for root categories
  path: string; // Full path like "clothing/mens/shirts"
  
  // Display settings
  display: ICategoryDisplay;
  
  // SEO optimization
  seo: ICategorySEO;
  
  // Status and visibility
  isActive: boolean;
  isVisible: boolean;
  
  // Analytics
  analytics: ICategoryAnalytics;
  
  // Mobile-specific
  showInMobileApp: boolean;
  mobileIcon?: string;
  mobileBadge?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  getFullPath(): string;
  getAllChildren(): Promise<IProductCategory[]>;
  getAllParents(): Promise<IProductCategory[]>;
  updateProductCount(): Promise<void>;
}

const CategoryDisplaySchema = new Schema({
  icon: String,
  color: { 
    type: String, 
    match: /^#[0-9A-F]{6}$/i,
    default: '#4CAF50'
  },
  bannerImage: String,
  description: { type: String, maxlength: 500 },
  featuredProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  showInNavigation: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { _id: false });

const CategorySEOSchema = new Schema({
  metaTitle: { type: String, maxlength: 60 },
  metaDescription: { type: String, maxlength: 160 },
  keywords: [{ type: String, lowercase: true }],
  slug: { type: String, required: true, unique: true, lowercase: true },
  canonicalUrl: String
}, { _id: false });

const CategoryAnalyticsSchema = new Schema({
  viewCount: { type: Number, default: 0 },
  productCount: { type: Number, default: 0 },
  conversionRate: { type: Number, default: 0, min: 0, max: 1 },
  popularityScore: { type: Number, default: 0 },
  lastViewedAt: Date
}, { _id: false });

const ProductCategorySchema = new Schema({
  // Basic information
  name: { 
    type: String, 
    required: true, 
    maxlength: 100,
    trim: true
  },
  description: { 
    type: String, 
    maxlength: 1000,
    trim: true
  },
  handle: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    trim: true
  },
  
  // Hierarchy
  parent: { 
    type: Schema.Types.ObjectId, 
    ref: 'ProductCategory',
    default: null,
    index: true
  },
  children: [{ type: Schema.Types.ObjectId, ref: 'ProductCategory' }],
  level: { 
    type: Number, 
    default: 0, 
    min: 0,
    index: true
  },
  path: { 
    type: String, 
    required: true,
    index: true
  },
  
  // Display settings
  display: CategoryDisplaySchema,
  
  // SEO
  seo: CategorySEOSchema,
  
  // Status
  isActive: { type: Boolean, default: true, index: true },
  isVisible: { type: Boolean, default: true, index: true },
  
  // Analytics
  analytics: CategoryAnalyticsSchema,
  
  // Mobile-specific
  showInMobileApp: { type: Boolean, default: true, index: true },
  mobileIcon: String,
  mobileBadge: { type: String, maxlength: 20 }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
ProductCategorySchema.index({ handle: 1 });
ProductCategorySchema.index({ 'seo.slug': 1 });
ProductCategorySchema.index({ parent: 1, level: 1 });
ProductCategorySchema.index({ isActive: 1, isVisible: 1, 'display.sortOrder': 1 });
ProductCategorySchema.index({ path: 1 });
ProductCategorySchema.index({ 'analytics.popularityScore': -1 });

// Text search
ProductCategorySchema.index({
  name: 'text',
  description: 'text',
  'seo.keywords': 'text'
}, {
  weights: {
    name: 10,
    'seo.keywords': 5,
    description: 1
  }
});

// Virtual for breadcrumb path
ProductCategorySchema.virtual('breadcrumb').get(function() {
  return this.path.split('/').filter(p => p.length > 0);
});

// Virtual for hasChildren
ProductCategorySchema.virtual('hasChildren').get(function() {
  return this.children && this.children.length > 0;
});

// Methods
ProductCategorySchema.methods.getFullPath = function(): string {
  return this.path;
};

ProductCategorySchema.methods.getAllChildren = async function(): Promise<IProductCategory[]> {
  const Category = this.constructor as mongoose.Model<IProductCategory>;
  
  // Get all categories that have this category in their path
  const pathPattern = new RegExp(`^${this.path}/`);
  return await Category.find({
    path: pathPattern,
    isActive: true
  }).sort({ level: 1, 'display.sortOrder': 1 });
};

ProductCategorySchema.methods.getAllParents = async function(): Promise<IProductCategory[]> {
  const Category = this.constructor as mongoose.Model<IProductCategory>;
  
  if (!this.parent) {
    return [];
  }
  
  const parents: IProductCategory[] = [];
  let currentPath = this.path;
  
  while (currentPath.includes('/')) {
    currentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
    const parent = await Category.findOne({ path: currentPath });
    if (parent) {
      parents.unshift(parent);
    }
  }
  
  return parents;
};

ProductCategorySchema.methods.updateProductCount = async function(): Promise<void> {
  const Product = mongoose.model('Product');
  
  // Count products in this category and all child categories
  const childCategories = await this.getAllChildren();
  const categoryIds = [this._id, ...childCategories.map(cat => cat._id)];
  
  const count = await Product.countDocuments({
    category: { $in: categoryIds },
    status: 'active',
    availableForSale: true
  });
  
  this.analytics.productCount = count;
  await this.save();
};

// Pre-save hooks
ProductCategorySchema.pre('save', async function(next) {
  // Auto-generate handle from name if not set
  if (!this.handle && this.name) {
    this.handle = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  
  // Auto-generate SEO slug from handle if not set
  if (!this.seo.slug && this.handle) {
    this.seo.slug = this.handle;
  }
  
  // Update path based on parent
  if (this.parent && this.isModified('parent')) {
    try {
      const parent = await this.constructor.findById(this.parent) as IProductCategory;
      if (parent) {
        this.level = parent.level + 1;
        this.path = `${parent.path}/${this.handle}`;
      }
    } catch (error) {
      console.error('Error updating category path:', error);
    }
  } else if (!this.parent) {
    this.level = 0;
    this.path = this.handle;
  }
  
  next();
});

// Post-save hook to update parent's children array
ProductCategorySchema.post('save', async function() {
  if (this.parent && this.isNew) {
    try {
      await this.constructor.findByIdAndUpdate(this.parent, {
        $addToSet: { children: this._id }
      });
    } catch (error) {
      console.error('Error updating parent category children:', error);
    }
  }
});

// Pre-remove hook to handle category deletion
ProductCategorySchema.pre('deleteOne', { document: true, query: false }, async function() {
  try {
    // Remove from parent's children array
    if (this.parent) {
      await this.constructor.findByIdAndUpdate(this.parent, {
        $pull: { children: this._id }
      });
    }
    
    // Update children to have no parent (move to root level)
    await this.constructor.updateMany(
      { parent: this._id },
      { $unset: { parent: 1 }, level: 0 }
    );
    
    // Update products in this category to have no category
    const Product = mongoose.model('Product');
    await Product.updateMany(
      { category: this._id },
      { $unset: { category: 1 } }
    );
  } catch (error) {
    console.error('Error in category pre-remove hook:', error);
  }
});

export default mongoose.model<IProductCategory>('ProductCategory', ProductCategorySchema);