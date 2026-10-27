import { Router } from 'express';
import { z } from 'zod';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import { requireAuth, requireRole, requireVendor } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { advanceOrder, cancelOrder, checkout, completePayment } from '../lib/orders.js';
import { providerName } from '../lib/payments.js';
import { writeInvoice } from '../lib/invoice.js';

const router = Router();
router.use(requireAuth);

const checkoutSchema = z.object({
  couponCode: z.string().trim().max(40).optional().or(z.literal('').transform(() => undefined)),
  shippingAddress: z.object({
    line1: z.string().min(1),
    city: z.string().min(1),
    state: z.string().optional(),
    postalCode: z.string().min(1),
    country: z.string().min(2),
  }),
});

router.post(
  '/checkout',
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const data = checkoutSchema.parse(req.body);
    const result = await checkout(req.user, data);
    res.status(201).json(result);
  }),
);

// The client calls this after Stripe confirms the card (or straight away in mock mode).
// The webhook does the same thing, whichever arrives first wins.
router.post(
  '/confirm/:paymentGroup',
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const owns = await Order.exists({ paymentGroup: req.params.paymentGroup, customer: req.user.id });
    if (!owns) throw new HttpError(404, 'Checkout not found');
    const orders = await completePayment(req.params.paymentGroup);
    res.json({ orders, provider: providerName() });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.user.role === 'customer') filter.customer = req.user.id;
    else if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ owner: req.user.id });
      if (!vendor) return res.json({ items: [] });
      filter.vendor = vendor._id;
      filter.status = { $ne: 'pending_payment' };
    }
    if (req.query.status) filter.status = req.query.status;

    const items = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('vendor', 'storeName slug')
      .populate('customer', 'name email');
    res.json({ items });
  }),
);

async function loadOrder(req) {
  const order = await Order.findById(req.params.id)
    .populate('vendor', 'storeName slug owner')
    .populate('customer', 'name email');
  if (!order) throw new HttpError(404, 'Order not found');

  const { role, id } = req.user;
  const allowed =
    role === 'admin' ||
    (role === 'customer' && order.customer._id.toString() === id) ||
    (role === 'vendor' && order.vendor.owner.toString() === id);
  if (!allowed) throw new HttpError(404, 'Order not found');
  return order;
}

router.get(
  '/:id',
  asyncHandler(async (req, res) => res.json({ order: await loadOrder(req) })),
);

router.patch(
  '/:id/status',
  requireVendor(),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['packed', 'shipped', 'delivered', 'cancelled']) }).parse(req.body);
    const order = await loadOrder(req);
    if (status === 'cancelled') {
      if (!['placed', 'packed'].includes(order.status)) {
        throw new HttpError(400, 'Only orders that have not shipped can be cancelled');
      }
      return res.json({ order: await cancelOrder(order) });
    }
    res.json({ order: await advanceOrder(order, status) });
  }),
);

router.post(
  '/:id/cancel',
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const order = await loadOrder(req);
    if (order.status !== 'placed') throw new HttpError(400, 'This order can no longer be cancelled');
    res.json({ order: await cancelOrder(order) });
  }),
);

router.get(
  '/:id/invoice',
  asyncHandler(async (req, res) => {
    const order = await loadOrder(req);
    if (order.status === 'pending_payment') throw new HttpError(400, 'Order has not been paid');
    const customer = await User.findById(order.customer._id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${order.orderNumber}.pdf"`);
    writeInvoice(res, { order, vendor: order.vendor, customer });
  }),
);

export default router;
