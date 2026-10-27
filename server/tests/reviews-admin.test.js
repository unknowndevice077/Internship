import { describe, expect, it } from 'vitest';
import Order from '../src/models/Order.js';
import { api, approvedVendor, auth, login, makeProduct } from './helpers.js';

describe('reviews', () => {
  it('updates the product rating and marks verified purchases', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId);
    const c1 = await login('customer');
    const c2 = await login('customer');

    await Order.create({
      paymentGroup: 'g1',
      orderNumber: 'VD-T1',
      customer: c1.user._id,
      vendor: v.vendorId,
      items: [{ product: p._id, title: p.title, price: 50, quantity: 1 }],
      total: 50,
      status: 'delivered',
    });

    const r1 = await api().post(`/api/products/${p._id}/reviews`).set(auth(c1.token)).send({ rating: 5, body: 'Great' });
    expect(r1.body.review.verifiedPurchase).toBe(true);
    await api().post(`/api/products/${p._id}/reviews`).set(auth(c2.token)).send({ rating: 2 });

    const product = await api().get(`/api/products/${p._id}`);
    expect(product.body.product.ratingAvg).toBe(3.5);
    expect(product.body.product.ratingCount).toBe(2);

    // reviewing again edits instead of duplicating
    await api().post(`/api/products/${p._id}/reviews`).set(auth(c2.token)).send({ rating: 4 });
    const list = await api().get(`/api/products/${p._id}/reviews`);
    expect(list.body.items).toHaveLength(2);
  });
});

describe('admin', () => {
  it('returns analytics totals', async () => {
    const v = await approvedVendor();
    const c = await login('customer');
    await Order.create([
      { paymentGroup: 'g1', orderNumber: 'A1', customer: c.user._id, vendor: v.vendorId, total: 100, commission: 10, vendorPayout: 90, status: 'delivered' },
      { paymentGroup: 'g2', orderNumber: 'A2', customer: c.user._id, vendor: v.vendorId, total: 50, commission: 5, vendorPayout: 45, status: 'placed' },
      { paymentGroup: 'g3', orderNumber: 'A3', customer: c.user._id, vendor: v.vendorId, total: 999, commission: 99, vendorPayout: 900, status: 'pending_payment' },
    ]);
    const admin = await login('admin');
    const res = await api().get('/api/admin/analytics').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.totals.gmv).toBe(150);
    expect(res.body.totals.commission).toBe(15);
    expect(res.body.totals.avgOrderValue).toBe(75);
    expect(res.body.topVendors[0].storeName).toBe('Test Store');
    expect(res.body.daily).toHaveLength(1);
  });

  it('manages coupons', async () => {
    const admin = await login('admin');
    const res = await api()
      .post('/api/coupons')
      .set(auth(admin.token))
      .send({ code: 'big', type: 'percent', value: 95 });
    expect(res.status).toBe(400);
    const ok = await api().post('/api/coupons').set(auth(admin.token)).send({ code: 'big', type: 'percent', value: 20 });
    expect(ok.body.coupon.code).toBe('BIG');
  });
});
