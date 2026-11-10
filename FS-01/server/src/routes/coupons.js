import { Router } from 'express';
import { z } from 'zod';
import Coupon from '../models/Coupon.js';
import Vendor from '../models/Vendor.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { publicQuote, quote } from '../lib/orders.js';

const router = Router();
router.use(requireAuth);

router.post(
  '/validate',
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(1) }).parse(req.body);
    res.json(publicQuote(await quote(req.user.id, code)));
  }),
);

const couponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  type: z.enum(['percent', 'fixed']),
  value: z.coerce.number().positive(),
  minOrder: z.coerce.number().min(0).optional(),
  maxUses: z.coerce.number().int().min(0).optional(),
  expiresAt: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
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
    if (data.type === 'percent' && data.value > 90)
      throw new HttpError(400, 'Percent coupons max out at 90%');
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
