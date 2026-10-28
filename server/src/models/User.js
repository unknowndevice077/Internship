import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['customer', 'vendor', 'admin'];

const addressSchema = new mongoose.Schema(
  {
    line1: String,
    city: String,
    state: String,
    postalCode: String,
    country: { type: String, default: 'US' },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'customer' },
    address: addressSchema,
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword() {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

userSchema.methods.checkPassword = function checkPassword(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
