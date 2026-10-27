import { Router } from 'express';
import { z } from 'zod';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { requireAuth, requireRole, requireVendor } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { createConnectAccount, createOnboardingLink, getAccountStatus } from '../lib/payments.js';

const router = Router();

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const storeSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  description: z.string().max(1000).optional(),
  logoUrl: z.string().url().or(z.string().startsWith('/uploads/')).optional(),
});

// step 1 of onboarding: create the store profile
router.post(
  '/onboard',
  requireAuth,
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    if (await Vendor.exists({ owner: req.user.id })) {
      throw new HttpError(409, 'You already have a store');
    }
    const data = storeSchema.parse(req.body);
    let slug = slugify(data.storeName);
    if (await Vendor.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;
    const vendor = await Vendor.create({ ...data, slug, owner: req.user.id });
    res.status(201).json({ vendor });
  }),
);

router.get('/me', requireAuth, requireVendor(), (req, res) => res.json({ vendor: req.vendor }));

router.patch(
  '/me',
  requireAuth,
  requireVendor(),
  asyncHandler(async (req, res) => {
    const data = storeSchema.partial().parse(req.body);
    Object.assign(req.vendor, data);
    await req.vendor.save();
    res.json({ vendor: req.vendor });
  }),
);

// step 2: connect a Stripe Express account for payouts
router.post(
  '/me/payouts',
  requireAuth,
  requireVendor(),
  asyncHandler(async (req, res) => {
    const vendor = req.vendor;
    if (!vendor.stripeAccountId) {
      const user = await User.findById(req.user.id);
      const account = await createConnectAccount(vendor, user.email);
      vendor.stripeAccountId = account.id;
      if (account.mock) vendor.payoutsEnabled = true;
      await vendor.save();
    }
    const url = await createOnboardingLink(vendor.stripeAccountId);
    res.json({ url, vendor });
  }),
);

router.get(
  '/me/payouts',
  requireAuth,
  requireVendor(),
  asyncHandler(async (req, res) => {
    const vendor = req.vendor;
    if (vendor.stripeAccountId) {
      const { payoutsEnabled } = await getAccountStatus(vendor.stripeAccountId);
      if (payoutsEnabled !== vendor.payoutsEnabled) {
        vendor.payoutsEnabled = payoutsEnabled;
        await vendor.save();
      }
    }
    res.json({ vendor });
  }),
);

router.get(
  '/me/stats',
  requireAuth,
  requireVendor(),
  asyncHandler(async (req, res) => {
    const vendorId = req.vendor._id;
    const [sales] = await Order.aggregate([
      { $match: { vendor: vendorId, status: { $in: ['placed', 'packed', 'shipped', 'delivered'] } } },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
          payout: { $sum: '$vendorPayout' },
          commission: { $sum: '$commission' },
        },
      },
    ]);
    const byStatus = await Order.aggregate([
      { $match: { vendor: vendorId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const products = await Product.countDocuments({ vendor: vendorId });
    const lowStock = await Product.find({ vendor: vendorId, stock: { $lte: 5 }, isActive: true })
      .select('title stock')
      .limit(10);
    res.json({
      sales: sales || { orders: 0, revenue: 0, payout: 0, commission: 0 },
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      products,
      lowStock,
    });
  }),
);

// public storefront
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const vendor = await Vendor.findOne({ slug: req.params.slug, status: 'approved' }).select(
      'storeName slug description logoUrl createdAt',
    );
    if (!vendor) throw new HttpError(404, 'Store not found');
    res.json({ vendor });
  }),
);

export default router;
