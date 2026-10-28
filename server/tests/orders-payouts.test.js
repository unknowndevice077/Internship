import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import Vendor from '../src/models/Vendor.js';
import Coupon from '../src/models/Coupon.js';
import { expireReservations, retryFailedTransfers } from '../src/lib/orders.js';
import { runJobs } from '../src/lib/jobs.js';
import { getRedis } from '../src/lib/redis.js';
import { outbox } from '../src/lib/mail.js';
import { address, api, approvedVendor, auth, login, makeProduct } from './helpers.js';

const stripe = vi.hoisted(() => ({
  paymentIntents: {
    create: vi.fn(async (p) => ({ id: 'pi_1', client_secret: 'secret', ...p })),
    retrieve: vi.fn(async () => ({ id: 'pi_1', status: 'succeeded', latest_charge: 'ch_1' })),
    cancel: vi.fn(async () => ({ status: 'canceled' })),
  },
  transfers: {
    create: vi.fn(async () => ({ id: 'tr_1' })),
    createReversal: vi.fn(async () => ({ id: 'trr_1' })),
  },
  refunds: { create: vi.fn(async () => ({ id: 're_1' })) },
}));
vi.mock('stripe', () => ({
  default: vi.fn(function Stripe() {
    return stripe;
  }),
}));

const useStripe = () => {
  beforeAll(() => {
    config.stripe.secretKey = 'sk_test_fake';
  });
  afterAll(() => {
    config.stripe.secretKey = '';
  });
};

async function addToCart(customer, product, quantity = 1) {
  await api().post('/api/cart/items').set(auth(customer.token)).send({ productId: product._id, quantity });
}

const checkout = (customer, body = {}) =>
  api()
    .post('/api/orders/checkout')
    .set(auth(customer.token))
    .send({ shippingAddress: address, ...body });

