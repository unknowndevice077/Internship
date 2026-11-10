import { describe, expect, it } from 'vitest';
import Order from '../src/models/Order.js';
import Coupon from '../src/models/Coupon.js';
import { api, approvedVendor, auth, login, makeProduct } from './helpers.js';

describe('vendor store', () => {
  it('shows stats and low stock', async () => {
    const v = await approvedVendor();
    await makeProduct(v.vendorId, { title: 'Almost gone', stock: 2 });
    const c = await login('customer');
    await Order.create({
      paymentGroup: 'g',
      orderNumber: 'S1',
      customer: c.user._id,
      vendor: v.vendorId,
      total: 80,
      commission: 8,
      vendorPayout: 72,
      status: 'placed',
    });
    const res = await api().get('/api/vendors/me/stats').set(auth(v.token));
    expect(res.body.sales).toMatchObject({ orders: 1, revenue: 80, payout: 72 });
    expect(res.body.byStatus.placed).toBe(1);
    expect(res.body.lowStock[0].title).toBe('Almost gone');
  });

  it('serves the public storefront only once approved', async () => {
    const v = await login('vendor');
    await api().post('/api/vendors/onboard').set(auth(v.token)).send({ storeName: 'Corner Shop' });
    expect((await api().get('/api/vendors/corner-shop')).status).toBe(404);

    const again = await api().post('/api/vendors/onboard').set(auth(v.token)).send({ storeName: 'Twice' });
    expect(again.status).toBe(409);

    const edit = await api().patch('/api/vendors/me').set(auth(v.token)).send({ description: 'Hello' });
    expect(edit.body.vendor.description).toBe('Hello');
  });

  it('lists only its own orders and coupons', async () => {
    const a = await approvedVendor('Store A');
    const b = await approvedVendor('Store B');
    const c = await login('customer');
    await Order.create([
      {
        paymentGroup: 'g1',
        orderNumber: 'O1',
        customer: c.user._id,
        vendor: a.vendorId,
        total: 1,
        status: 'placed',
      },
      {
        paymentGroup: 'g2',
        orderNumber: 'O2',
        customer: c.user._id,
        vendor: b.vendorId,
        total: 1,
        status: 'placed',
      },
      {
        paymentGroup: 'g3',
        orderNumber: 'O3',
        customer: c.user._id,
        vendor: a.vendorId,
        total: 1,
        status: 'pending_payment',
      },
    ]);
    const orders = await api().get('/api/orders').set(auth(a.token));
    expect(orders.body.items.map((o) => o.orderNumber)).toEqual(['O1']);

    await api().post('/api/coupons').set(auth(a.token)).send({ code: 'AONLY', type: 'fixed', value: 3 });
    await Coupon.create({ code: 'PLATFORM', type: 'fixed', value: 1 });
    const coupons = await api().get('/api/coupons').set(auth(a.token));
    expect(coupons.body.items.map((x) => x.code)).toEqual(['AONLY']);

    const id = coupons.body.items[0]._id;
    expect((await api().patch(`/api/coupons/${id}`).set(auth(b.token)).send({ value: 50 })).status).toBe(404);
    expect((await api().delete(`/api/coupons/${id}`).set(auth(a.token))).status).toBe(204);
  });
});

describe('coupon preview', () => {
  it('shows the discount on the current cart', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { price: 40 });
    const c = await login('customer');
    await api().post('/api/cart/items').set(auth(c.token)).send({ productId: p._id, quantity: 1 });
    await Coupon.create({ code: 'TEN', type: 'percent', value: 10, minOrder: 30 });
    await Coupon.create({ code: 'BIGSPEND', type: 'fixed', value: 10, minOrder: 100 });
    await Coupon.create({ code: 'GONE', type: 'fixed', value: 1, maxUses: 1, usedCount: 1 });

    const ok = await api().post('/api/coupons/validate').set(auth(c.token)).send({ code: 'ten' });
    expect(ok.body).toMatchObject({ code: 'TEN', subtotal: 40, discount: 4, shipping: 0, total: 36 });

    const min = await api().post('/api/coupons/validate').set(auth(c.token)).send({ code: 'BIGSPEND' });
    expect(min.body.error).toMatch(/minimum/);
    const used = await api().post('/api/coupons/validate').set(auth(c.token)).send({ code: 'GONE' });
    expect(used.body.error).toMatch(/used up/);
  });
});

describe('admin management', () => {
  it('lists vendors and users, sets commission and disables accounts', async () => {
    const v = await approvedVendor();
    const c = await login('customer');
    const admin = await login('admin');
    const h = auth(admin.token);

    const vendors = await api().get('/api/admin/vendors?status=approved').set(h);
    expect(vendors.body.items[0].owner.email).toMatch(/@test\.dev$/);

    const rate = await api().patch(`/api/admin/vendors/${v.vendorId}`).set(h).send({ commissionRate: 0.15 });
    expect(rate.body.vendor.commissionRate).toBe(0.15);

    const users = await api().get('/api/admin/users?role=customer').set(h);
    expect(users.body.items).toHaveLength(1);

    await api().patch(`/api/admin/users/${c.user._id}`).set(h).send({ isActive: false });
    const blocked = await api()
      .post('/api/auth/login')
      .send({ email: c.user.email, password: 'password123' });
    expect(blocked.status).toBe(403);

    const self = await api().patch(`/api/admin/users/${admin.user._id}`).set(h).send({ isActive: false });
    expect(self.status).toBe(400);
  });
});

describe('misc', () => {
  it('reports health and 404s unknown routes', async () => {
    const health = await api().get('/api/health');
    expect(health.body).toMatchObject({ status: 'ok', search: 'mongo-fallback', payments: 'mock' });
    expect((await api().get('/api/nope')).status).toBe(404);
    expect((await api().get('/api/products/not-an-id')).status).toBe(400);
  });

  it('saves the shipping address on the profile', async () => {
    const c = await login('customer');
    const res = await api()
      .patch('/api/auth/me')
      .set(auth(c.token))
      .send({ address: { line1: '9 Elm', city: 'Cebu', postalCode: '6000', country: 'PH' } });
    expect(res.body.user.address.city).toBe('Cebu');
  });
});
