import { beforeEach, describe, expect, it } from 'vitest';
import User from '../src/models/User.js';
import Vendor from '../src/models/Vendor.js';
import { outbox } from '../src/lib/mail.js';
import { api, approvedVendor, auth, login, makeProduct } from './helpers.js';

const tokenFrom = (mail) => mail.text.match(/token=([\w-]+)/)[1];

beforeEach(() => {
  outbox.length = 0;
});

describe('email verification', () => {
  it('sends a link on signup that verifies the account once', async () => {
    const reg = await api()
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'ana@test.dev', password: 'password123' });
    expect(reg.body.user.emailVerified).toBe(false);
    expect(outbox[0]).toMatchObject({ to: 'ana@test.dev', subject: 'Confirm your Vendora email' });

    const token = tokenFrom(outbox[0]);
    expect((await api().post('/api/auth/verify-email').send({ token })).body.verified).toBe(true);
    expect((await User.findOne({ email: 'ana@test.dev' })).emailVerified).toBe(true);

    const reuse = await api().post('/api/auth/verify-email').send({ token });
    expect(reuse.body.error).toMatch(/invalid or has expired/);
  });

  it('resends the link only while unverified', async () => {
    const c = await login('customer');
    outbox.length = 0;
    await api().post('/api/auth/resend-verification').set(auth(c.token));
    expect(outbox).toHaveLength(1);

    await User.updateOne({ _id: c.user._id }, { emailVerified: true });
    await api().post('/api/auth/resend-verification').set(auth(c.token));
    expect(outbox).toHaveLength(1);
  });
});

describe('password reset', () => {
  it('resets with the emailed link and logs out every session', async () => {
    const c = await login('customer');
    outbox.length = 0;
    const forgot = await api().post('/api/auth/forgot-password').send({ email: c.user.email.toUpperCase() });
    expect(forgot.status).toBe(204);
    const token = tokenFrom(outbox[0]);

    const short = await api().post('/api/auth/reset-password').send({ token, password: 'short' });
    expect(short.status).toBe(400);

    const res = await api().post('/api/auth/reset-password').send({ token, password: 'brand-new-pass' });
    expect(res.body.reset).toBe(true);
    expect((await api().get('/api/auth/me').set(auth(c.token))).status).toBe(401);

    const old = await api().post('/api/auth/login').send({ email: c.user.email, password: 'password123' });
    expect(old.status).toBe(401);
    const fresh = await api()
      .post('/api/auth/login')
      .send({ email: c.user.email, password: 'brand-new-pass' });
    expect(fresh.body.user.emailVerified).toBe(true);

    const again = await api().post('/api/auth/reset-password').send({ token, password: 'another-pass' });
    expect(again.status).toBe(400);
  });

  it("doesn't reveal whether an email has an account", async () => {
    const res = await api().post('/api/auth/forgot-password').send({ email: 'nobody@test.dev' });
    expect(res.status).toBe(204);
    expect(outbox).toHaveLength(0);
  });
});

