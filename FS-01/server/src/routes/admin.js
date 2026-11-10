import { Router } from 'express';
import { z } from 'zod';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { destroyUserSessions, requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { reindexAll, reindexVendorProducts } from '../lib/search.js';
import { payVendor } from '../lib/orders.js';
import { sendMail, templates } from '../lib/mail.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const PAID = ['placed', 'packed', 'shipped', 'delivered'];

router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const days = Math.min(365, Number(req.query.days) || 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const paid = { status: { $in: PAID } };

    const [totals, daily, topVendors, topProducts, byStatus, categories, counts] = await Promise.all([
      Order.aggregate([
        { $match: paid },
        {
          $group: {
            _id: null,
            gmv: { $sum: '$total' },
            commission: { $sum: '$commission' },
            payouts: { $sum: '$vendorPayout' },
            discounts: { $sum: '$discount' },
            refunds: { $sum: '$refundedTotal' },
            orders: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate([
        { $match: { ...paid, createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            gmv: { $sum: '$total' },
            commission: { $sum: '$commission' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: paid },
        { $group: { _id: '$vendor', gmv: { $sum: '$total' }, orders: { $sum: 1 } } },
        { $sort: { gmv: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'vendor' } },
        { $project: { gmv: 1, orders: 1, storeName: { $first: '$vendor.storeName' } } },
      ]),
      Order.aggregate([
        { $match: paid },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            title: { $first: '$items.title' },
            units: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          },
        },
        { $sort: { units: -1 } },
        { $limit: 5 },
      ]),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Promise.all([
        User.countDocuments({ role: 'customer' }),
        Vendor.countDocuments({ status: 'approved' }),
        Vendor.countDocuments({ status: 'pending' }),
        Product.countDocuments({ isActive: true }),
      ]),
    ]);

    const t = totals[0] || { gmv: 0, commission: 0, payouts: 0, discounts: 0, refunds: 0, orders: 0 };
    res.json({
      totals: { ...t, avgOrderValue: t.orders ? Math.round((t.gmv / t.orders) * 100) / 100 : 0 },
      daily: daily.map((d) => ({ date: d._id, gmv: d.gmv, commission: d.commission, orders: d.orders })),
      topVendors,
      topProducts,
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      categories: categories.map((c) => ({ category: c._id, count: c.count })),
      counts: { customers: counts[0], vendors: counts[1], pendingVendors: counts[2], products: counts[3] },
    });
  }),
);

router.get(
  '/vendors',
  asyncHandler(async (req, res) => {
    const filter = req.query.status ? { status: req.query.status } : {};
    const items = await Vendor.find(filter).sort({ createdAt: -1 }).populate('owner', 'name email');
    res.json({ items });
  }),
);

router.patch(
  '/vendors/:id',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        status: z.enum(['pending', 'approved', 'suspended']).optional(),
        commissionRate: z.coerce.number().min(0).max(0.5).nullable().optional(),
      })
      .parse(req.body);
    const before = await Vendor.findById(req.params.id);
    if (!before) throw new HttpError(404, 'Vendor not found');
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, data, { returnDocument: 'after' });
    if (before.status === 'pending' && vendor.status === 'approved') {
      const owner = await User.findById(vendor.owner);
      if (owner) await sendMail(owner.email, templates.storeApproved(owner, vendor));
    }
    // approving or suspending changes which products are searchable
    if (data.status) await reindexVendorProducts(vendor._id);
    res.json({ vendor });
  }),
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const filter = req.query.role ? { role: req.query.role } : {};
    const items = await User.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ items });
  }),
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    if (req.params.id === req.user.id) throw new HttpError(400, "You can't disable yourself");
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { returnDocument: 'after' });
    if (!user) throw new HttpError(404, 'User not found');
    if (!isActive) await destroyUserSessions(user._id.toString());
    res.json({ user });
  }),
);

// vendor payouts that haven't gone through yet
router.get(
  '/payouts',
  asyncHandler(async (req, res) => {
    const status = z.enum(['failed', 'pending', 'paid', 'skipped']).catch('failed').parse(req.query.status);
    const items = await Order.find({ 'payment.transferStatus': status })
      .sort({ updatedAt: -1 })
      .limit(100)
      .populate('vendor', 'storeName stripeAccountId');
    res.json({ items });
  }),
);

router.post(
  '/orders/:id/retry-payout',
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.payment?.transferStatus !== 'failed') throw new HttpError(400, 'This payout has not failed');
    res.json({ order: await payVendor(order) });
  }),
);

router.post(
  '/search/reindex',
  asyncHandler(async (_req, res) => {
    const count = await reindexAll();
    res.json({ indexed: count });
  }),
);

export default router;
