import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, required: true, index: true },
    brand: String,
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    images: [String],
    tags: [String],
    isActive: { type: Boolean, default: true },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// used by the Mongo search fallback when Elasticsearch isn't configured
productSchema.index({ title: 'text', description: 'text', brand: 'text', tags: 'text' });

export default mongoose.model('Product', productSchema);
