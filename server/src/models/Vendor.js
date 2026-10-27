import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    storeName: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: String,
    logoUrl: String,
    // pending -> approved by an admin before products go live
    status: { type: String, enum: ['pending', 'approved', 'suspended'], default: 'pending' },
    // overrides the platform default when set
    commissionRate: { type: Number, min: 0, max: 1 },
    stripeAccountId: String,
    payoutsEnabled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model('Vendor', vendorSchema);