async function buy(customer, items, body) {
  for (const [p, q] of items) await addToCart(customer, p, q);
  const res = await checkout(customer, body);
  await api().post(`/api/orders/confirm/${res.body.paymentGroup}`).set(auth(customer.token));
  return Order.find({ paymentGroup: res.body.paymentGroup }).sort({ total: -1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  outbox.length = 0;
});

describe('shipping', () => {
  it('charges each store its flat rate unless the order is over the free limit', async () => {
    const a = await approvedVendor('Ships');
    const b = await approvedVendor('Free over 50');
    await Vendor.updateOne({ _id: a.vendorId }, { shippingFee: 5 });
    await Vendor.updateOne({ _id: b.vendorId }, { shippingFee: 7, freeShippingOver: 50 });
    const p1 = await makeProduct(a.vendorId, { price: 20 });
    const p2 = await makeProduct(b.vendorId, { price: 60 });
    const c = await login('customer');
    await addToCart(c, p1);
    await addToCart(c, p2);

    const quote = await api().get('/api/cart/quote').set(auth(c.token));
    expect(quote.body).toMatchObject({ subtotal: 80, shipping: 5, total: 85 });
    expect(quote.body.stores.find((s) => s.vendorName === 'Ships').shippingFee).toBe(5);

    const res = await checkout(c);
    expect(res.body.amount).toBe(85);
    const order = await Order.findOne({ vendor: a.vendorId });
    // commission only on goods, the vendor keeps the shipping
    expect(order).toMatchObject({ subtotal: 20, shippingFee: 5, total: 25, commission: 2, vendorPayout: 23 });
  });

  it('shows the shipping in the coupon preview', async () => {
    const v = await approvedVendor();
    await Vendor.updateOne({ _id: v.vendorId }, { shippingFee: 3 });
    const p = await makeProduct(v.vendorId, { price: 40 });
    const c = await login('customer');
    await addToCart(c, p);
    await Coupon.create({ code: 'TEN', type: 'percent', value: 10 });
    const res = await api().get('/api/cart/quote?coupon=ten').set(auth(c.token));
    expect(res.body).toMatchObject({ code: 'TEN', discount: 4, shipping: 3, total: 39 });
  });

  it('lets a vendor set their shipping', async () => {
    const v = await approvedVendor();
    const res = await api()
      .patch('/api/vendors/me')
      .set(auth(v.token))
      .send({ shippingFee: 4.5, freeShippingOver: 40 });
    expect(res.body.vendor).toMatchObject({ shippingFee: 4.5, freeShippingOver: 40 });
  });
});

describe('stock holds', () => {
  it('takes stock at checkout and gives it back when the hold runs out', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { stock: 3 });
    const c = await login('customer');
    await addToCart(c, p, 2);
    const res = await checkout(c);
    expect(new Date(res.body.reservedUntil).getTime()).toBeGreaterThan(Date.now());
    expect((await Product.findById(p._id)).stock).toBe(1);

    // a second customer can't buy what's on hold
    const other = await login('customer');
    const add = await api()
      .post('/api/cart/items')
      .set(auth(other.token))
      .send({ productId: p._id, quantity: 2 });
    expect(add.body.error).toMatch(/Only 1 left/);

    expect(await expireReservations(new Date(Date.now() + 16 * 60 * 1000))).toBe(1);
    expect((await Product.findById(p._id)).stock).toBe(3);
    expect((await Order.findOne({ paymentGroup: res.body.paymentGroup })).status).toBe('cancelled');

    // paying after the hold expired doesn't place the order
    await api().post(`/api/orders/confirm/${res.body.paymentGroup}`).set(auth(c.token));
    expect((await Order.findOne({ paymentGroup: res.body.paymentGroup })).status).toBe('cancelled');
  });

  it('releases your own old hold when you check out again', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { stock: 2 });
    const c = await login('customer');
    await addToCart(c, p, 2);
    const first = await checkout(c);
    const second = await checkout(c);
    expect(second.status).toBe(201);
    expect((await Order.findOne({ paymentGroup: first.body.paymentGroup })).status).toBe('cancelled');
    expect((await Product.findById(p._id)).stock).toBe(0);
  });

  it('refuses checkout when an item sold out after it was added', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { stock: 2 });
    const c = await login('customer');
    await addToCart(c, p, 2);
    await Product.updateOne({ _id: p._id }, { stock: 1 });
    const res = await checkout(c);
    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(p._id)).stock).toBe(1);
  });

  it('rolls back earlier items when a later one runs out', async () => {
    const v = await approvedVendor();
    const p1 = await makeProduct(v.vendorId, { stock: 5 });
    const p2 = await makeProduct(v.vendorId, { title: 'Last one', stock: 1 });
    const c = await login('customer');
    await addToCart(c, p1, 2);
    await addToCart(c, p2, 1);
    // someone else grabs the last one between the cart check and the hold
    const real = Product.updateOne.bind(Product);
    let calls = 0;
    const spy = vi.spyOn(Product, 'updateOne').mockImplementation((...args) => {
      calls += 1;
      return calls === 2 ? Promise.resolve({ modifiedCount: 0 }) : real(...args);
    });
    const res = await checkout(c);
    spy.mockRestore();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Last one/);
    expect((await Product.findById(p1._id)).stock).toBe(5);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('expires old holds from the jobs runner, once per lock window', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { stock: 1 });
    const c = await login('customer');
    await addToCart(c, p);
    const res = await checkout(c);
    await Order.updateMany({ paymentGroup: res.body.paymentGroup }, { reservedUntil: new Date(0) });

    await getRedis().set('lock:jobs', 'other-instance', 'EX', 55);
    await runJobs();
    expect((await Product.findById(p._id)).stock).toBe(0);

    await getRedis().del('lock:jobs');
    await runJobs();
    expect((await Product.findById(p._id)).stock).toBe(1);
  });

  describe('with Stripe', () => {
    useStripe();

    it('finishes the order instead if the card went through just before the hold ran out', async () => {
      const v = await approvedVendor();
      const p = await makeProduct(v.vendorId, { stock: 2 });
      const c = await login('customer');
      await addToCart(c, p);
      const res = await checkout(c);
      await expireReservations(new Date(Date.now() + 16 * 60 * 1000));
      expect((await Order.findOne({ paymentGroup: res.body.paymentGroup })).status).toBe('placed');
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it('cancels the unpaid intent when the hold runs out', async () => {
      stripe.paymentIntents.retrieve.mockResolvedValueOnce({ id: 'pi_1', status: 'requires_payment_method' });
      const v = await approvedVendor();
      const p = await makeProduct(v.vendorId, { stock: 2 });
      const c = await login('customer');
      await addToCart(c, p);
      await checkout(c);
      expect(await expireReservations(new Date(Date.now() + 16 * 60 * 1000))).toBe(1);
      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_1');
      expect((await Product.findById(p._id)).stock).toBe(2);
    });

    it('gives the stock back if creating the payment fails', async () => {
      stripe.paymentIntents.create.mockRejectedValueOnce(new Error('card network down'));
      const v = await approvedVendor();
      const p = await makeProduct(v.vendorId, { stock: 2 });
      const c = await login('customer');
      await addToCart(c, p);
      expect((await checkout(c)).status).toBe(500);
      expect((await Product.findById(p._id)).stock).toBe(2);
    });
  });
});

