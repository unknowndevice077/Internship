import { describe, expect, it } from 'vitest';
import Product from '../src/models/Product.js';
import Coupon from '../src/models/Coupon.js';
import { address, api, approvedVendor, auth, login, makeProduct } from './helpers.js';

async function setup() {
  const a = await approvedVendor('Store A');
  const b = await approvedVendor('Store B');
  const shoes = await makeProduct(a.vendorId, { price: 50, stock: 5 });
  const mug = await makeProduct(b.vendorId, { title: 'Mug', category: 'kitchen', price: 25, stock: 2 });
  const customer = await login('customer');
  return { a, b, shoes, mug, customer };
}

async function buy(customer, items, body = {}) {
  for (const [product, quantity] of items) {
    await api().post('/api/cart/items').set(auth(customer.token)).send({ productId: product._id, quantity });
  }
  const checkout = await api()
    .post('/api/orders/checkout')
    .set(auth(customer.token))
    .send({ shippingAddress: address, ...body });
  return checkout;
}

describe('cart', () => {
  it('adds, updates and removes items', async () => {
    const { shoes, customer } = await setup();
    const h = auth(customer.token);
    let res = await api().post('/api/cart/items').set(h).send({ productId: shoes._id, quantity: 2 });
    expect(res.body.subtotal).toBe(100);
    res = await api().post('/api/cart/items').set(h).send({ productId: shoes._id, quantity: 1 });
    expect(res.body.items[0].quantity).toBe(3);
    res = await api().put(`/api/cart/items/${shoes._id}`).set(h).send({ quantity: 1 });
    expect(res.body.subtotal).toBe(50);
    res = await api().delete(`/api/cart/items/${shoes._id}`).set(h);
    expect(res.body.items).toHaveLength(0);
  });

  it('refuses more than the stock', async () => {
    const { mug, customer } = await setup();
    const res = await api()
      .post('/api/cart/items')
      .set(auth(customer.token))
      .send({ productId: mug._id, quantity: 3 });
    expect(res.status).toBe(400);
  });
});

describe('checkout and split payments', () => {
  it('creates one order per vendor and splits commission', async () => {
    const { shoes, mug, customer } = await setup();
    const res = await buy(customer, [
      [shoes, 2],
      [mug, 1],
    ]);
    expect(res.status).toBe(201);
    expect(res.body.provider).toBe('mock');
    expect(res.body.amount).toBe(125);
    expect(res.body.orders).toHaveLength(2);

    const confirm = await api()
      .post(`/api/orders/confirm/${res.body.paymentGroup}`)
      .set(auth(customer.token));
    const orders = confirm.body.orders;
    expect(orders.every((o) => o.status === 'placed')).toBe(true);

    const shoeOrder = orders.find((o) => o.total === 100);
    expect(shoeOrder.commission).toBe(10);
    expect(shoeOrder.vendorPayout).toBe(90);
    expect(shoeOrder.payment.transferId).toMatch(/^mock_tr_/);

    expect((await Product.findById(shoes._id)).stock).toBe(3);
    expect((await api().get('/api/cart').set(auth(customer.token))).body.items).toHaveLength(0);

    // confirming twice must not decrement stock again
    await api().post(`/api/orders/confirm/${res.body.paymentGroup}`).set(auth(customer.token));
    expect((await Product.findById(shoes._id)).stock).toBe(3);
  });

  it('applies a platform coupon across vendors', async () => {
    const { shoes, mug, customer } = await setup();
    await Coupon.create({ code: 'SAVE10', type: 'percent', value: 10 });
    const res = await buy(
      customer,
      [
        [shoes, 1],
        [mug, 2],
      ],
      { couponCode: 'save10' },
    );
    expect(res.body.amount).toBe(90);
    const discounts = res.body.orders.map((o) => o.discount).sort();
    expect(discounts).toEqual([5, 5]);
  });

  it('applies a vendor coupon only to that vendor', async () => {
    const { a, shoes, mug, customer } = await setup();
    await Coupon.create({ code: 'SHOES5', type: 'fixed', value: 5, vendor: a.vendorId });
    const res = await buy(
      customer,
      [
        [shoes, 1],
        [mug, 1],
      ],
      { couponCode: 'SHOES5' },
    );
    const shoeOrder = res.body.orders.find((o) => o.subtotal === 50);
    const mugOrder = res.body.orders.find((o) => o.subtotal === 25);
    expect(shoeOrder.discount).toBe(5);
    expect(mugOrder.discount).toBe(0);
  });

  it('rejects expired coupons', async () => {
    const { shoes, customer } = await setup();
    await Coupon.create({ code: 'OLD', type: 'fixed', value: 5, expiresAt: new Date(Date.now() - 1000) });
    const res = await buy(customer, [[shoes, 1]], { couponCode: 'OLD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/);
  });
});

describe('order lifecycle', () => {
  async function placedOrder() {
    const ctx = await setup();
    const res = await buy(ctx.customer, [[ctx.shoes, 1]]);
    await api().post(`/api/orders/confirm/${res.body.paymentGroup}`).set(auth(ctx.customer.token));
    return { ...ctx, orderId: res.body.orders[0]._id };
  }

  it('moves placed -> packed -> shipped -> delivered and no skipping', async () => {
    const { a, orderId } = await placedOrder();
    const h = auth(a.token);
    const skip = await api().patch(`/api/orders/${orderId}/status`).set(h).send({ status: 'shipped' });
    expect(skip.status).toBe(400);
    for (const status of ['packed', 'shipped', 'delivered']) {
      const res = await api().patch(`/api/orders/${orderId}/status`).set(h).send({ status });
      expect(res.body.order.status).toBe(status);
    }
  });

  it("doesn't let another vendor touch the order", async () => {
    const { b, orderId } = await placedOrder();
    const res = await api()
      .patch(`/api/orders/${orderId}/status`)
      .set(auth(b.token))
      .send({ status: 'packed' });
    expect(res.status).toBe(404);
  });

  it('customer cancel restocks the product', async () => {
    const { shoes, customer, orderId } = await placedOrder();
    expect((await Product.findById(shoes._id)).stock).toBe(4);
    const res = await api().post(`/api/orders/${orderId}/cancel`).set(auth(customer.token));
    expect(res.body.order.status).toBe('cancelled');
    expect((await Product.findById(shoes._id)).stock).toBe(5);
  });

  it('generates a PDF invoice', async () => {
    const { customer, orderId } = await placedOrder();
    const res = await api()
      .get(`/api/orders/${orderId}/invoice`)
      .set(auth(customer.token))
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });
});
