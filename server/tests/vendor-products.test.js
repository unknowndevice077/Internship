import { describe, expect, it } from 'vitest';
import { api, approvedVendor, auth, login, makeProduct } from './helpers.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('vendor onboarding and products', () => {
  it('needs admin approval before listing products', async () => {
    const v = await login('vendor');
    const onboard = await api()
      .post('/api/vendors/onboard')
      .set(auth(v.token))
      .send({ storeName: 'Glow Co' });
    expect(onboard.status).toBe(201);
    expect(onboard.body.vendor.status).toBe('pending');
    expect(onboard.body.vendor.slug).toBe('glow-co');

    const product = { title: 'Lip Balm', category: 'beauty', price: 5, stock: 3 };
    expect((await api().post('/api/products').set(auth(v.token)).send(product)).status).toBe(403);

    const admin = await login('admin');
    const approve = await api()
      .patch(`/api/admin/vendors/${onboard.body.vendor._id}`)
      .set(auth(admin.token))
      .send({ status: 'approved' });
    expect(approve.body.vendor.status).toBe('approved');

    const created = await api().post('/api/products').set(auth(v.token)).send(product);
    expect(created.status).toBe(201);
  });

  it('sets up mock payouts', async () => {
    const v = await approvedVendor();
    const res = await api().post('/api/vendors/me/payouts').set(auth(v.token));
    expect(res.status).toBe(200);
    expect(res.body.vendor.stripeAccountId).toBeTruthy();
  });

  it('partial updates leave the other fields alone', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { stock: 7, images: ['/uploads/a.png'], tags: ['x'] });
    await api().patch(`/api/products/${p._id}`).set(auth(v.token)).send({ isActive: false });
    const res = await api().patch(`/api/products/${p._id}`).set(auth(v.token)).send({ isActive: true });
    expect(res.body.product).toMatchObject({ stock: 7, images: ['/uploads/a.png'], tags: ['x'] });
  });

  it('only lets the owner edit or delete a product', async () => {
    const a = await approvedVendor('Store A');
    const b = await approvedVendor('Store B');
    const p = await makeProduct(a.vendorId);

    const hijack = await api().patch(`/api/products/${p._id}`).set(auth(b.token)).send({ price: 1 });
    expect(hijack.status).toBe(403);

    const edit = await api().patch(`/api/products/${p._id}`).set(auth(a.token)).send({ price: 42 });
    expect(edit.body.product.price).toBe(42);

    expect((await api().delete(`/api/products/${p._id}`).set(auth(a.token))).status).toBe(204);
    expect((await api().get(`/api/products/${p._id}`)).status).toBe(404);
  });

  it('validates product input', async () => {
    const v = await approvedVendor();
    const res = await api().post('/api/products').set(auth(v.token)).send({ title: 'x', price: -1 });
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('price');
  });

  it('uploads images (local storage when S3 is not configured)', async () => {
    const v = await approvedVendor();
    const res = await api()
      .post('/api/products/images')
      .set(auth(v.token))
      .attach('images', PNG, { filename: 'dot.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.urls[0]).toMatch(/^\/uploads\/vendors\/.+\.png$/);
  });

  it('serves product details from the Redis cache after the first read', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId);
    const first = await api().get(`/api/products/${p._id}`);
    expect(first.body.product.vendor.storeName).toBe('Test Store');

    // a write behind the API's back isn't seen until the cache is dropped
    await p.updateOne({ title: 'Changed directly' });
    const second = await api().get(`/api/products/${p._id}`);
    expect(second.body.product.title).toBe('Blue Running Shoes');
  });
});

describe('search (mongo fallback)', () => {
  it('filters and sorts', async () => {
    const v = await approvedVendor();
    await makeProduct(v.vendorId, { title: 'Red Running Shoes', price: 80, ratingAvg: 4.8 });
    await makeProduct(v.vendorId, { title: 'Trail Running Shoes', price: 30, ratingAvg: 3.1 });
    await makeProduct(v.vendorId, { title: 'Coffee Mug', category: 'kitchen', price: 12 });

    const all = await api().get('/api/products?q=running&sort=price_asc');
    expect(all.body.engine).toBe('mongo');
    expect(all.body.items.map((i) => i.price)).toEqual([30, 80]);

    const filtered = await api().get('/api/products?category=shoes&minPrice=50&minRating=4');
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].title).toBe('Red Running Shoes');
    expect(filtered.body.facets.categories[0]).toEqual({ value: 'shoes', count: 1 });
  });

  it('hides products from unapproved stores', async () => {
    const v = await login('vendor');
    const onboard = await api().post('/api/vendors/onboard').set(auth(v.token)).send({ storeName: 'Hidden' });
    await makeProduct(onboard.body.vendor._id);
    const res = await api().get('/api/products');
    expect(res.body.total).toBe(0);
  });
});