describe('vendor payouts', () => {
  useStripe();

  it('marks a failed transfer and retries it later', async () => {
    stripe.transfers.create.mockRejectedValueOnce(new Error('insufficient balance'));
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { price: 30 });
    const c = await login('customer');
    const [order] = await buy(c, [[p, 1]]);
    expect(order.status).toBe('placed');
    expect(order.payment).toMatchObject({ transferStatus: 'failed', transferAttempts: 1 });
    expect(order.payment.transferError).toMatch(/insufficient/);

    // not due yet
    expect(await retryFailedTransfers()).toBe(0);
    expect(await retryFailedTransfers(new Date(Date.now() + 2 * 60 * 1000))).toBe(1);
    const after = await Order.findById(order._id);
    expect(after.payment).toMatchObject({ transferStatus: 'paid', transferId: 'tr_1', transferAttempts: 2 });
    expect(stripe.transfers.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ source_transaction: 'ch_1', destination: 'mock_acct_x' }),
    );
  });

  it('stops retrying on its own after the last attempt', async () => {
    stripe.transfers.create.mockRejectedValue(new Error('account closed'));
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId);
    const c = await login('customer');
    const [order] = await buy(c, [[p, 1]]);
    const later = new Date(Date.now() + 24 * 60 * 60 * 1000);
    for (let i = 0; i < 6; i++) await retryFailedTransfers(later);
    const after = await Order.findById(order._id);
    expect(after.payment.transferAttempts).toBe(6);
    expect(after.payment.nextTransferAt).toBeUndefined();
    stripe.transfers.create.mockReset();
    stripe.transfers.create.mockResolvedValue({ id: 'tr_1' });
  });

  it('fails without trying when the vendor has no Stripe account', async () => {
    const v = await approvedVendor();
    await Vendor.updateOne({ _id: v.vendorId }, { $unset: { stripeAccountId: 1 } });
    const p = await makeProduct(v.vendorId);
    const c = await login('customer');
    const [order] = await buy(c, [[p, 1]]);
    expect(order.payment.transferStatus).toBe('failed');
    expect(order.payment.transferError).toMatch(/no connected/);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  it('lets an admin see and retry failed payouts', async () => {
    stripe.transfers.create.mockRejectedValueOnce(new Error('temporary'));
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId);
    const c = await login('customer');
    const [order] = await buy(c, [[p, 1]]);
    const admin = await login('admin');

    const list = await api().get('/api/admin/payouts').set(auth(admin.token));
    expect(list.body.items.map((o) => o.orderNumber)).toEqual([order.orderNumber]);

    const retry = await api().post(`/api/admin/orders/${order._id}/retry-payout`).set(auth(admin.token));
    expect(retry.body.order.payment.transferStatus).toBe('paid');
    const again = await api().post(`/api/admin/orders/${order._id}/retry-payout`).set(auth(admin.token));
    expect(again.status).toBe(400);
    const missing = await api()
      .post('/api/admin/orders/000000000000000000000000/retry-payout')
      .set(auth(admin.token));
    expect(missing.status).toBe(404);

    const paid = await api().get('/api/admin/payouts?status=paid').set(auth(admin.token));
    expect(paid.body.items).toHaveLength(1);
  });

  it('skips the payout when a cancelled order never got paid out', async () => {
    stripe.transfers.create.mockRejectedValueOnce(new Error('temporary'));
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId);
    const c = await login('customer');
    const [order] = await buy(c, [[p, 1]]);
    await api().post(`/api/orders/${order._id}/cancel`).set(auth(c.token));
    const after = await Order.findById(order._id);
    expect(after.payment.transferStatus).toBe('skipped');
    expect(stripe.transfers.createReversal).not.toHaveBeenCalled();
  });
});

