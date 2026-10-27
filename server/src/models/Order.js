import mongoose from 'mongoose';

export const ORDER_FLOW = ['placed', 'packed', 'shipped', 'delivered'];
export const ORDER_STATUSES = ['pending_payment', ...ORDER_FLOW, 'cancelled'];

const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    title: String,
    image: String,
    price: Number,
    quantity: { type: Number, min: 1 },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    // one checkout makes one order per vendor, all sharing a paymentGroup
    paymentGroup: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    items: [itemSchema],
    subtotal: Number,
    discount: { type: Number, default: 0 },
    total: Number,
    commissionRate: Number,
    commission: Number,
    vendorPayout: Number,
    couponCode: String,
    shippingAddress: {
      line1: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending_payment', index: true },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now }, _id: false }],
    payment: {
      provider: String,
      intentId: String,
      transferId: String,
      paidAt: Date,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Order', orderSchema);