describe('wishlist and recently viewed', () => {
  it('saves, lists and removes products, hiding ones that can no longer be bought', async () => {
    const v = await approvedVendor();
    const a = await makeProduct(v.vendorId, { title: 'Kettle' });
    const b = await makeProduct(v.vendorId, { title: 'Toaster' });
    const c = await login('customer');
    const h = auth(c.token);

    await api().put(`/api/me/wishlist/${a._id}`).set(h);
    await api().put(`/api/me/wishlist/${b._id}`).set(h);
    await api().put(`/api/me/wishlist/${a._id}`).set(h);
    let list = await api().get('/api/me/wishlist').set(h);
    expect(list.body.items.map((i) => i.title)).toEqual(['Toaster', 'Kettle']);
    expect(list.body.items[0]).toMatchObject({ vendorName: 'Test Store', price: 50 });

    await Vendor.updateOne({ _id: v.vendorId }, { status: 'suspended' });
    expect((await api().get('/api/me/wishlist').set(h)).body.items).toEqual([]);
    await Vendor.updateOne({ _id: v.vendorId }, { status: 'approved' });

    await api().delete(`/api/me/wishlist/${b._id}`).set(h);
    list = await api().get('/api/me/wishlist').set(h);
    expect(list.body.items.map((i) => i.title)).toEqual(['Kettle']);

    expect((await api().put('/api/me/wishlist/000000000000000000000000').set(h)).status).toBe(404);
    expect((await api().put('/api/me/wishlist/nope').set(h)).status).toBe(404);
    expect((await api().delete('/api/me/wishlist/nope').set(h)).status).toBe(400);
    expect((await api().get('/api/me/wishlist')).status).toBe(401);
  });

  it('keeps the latest views first with no repeats', async () => {
    const v = await approvedVendor();
    const products = [];
    for (let i = 0; i < 14; i++) products.push(await makeProduct(v.vendorId, { title: `Item ${i}` }));
    const c = await login('customer');
    const h = auth(c.token);
    for (const p of products) await api().post(`/api/me/recent/${p._id}`).set(h);
    await api().post(`/api/me/recent/${products[5]._id}`).set(h);

    const res = await api().get('/api/me/recent').set(h);
    expect(res.body.items).toHaveLength(12);
    expect(res.body.items.slice(0, 3).map((i) => i.title)).toEqual(['Item 5', 'Item 13', 'Item 12']);
    expect((await api().post('/api/me/recent/bad').set(h)).status).toBe(400);
  });
});

describe('store approval email', () => {
  it('tells the owner when their store goes live', async () => {
    const v = await login('vendor');
    const onboard = await api().post('/api/vendors/onboard').set(auth(v.token)).send({ storeName: 'Kiln' });
    const admin = await login('admin');
    outbox.length = 0;
    await api()
      .patch(`/api/admin/vendors/${onboard.body.vendor._id}`)
      .set(auth(admin.token))
      .send({ status: 'approved' });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: v.user.email, subject: 'Kiln is approved' });

    // re-approving after a suspension isn't news
    for (const status of ['suspended', 'approved']) {
      await api()
        .patch(`/api/admin/vendors/${onboard.body.vendor._id}`)
        .set(auth(admin.token))
        .send({ status });
    }
    expect(outbox).toHaveLength(1);
    const missing = await api()
      .patch('/api/admin/vendors/000000000000000000000000')
      .set(auth(admin.token))
      .send({ status: 'approved' });
    expect(missing.status).toBe(404);
  });
});

describe('search fallback', () => {
  it('matches part of a word when whole-word search finds nothing', async () => {
    const v = await approvedVendor();
    await makeProduct(v.vendorId, { title: 'iPhone 15 Case', category: 'mobile-accessories' });
    await makeProduct(v.vendorId, { title: 'Desk Lamp', category: 'home' });

    const partial = await api().get('/api/products?q=phone');
    expect(partial.body.items.map((i) => i.title)).toEqual(['iPhone 15 Case']);
    const multi = await api().get('/api/products?q=phone case&sort=price_asc');
    expect(multi.body.total).toBe(1);
    expect((await api().get('/api/products?q=phone kettle')).body.total).toBe(0);
    expect((await api().get('/api/products?q=(')).status).toBe(200);
    // whole words still use the text index
    expect((await api().get('/api/products?q=lamp')).body.items[0].title).toBe('Desk Lamp');
  });
});

describe('API docs and request ids', () => {
  it('serves the OpenAPI spec and Swagger UI', async () => {
    const spec = await api().get('/api/openapi.json');
    expect(spec.body.openapi).toBe('3.0.3');
    expect(spec.body.paths['/orders/{id}/refund'].post.requestBody).toBeTruthy();
    expect(spec.body.paths['/products'].get.security).toBeUndefined();
    expect(spec.body.paths['/cart'].get.security).toEqual([{ bearer: [] }]);

    const ui = await api().get('/api/docs/');
    expect(ui.text).toContain('swagger-ui');
  });

  it('returns a request id, reusing one sent by a proxy', async () => {
    const own = await api().get('/api/health');
    expect(own.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const passed = await api().get('/api/health').set('X-Request-Id', 'abc-123');
    expect(passed.headers['x-request-id']).toBe('abc-123');
  });
});