describe('partial refunds', () => {
  useStripe();

  async function paidOrder(customerBody) {
    const v = await approvedVendor();
    const shoes = await makeProduct(v.vendorId, { price: 50, stock: 5 });
    const socks = await makeProduct(v.vendorId, { title: 'Socks', price: 10, stock: 5 });
    const c = await login('customer');
    const [order] = await buy(
      c,
      [
        [shoes, 2],
        [socks, 1],
      ],
      customerBody,
    );
    return { v, c, shoes, socks, order };
  }

  it('refunds some units with their share of the coupon and reverses the vendor payout', async () => {
    await Coupon.create({ code: 'TEN', type: 'percent', value: 10 });
    const { v, shoes, order } = await paidOrder({ couponCode: 'TEN' });
    expect(order.total).toBe(99);

    const res = await api()
      .post(`/api/orders/${order._id}/refund`)
      .set(auth(v.token))
      .send({ items: [{ product: shoes._id.toString(), quantity: 1 }], reason: 'Damaged' });
    expect(res.status).toBe(200);
    // $50 less 10% coupon share
    expect(res.body.amount).toBe(45);
    expect(res.body.order.refundedTotal).toBe(45);
    expect(res.body.order.items[0].refundedQuantity).toBe(1);
    expect(res.body.order.refunds[0]).toMatchObject({ amount: 45, vendorReversal: 40.5, reason: 'Damaged' });
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1', amount: 4500 });
    expect(stripe.transfers.createReversal).toHaveBeenCalledWith('tr_1', { amount: 4050 });
    // still in the warehouse, so it goes back in stock
    expect((await Product.findById(shoes._id)).stock).toBe(4);
  });

  it("won't refund more than was bought", async () => {
    const { v, shoes, order } = await paidOrder();
    const send = (quantity) =>
      api()
        .post(`/api/orders/${order._id}/refund`)
        .set(auth(v.token))
        .send({ items: [{ product: shoes._id.toString(), quantity }] });
    expect((await send(3)).body.error).toMatch(/Only 2/);
    expect((await send(2)).status).toBe(200);
    expect((await send(1)).body.error).toMatch(/Only 0/);
  });

  it('rejects products that are not in the order', async () => {
    const { v, order } = await paidOrder();
    const res = await api()
      .post(`/api/orders/${order._id}/refund`)
      .set(auth(v.token))
      .send({ items: [{ product: '000000000000000000000000', quantity: 1 }] });
    expect(res.body.error).toMatch(/not in this order/);
  });

  it('does not restock items that already shipped', async () => {
    const { v, socks, order } = await paidOrder();
    for (const status of ['packed', 'shipped']) {
      await api().patch(`/api/orders/${order._id}/status`).set(auth(v.token)).send({ status });
    }
    await api()
      .post(`/api/orders/${order._id}/refund`)
      .set(auth(v.token))
      .send({ items: [{ product: socks._id.toString(), quantity: 1 }] });
    expect((await Product.findById(socks._id)).stock).toBe(4);
  });

  it('only refunds what is left when the order is cancelled afterwards', async () => {
    const { v, socks, order } = await paidOrder();
    await api()
      .post(`/api/orders/${order._id}/refund`)
      .set(auth(v.token))
      .send({ items: [{ product: socks._id.toString(), quantity: 1 }] });
    stripe.refunds.create.mockClear();
    await api().patch(`/api/orders/${order._id}/status`).set(auth(v.token)).send({ status: 'cancelled' });
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1', amount: 10000 });
    const after = await Order.findById(order._id);
    expect(after.refundedTotal).toBe(110);
  });

  it('refuses unpaid orders and other vendors', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId);
    const c = await login('customer');
    await addToCart(c, p);
    const res = await checkout(c);
    const order = await Order.findOne({ paymentGroup: res.body.paymentGroup });
    const body = { items: [{ product: p._id.toString(), quantity: 1 }] };
    const unpaid = await api().post(`/api/orders/${order._id}/refund`).set(auth(v.token)).send(body);
    expect(unpaid.body.error).toMatch(/paid orders/);

    const other = await approvedVendor('Other');
    const denied = await api().post(`/api/orders/${order._id}/refund`).set(auth(other.token)).send(body);
    expect(denied.status).toBe(404);
  });
});

