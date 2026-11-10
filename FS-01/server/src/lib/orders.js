import Order, { ORDER_FLOW } from '../models/Order.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import Coupon from '../models/Coupon.js';
import User from '../models/User.js';
import config from '../config.js';
import { HttpError } from '../middleware/error.js';
import { clearCart, getCart } from './cart.js';
import { applyCoupon } from './coupons.js';
import {
  cancelPaymentIntent,
  createPaymentIntent,
  getPaymentIntent,
  providerName,
  refundPayment,
  reverseTransfer,
  round2,
  transferToVendor,
} from './payments.js';
import { getRedis } from './redis.js';
import { indexProduct } from './search.js';
import { sendMail, templates } from './mail.js';
import logger from './logger.js';

export const RESERVATION_MINUTES = 15;
const RETRY_DELAYS_MIN = [1, 5, 30, 120, 360];
export const MAX_TRANSFER_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;

const orderNumber = () =>
  `VD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export function shippingFor(vendor, subtotal) {
  if (!vendor?.shippingFee) return 0;
  if (vendor.freeShippingOver != null && subtotal >= vendor.freeShippingOver) return 0;
  return vendor.shippingFee;
}

// per-store breakdown of the cart: subtotal, coupon share, shipping and total
export async function quote(userId, couponCode) {
  const cart = await getCart(userId);
  const groups = new Map();
  for (const item of cart.items.filter((i) => i.available)) {
    if (!groups.has(item.vendorId)) groups.set(item.vendorId, []);
    groups.get(item.vendorId).push(item);
  }
  const subtotals = new Map(
    [...groups].map(([id, items]) => [id, round2(items.reduce((s, i) => s + i.price * i.quantity, 0))]),
  );
  const { coupon, discounts } = couponCode
    ? await applyCoupon(couponCode, subtotals)
    : { coupon: null, discounts: new Map() };

  const vendors = await Vendor.find({ _id: { $in: [...groups.keys()] } });
  const vendorById = new Map(vendors.map((v) => [v._id.toString(), v]));

  const stores = [...groups].map(([vendorId, items]) => {
    const vendor = vendorById.get(vendorId);
    const subtotal = subtotals.get(vendorId);
    const discount = discounts.get(vendorId) || 0;
    const shippingFee = shippingFor(vendor, subtotal);
    return {
      vendorId,
      vendorName: vendor?.storeName,
      vendor,
      items,
      subtotal,
      discount,
      shippingFee,
      total: round2(subtotal - discount + shippingFee),
      freeShippingOver: vendor?.shippingFee ? vendor.freeShippingOver : undefined,
    };
  });

  const sum = (key) => round2(stores.reduce((s, g) => s + g[key], 0));
  return {
    cart,
    coupon,
    stores,
    subtotal: sum('subtotal'),
    discount: sum('discount'),
    shipping: sum('shippingFee'),
    total: sum('total'),
  };
}

export const publicQuote = (q) => ({
  code: q.coupon?.code ?? null,
  subtotal: q.subtotal,
  discount: q.discount,
  shipping: q.shipping,
  total: q.total,
  stores: q.stores.map(({ vendor: _v, items: _i, ...rest }) => rest),
});

// one pending order per vendor, one payment intent for the whole cart.
// stock is taken here and held for RESERVATION_MINUTES so nobody pays for something that sold out
export async function checkout(user, { couponCode, shippingAddress }) {
  // a customer going back and checking out again shouldn't be blocked by their own old hold
  await expireReservations(new Date(8.64e15), { customer: user.id });

  const q = await quote(user.id, couponCode);
  if (!q.cart.items.length) throw new HttpError(400, 'Your cart is empty');
  const bad = q.cart.items.find((i) => !i.available);
  if (bad) throw new HttpError(400, `"${bad.title}" is out of stock or unavailable`);
  if (q.total < 0.5) throw new HttpError(400, 'Order total is too small to charge');

  const allItems = q.stores.flatMap((s) =>
    s.items.map((i) => ({ product: i.productId, quantity: i.quantity, title: i.title })),
  );
  const short = await reserveStock(allItems);
  if (short) throw new HttpError(409, `"${short.title}" just sold out, please update your cart`);

  const paymentGroup = `grp_${crypto.randomUUID().replaceAll('-', '')}`;
  const reservedUntil = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);

  const docs = q.stores.map((s) => {
    const rate = s.vendor?.commissionRate ?? config.commissionRate;
    // commission is on goods only, the vendor keeps the shipping fee
    const commission = round2((s.subtotal - s.discount) * rate);
    return {
      paymentGroup,
      orderNumber: orderNumber(),
      customer: user.id,
      vendor: s.vendorId,
      items: s.items.map((i) => ({
        product: i.productId,
        title: i.title,
        image: i.image,
        price: i.price,
        quantity: i.quantity,
      })),
      subtotal: s.subtotal,
      discount: s.discount,
      shippingFee: s.shippingFee,
      total: s.total,
      commissionRate: rate,
      commission,
      vendorPayout: round2(s.total - commission),
      couponCode: q.coupon?.code,
      shippingAddress,
      status: 'pending_payment',
      statusHistory: [{ status: 'pending_payment' }],
      reservedUntil,
    };
  });

  let intent;
  try {
    intent = await createPaymentIntent({ amount: q.total, paymentGroup, customerId: user.id });
  } catch (err) {
    await releaseStock(allItems);
    throw err;
  }
  const orders = await Order.insertMany(
    docs.map((d) => ({ ...d, payment: { provider: intent.provider, intentId: intent.id } })),
  );
  await syncProducts(allItems.map((i) => i.product));

  return {
    paymentGroup,
    amount: q.total,
    provider: intent.provider,
    clientSecret: intent.clientSecret,
    reservedUntil,
    orders,
  };
}

// webhook and confirm call both land here, only pending_payment orders get touched
export async function completePayment(paymentGroup) {
  const pending = await Order.find({ paymentGroup, status: 'pending_payment' });
  if (!pending.length) return Order.find({ paymentGroup });

  const intent = await getPaymentIntent(pending[0].payment.intentId);
  if (intent.status !== 'succeeded') throw new HttpError(402, 'Payment has not gone through yet');
  const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;

  const placed = [];
  for (const order of pending) {
    // claim the order first so a parallel webhook can't double process it
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, status: 'pending_payment' },
      {
        status: 'placed',
        $push: { statusHistory: { status: 'placed' } },
        $unset: { reservedUntil: 1 },
        'payment.paidAt': new Date(),
        'payment.chargeId': chargeId,
        'payment.transferStatus': 'pending',
      },
      { returnDocument: 'after' },
    );
    if (!claimed) continue;
    await payVendor(claimed, chargeId);
    placed.push(claimed);
  }

  if (placed.length) {
    const code = pending[0].couponCode;
    if (code) await Coupon.updateOne({ code }, { $inc: { usedCount: 1 } });
    await clearCart(pending[0].customer.toString());
    await notifyPlaced(placed);
  }
  return Order.find({ paymentGroup });
}

// sends the vendor their share; on failure schedules a retry with backoff
export async function payVendor(order, chargeId) {
  const vendor = await Vendor.findById(order.vendor);
  if (providerName() === 'stripe' && !vendor?.stripeAccountId) {
    order.payment.transferStatus = 'failed';
    order.payment.transferError = 'Vendor has no connected Stripe account';
    order.payment.nextTransferAt = nextRetryAt(order.payment.transferAttempts);
    await order.save();
    return order;
  }
  order.payment.transferAttempts = (order.payment.transferAttempts || 0) + 1;
  try {
    const transfer = await transferToVendor({
      amount: order.vendorPayout,
      accountId: vendor?.stripeAccountId,
      paymentGroup: order.paymentGroup,
      chargeId: chargeId ?? order.payment.chargeId,
      orderId: order._id,
    });
    order.payment.transferId = transfer.id;
    order.payment.transferStatus = 'paid';
    order.payment.transferError = undefined;
    order.payment.nextTransferAt = undefined;
  } catch (err) {
    logger.warn({ order: order.orderNumber, err: err.message }, 'vendor transfer failed');
    order.payment.transferStatus = 'failed';
    order.payment.transferError = err.message;
    order.payment.nextTransferAt = nextRetryAt(order.payment.transferAttempts);
  }
  await order.save();
  return order;
}

// null once we're out of automatic attempts, an admin can still retry by hand
function nextRetryAt(attempts) {
  const delay = RETRY_DELAYS_MIN[(attempts || 1) - 1];
  return delay ? new Date(Date.now() + delay * 60 * 1000) : undefined;
}

// returns the first item that didn't have enough stock (after rolling back), or null
async function reserveStock(items) {
  const done = [];
  for (const item of items) {
    const res = await Product.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
    );
    if (!res.modifiedCount) {
      await releaseStock(done);
      return item;
    }
    done.push(item);
  }
  return null;
}

async function releaseStock(items) {
  await Promise.all(items.map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.quantity } })));
}

// stock changed, so drop the cached page and push the new stock to search
async function syncProducts(ids) {
  if (!ids.length) return;
  await getRedis().del(...ids.map((id) => `product:${id}`));
  const products = await Product.find({ _id: { $in: ids } });
  await Promise.all(products.map(indexProduct));
}

// unpaid checkouts past their reservation give their stock back
export async function expireReservations(now = new Date(), filter = {}) {
  const stale = await Order.find({ ...filter, status: 'pending_payment', reservedUntil: { $lte: now } });
  const groups = [...new Set(stale.map((o) => o.paymentGroup))];
  let expired = 0;
  for (const group of groups) {
    const orders = stale.filter((o) => o.paymentGroup === group);
    if (orders[0].payment.provider === 'stripe') {
      // the card might have gone through after all, in which case finish the order instead
      const intent = await getPaymentIntent(orders[0].payment.intentId);
      if (intent.status === 'succeeded') {
        await completePayment(group);
        continue;
      }
      await cancelPaymentIntent(orders[0].payment.intentId);
    }
    for (const order of orders) {
      const res = await Order.updateOne(
        { _id: order._id, status: 'pending_payment' },
        {
          status: 'cancelled',
          $push: { statusHistory: { status: 'cancelled' } },
          $unset: { reservedUntil: 1 },
        },
      );
      if (res.modifiedCount) {
        await releaseStock(order.items);
        await syncProducts(order.items.map((i) => i.product));
        expired += 1;
      }
    }
  }
  return expired;
}

export async function retryFailedTransfers(now = new Date()) {
  const due = await Order.find({
    'payment.transferStatus': 'failed',
    'payment.nextTransferAt': { $lte: now },
    status: { $ne: 'cancelled' },
  }).limit(50);
  for (const order of due) await payVendor(order);
  return due.length;
}

const refundable = (order) => round2(order.total - order.refundedTotal);

async function refundAndReverse(order, amount, vendorShare) {
  const refund = await refundPayment(order.payment.intentId, amount);
  if (order.payment.transferStatus === 'paid' && vendorShare > 0) {
    await reverseTransfer(order.payment.transferId, vendorShare);
  }
  return refund;
}

export async function cancelOrder(order, status = 'cancelled', { restock = true } = {}) {
  const open = order.items
    .map((i) => ({ product: i.product, quantity: i.quantity - (i.refundedQuantity || 0) }))
    .filter((i) => i.quantity > 0);
  if (restock) {
    await releaseStock(open);
    await syncProducts(open.map((i) => i.product));
  }
  if (order.payment?.paidAt) {
    const amount = refundable(order);
    if (amount > 0) {
      const vendorShare = round2(amount * (order.vendorPayout / order.total));
      await refundAndReverse(order, amount, vendorShare);
      order.refundedTotal = round2(order.refundedTotal + amount);
    }
    // nothing left to pay out for a cancelled order
    if (order.payment.transferStatus === 'failed') order.payment.transferStatus = 'skipped';
  }
  order.status = status;
  order.statusHistory.push({ status });
  await order.save();
  return order;
}

// vendor refunds some units; the coupon discount is shared out by line value, shipping isn't refunded
export async function refundItems(order, lines, reason) {
  if (!ORDER_FLOW.includes(order.status)) throw new HttpError(400, 'Only paid orders can be refunded');

  let goods = 0;
  const applied = [];
  for (const line of lines) {
    const item = order.items.find((i) => i.product.toString() === line.product);
    if (!item) throw new HttpError(400, 'That product is not in this order');
    const left = item.quantity - (item.refundedQuantity || 0);
    if (line.quantity > left) throw new HttpError(400, `Only ${left} of "${item.title}" can be refunded`);
    goods += item.price * line.quantity;
    applied.push({ item, quantity: line.quantity });
  }

  const share = order.subtotal ? goods / order.subtotal : 0;
  const amount = Math.min(round2(goods - order.discount * share), refundable(order));
  if (amount <= 0) throw new HttpError(400, 'Nothing to refund');
  const vendorReversal = round2(amount * (1 - order.commissionRate));

  const refund = await refundAndReverse(order, amount, vendorReversal);
  for (const { item, quantity } of applied) item.refundedQuantity = (item.refundedQuantity || 0) + quantity;
  order.refunds.push({
    items: applied.map(({ item, quantity }) => ({ product: item.product, quantity })),
    amount,
    vendorReversal,
    reason,
    refundId: refund?.id,
  });
  order.refundedTotal = round2(order.refundedTotal + amount);

  // items that never left the warehouse go back on the shelf
  if (['placed', 'packed'].includes(order.status)) {
    const back = applied.map(({ item, quantity }) => ({ product: item.product, quantity }));
    await releaseStock(back);
    await syncProducts(back.map((i) => i.product));
  }
  await order.save();
  return { order, amount };
}

export async function advanceOrder(order, next) {
  const from = ORDER_FLOW.indexOf(order.status);
  const to = ORDER_FLOW.indexOf(next);
  if (from === -1 || to !== from + 1) {
    throw new HttpError(400, `Can't move an order from "${order.status}" to "${next}"`);
  }
  order.status = next;
  order.statusHistory.push({ status: next });
  await order.save();
  if (next === 'shipped') await notifyShipped(order);
  return order;
}

async function notifyPlaced(orders) {
  try {
    const customer = await User.findById(orders[0].customer);
    if (customer) await sendMail(customer.email, templates.orderPlaced(customer, orders));
  } catch (err) {
    logger.warn({ err: err.message }, 'order email failed');
  }
}

async function notifyShipped(order) {
  try {
    const customer = await User.findById(order.customer);
    if (customer) await sendMail(customer.email, templates.orderShipped(customer, order));
  } catch (err) {
    logger.warn({ err: err.message }, 'shipping email failed');
  }
}
