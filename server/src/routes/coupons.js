import { Router } from 'express';
import { z } from 'zod';
import Coupon from '../models/Coupon.js';
import Vendor from '../models/Vendor.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { applyCoupon } from '../lib/coupons.js';
import { getCart } from '../lib/cart.js';
import { round2 } from '../lib/payments.js';

const router = Router();
router.use(requireAuth);

// customer preview: what would this code take off my current cart?
router.post(
  '/validate',
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(1) }).parse(req.body);
    const cart = await getCart(req.user.id);
    const groups = new Map();
    for (const i of cart.items.filter((x) => x.available)) {
      groups.set(i.vendorId, round2((groups.get(i.vendorId) || 0) + i.price * i.quantity));
    }
    const { coupon, discounts } = await applyCoupon(code, groups);
    const discount = round2([...discounts.values()].reduce((a, b) => a + b, 0));
    res.json({ code: coupon.code, discount, total: round2(cart.subtotal - discount) });
  }),
);

const couponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  type: z.enum(['percent', 'fixed']),
  value: z.coerce.number().positive(),
  minOrder: z.coerce.number().min(0).default(0),
  maxUses: z.coerce.number().int().min(0).default(0),
  expiresAt: z.coerce.date().optional(),
  isActive: z.boolean().default(true),
});

// admins manage platform coupons, vendors manage their own store's coupons
async function scope(req) {
  if (req.user.role === 'admin') return {};
  if (req.user.role !== 'vendor') throw new HttpError(403, 'Not allowed');
  const vendor = await Vendor.findOne({ owner: req.user.id });
  if (!vendor) throw new HttpError(403, 'Finish vendor onboarding first');
  return { vendor: vendor._id };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await Coupon.find(await scope(req)).sort({ createdAt: -1 });
    res.json({ items });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const filter = await scope(req);
    const data = couponSchema.parse(req.body);
    if (data.type === 'percent' && data.value > 90) throw new HttpError(400, 'Percent coupons max out at 90%');
    const coupon = await Coupon.create({ ...data, vendor: filter.vendor ?? null });
    res.status(201).json({ coupon });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const coupon = await Coupon.findOneAndUpdate(
      { _id: req.params.id, ...(await scope(req)) },
      couponSchema.partial().parse(req.body),
      { returnDocument: 'after' },
    );
    if (!coupon) throw new HttpError(404, 'Coupon not found');
    res.json({ coupon });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await Coupon.deleteOne({ _id: req.params.id, ...(await scope(req)) });
    if (!result.deletedCount) throw new HttpError(404, 'Coupon not found');
    res.status(204).end();
  }),
);

export default router;