describe('vendor order list', () => {
  async function twoOrders() {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { title: 'Mug, "large"', price: 12 });
    const c = await login('customer');
    const [first] = await buy(c, [[p, 1]]);
    const [second] = await buy(c, [[p, 2]]);
    await api().patch(`/api/orders/${second._id}/status`).set(auth(v.token)).send({ status: 'packed' });
    // createdAt is immutable through mongoose, so go to the driver
    await Order.collection.updateOne(
      { _id: first._id },
      { $set: { createdAt: new Date('2026-01-10T12:00:00Z') } },
    );
    return { v, c, first, second };
  }

  it('filters by status, order number and date', async () => {
    const { v, first, second } = await twoOrders();
    const get = (qs) => api().get(`/api/orders?${qs}`).set(auth(v.token));

    expect((await get('status=packed')).body.items.map((o) => o._id)).toEqual([second._id.toString()]);
    const byNumber = await get(`q=${first.orderNumber.slice(-4)}`);
    expect(byNumber.body.items.map((o) => o.orderNumber)).toEqual([first.orderNumber]);
    expect((await get('from=2026-01-10&to=2026-01-10')).body.items).toHaveLength(1);
    expect((await get('to=2025-12-31')).body.items).toHaveLength(0);
    expect((await get('status=nope')).status).toBe(400);
  });

  it('exports CSV with quoting', async () => {
    const { v, first } = await twoOrders();
    const res = await api().get('/api/orders/export.csv?status=placed').set(auth(v.token));
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.split('\n');
    expect(lines[0]).toBe(
      'order,date,status,store,customer,email,items,subtotal,discount,shipping,total,commission,payout,refunded',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(first.orderNumber);
    expect(lines[1]).toContain('"1 x Mug, ""large"""');
  });

  it('protects the CSV from spreadsheet formulas', async () => {
    const v = await approvedVendor('=SUM(A1)');
    const p = await makeProduct(v.vendorId, { price: 5 });
    const c = await login('customer');
    await buy(c, [[p, 1]]);
    const admin = await login('admin');
    const res = await api().get('/api/orders/export.csv').set(auth(admin.token));
    expect(res.text.split('\n')[1]).toContain(",'=SUM(A1),");
  });

  it('is not available to customers', async () => {
    const c = await login('customer');
    expect((await api().get('/api/orders/export.csv').set(auth(c.token))).status).toBe(403);
  });

  it('gives a vendor without a store an empty list', async () => {
    const v = await login('vendor');
    expect((await api().get('/api/orders').set(auth(v.token))).body.items).toEqual([]);
    const csv = await api().get('/api/orders/export.csv').set(auth(v.token));
    expect(csv.text.split('\n')).toHaveLength(1);
  });
});

describe('order emails', () => {
  it('emails the customer when the order is placed and when it ships', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { title: 'Desk Lamp', price: 30 });
    const c = await login('customer');
    outbox.length = 0;
    const [order] = await buy(c, [[p, 1]]);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toContain(order.orderNumber);
    expect(outbox[0].text).toContain('1 x Desk Lamp');

    for (const status of ['packed', 'shipped']) {
      await api().patch(`/api/orders/${order._id}/status`).set(auth(v.token)).send({ status });
    }
    expect(outbox).toHaveLength(2);
    expect(outbox[1].subject).toMatch(/has shipped/);
  });
});
