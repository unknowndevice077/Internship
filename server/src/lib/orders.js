import Order, { ORDER_FLOW } from '../models/Order.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import Coupon from '../models/Coupon.js';
import config from '../config.js';
import { HttpError } from '../middleware/error.js';
import { clearCart, getCart } from './cart.js';
import { applyCoupon } from './coupons.js';
import { createPaymentIntent, getPaymentIntent, refundPayment, round2, transferToVendor } from './payments.js';
import { getRedis } from './redis.js';

const orderNumber = () =>
  `VD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/**
 * Turns the customer's cart into one pending order per vendor plus a single
 * payment intent for the whole amount.
 */
export async function checkout(user, { couponCode, shippingAddress }) {
  const cart = await getCart(user.id);
  if (!cart.items.length) throw new HttpError(400, 'Your cart is empty');
  const bad = cart.items.find((i) => !i.available);
  if (bad) throw new HttpError(400, `"${bad.title}" is out of stock or unavailable`);

  const groups = new Map();
  for (const item of cart.items) {
    if (!groups.has(item.vendorId)) groups.set(item.vendorId, []);
    groups.get(item.vendorId).push(item);
  }
  const subtotals = new Map(
    [...groups].map(([id, items]) => [id, round2(items.reduce((s, i) => s + i.price * i.quantity, 0))]),
  );
  const { coupon, discounts } = await applyCoupon(couponCode, subtotals);

  const vendors = await Vendor.find({ _id: { $in: [...groups.keys()] } });
  const vendorById = new Map(vendors.map((v) => [v._id.toString(), v]));
  const paymentGroup = `grp_${crypto.randomUUID().replaceAll('-', '')}`;

  const docs = [...groups].map(([vendorId, items]) => {
    const subtotal = subtotals.get(vendorId);
    const discount = discounts.get(vendorId) || 0;
    const total = round2(subtotal - discount);
    const rate = vendorById.get(vendorId)?.commissionRate ?? config.commissionRate;
    const commission = round2(total * rate);
    return {
      paymentGroup,
      orderNumber: orderNumber(),
      customer: user.id,
      vendor: vendorId,
      items: items.map((i) => ({
        product: i.productId,
        title: i.title,
        image: i.image,
        price: i.price,
        quantity: i.quantity,
      })),
      subtotal,
      discount,
      total,
      commissionRate: rate,
      commission,
      vendorPayout: round2(total - commission),
      couponCode: coupon?.code,
      shippingAddress,
      status: 'pending_payment',
      statusHistory: [{ status: 'pending_payment' }],
    };
  });

  const amount = round2(docs.reduce((s, o) => s + o.total, 0));
  if (amount < 0.5) throw new HttpError(400, 'Order total is too small to charge');

  const intent = await createPaymentIntent({ amount, paymentGroup, customerId: user.id });
  const orders = await Order.insertMany(
    docs.map((d) => ({ ...d, payment: { provider: intent.provider, intentId: intent.id } })),
  );

  return { paymentGroup, amount, provider: intent.provider, clientSecret: intent.clientSecret, orders };
}

/**
 * Runs once the payment succeeds (webhook or confirm call). Safe to call twice:
 * only orders still in pending_payment are touched.
 */
export async function completePayment(paymentGroup) {
  const pending = await Order.find({ paymentGroup, status: 'pending_payment' });
  if (!pending.length) return Order.find({ paymentGroup });

  const intent = await getPaymentIntent(pending[0].payment.intentId);
  if (intent.status !== 'succeeded') throw new HttpError(402, 'Payment has not gone through yet');
  const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;

  for (const order of pending) {
    // claim the order first so a parallel webhook can't double process it
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, status: 'pending_payment' },
      { status: 'placed', $push: { statusHistory: { status: 'placed' } }, 'payment.paidAt': new Date() },
      { returnDocument: 'after' },
    );
    if (!claimed) continue;

    const reserved = await reserveStock(claimed.items);
    if (!reserved) {
      await cancelOrder(claimed, 'cancelled', { restock: false });
      continue;
    }

    const vendor = await Vendor.findById(claimed.vendor);
    try {
      const transfer = await transferToVendor({
        amount: claimed.vendorPayout,
        accountId: vendor?.stripeAccountId,
        paymentGroup,
        chargeId,
        orderId: claimed._id,
      });
      claimed.payment.transferId = transfer.id;
      await claimed.save();
    } catch (err) {
      // the order is still valid; an admin can retry the payout later
      console.warn(`transfer failed for ${claimed.orderNumber}:`, err.message);
    }
  }

  const code = pending[0].couponCode;
  if (code) await Coupon.updateOne({ code }, { $inc: { usedCount: 1 } });
  await clearCart(pending[0].customer.toString());
  await bustProductCache(pending.flatMap((o) => o.items.map((i) => i.product)));

  return Order.find({ paymentGroup });
}

// decrements stock for every item, or rolls back and returns false if anything ran out
async function reserveStock(items) {
  const done = [];
  for (const item of items) {
    const res = await Product.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
    );
    if (!res.modifiedCount) {
      await Promise.all(done.map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.quantity } })));
      return false;
    }
    done.push(item);
  }
  return true;
}

async function bustProductCache(ids) {
  if (ids.length) await getRedis().del(...ids.map((id) => `product:${id}`));
}

export async function cancelOrder(order, status = 'cancelled', { restock = true } = {}) {
  if (restock) {
    await Promise.all(
      order.items.map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.quantity } })),
    );
    await bustProductCache(order.items.map((i) => i.product));
  }
  if (order.payment?.paidAt) {
    await refundPayment(order.payment.intentId, order.total);
  }
  order.status = status;
  order.statusHistory.push({ status });
  await order.save();
  return order;
}

// vendors move an order one step forward: placed -> packed -> shipped -> delivered
export async function advanceOrder(order, next) {
  const from = ORDER_FLOW.indexOf(order.status);
  const to = ORDER_FLOW.indexOf(next);
  if (from === -1 || to !== from + 1) {
    throw new HttpError(400, `Can't move an order from "${order.status}" to "${next}"`);
  }
  order.status = next;
  order.statusHistory.push({ status: next });
  await order.save();
  return order;
}
