import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import config from '../src/config.js';
import Review from '../src/models/Review.js';
import Product from '../src/models/Product.js';
import { writeInvoice } from '../src/lib/invoice.js';
import { startJobs } from '../src/lib/jobs.js';
import { uploadImage } from '../src/lib/storage.js';
import { api, approvedVendor, auth, login, makeProduct } from './helpers.js';

const s3 = vi.hoisted(() => ({ send: vi.fn(async () => ({})) }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function S3Client() {
    return s3;
  }),
  PutObjectCommand: vi.fn(function PutObjectCommand(input) {
    this.input = input;
  }),
}));

const pdfText = (order) =>
  new Promise((resolve) => {
    const out = new PassThrough();
    const chunks = [];
    out.on('data', (c) => chunks.push(c));
    out.on('end', () => resolve(Buffer.concat(chunks)));
    writeInvoice(out, { order, vendor: { storeName: 'Shop' }, customer: { name: 'Ana', email: 'a@b.c' } });
  });

describe('reviews', () => {
  it('lets the author or an admin delete a review and keeps the rating right', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId);
    const c1 = await login('customer');
    const c2 = await login('customer');
    const post = (c, rating) =>
      api().post(`/api/products/${p._id}/reviews`).set(auth(c.token)).send({ rating, body: 'ok' });
    const r1 = await post(c1, 5);
    const r2 = await post(c2, 1);
    expect((await Product.findById(p._id)).ratingAvg).toBe(3);

    const denied = await api()
      .delete(`/api/products/${p._id}/reviews/${r1.body.review._id}`)
      .set(auth(c2.token));
    expect(denied.status).toBe(403);

    await api().delete(`/api/products/${p._id}/reviews/${r2.body.review._id}`).set(auth(c2.token));
    expect((await Product.findById(p._id)).ratingAvg).toBe(5);

    const admin = await login('admin');
    await api().delete(`/api/products/${p._id}/reviews/${r1.body.review._id}`).set(auth(admin.token));
    expect(await Review.countDocuments()).toBe(0);
    expect((await Product.findById(p._id)).ratingCount).toBe(0);

    const gone = await api()
      .delete(`/api/products/${p._id}/reviews/${r1.body.review._id}`)
      .set(auth(admin.token));
    expect(gone.status).toBe(404);
  });
});

describe('S3 uploads', () => {
  it('puts the file in the bucket and returns its public url', async () => {
    config.s3.bucket = 'vendora-test';
    try {
      const url = await uploadImage({ mimetype: 'image/png', buffer: Buffer.from('x') }, 'vendors/1');
      expect(url).toMatch(/^https:\/\/vendora-test\.s3\.ap-south-1\.amazonaws\.com\/vendors\/1\/.+\.png$/);
      expect(s3.send.mock.calls[0][0].input).toMatchObject({
        Bucket: 'vendora-test',
        ContentType: 'image/png',
      });

      config.s3.publicUrl = 'https://cdn.example.com';
      expect(await uploadImage({ mimetype: 'image/webp', buffer: Buffer.from('x') })).toMatch(
        /^https:\/\/cdn\.example\.com\/products\/.+\.webp$/,
      );
    } finally {
      config.s3.bucket = '';
      config.s3.publicUrl = '';
    }
  });
});

describe('invoices', () => {
  const base = {
    orderNumber: 'VD-1',
    status: 'delivered',
    createdAt: new Date(),
    items: [{ title: 'Lamp', quantity: 1, price: 20 }],
    subtotal: 20,
    total: 20,
  };

  it('renders with and without the optional lines', async () => {
    const plain = await pdfText(base);
    const full = await pdfText({
      ...base,
      discount: 2,
      couponCode: 'TEN',
      shippingFee: 5,
      refundedTotal: 3,
      total: 23,
      payment: { paidAt: new Date() },
      shippingAddress: { line1: '1 Main St', city: 'Manila', postalCode: '1000', country: 'PH' },
    });
    expect(plain.subarray(0, 4).toString()).toBe('%PDF');
    expect(full.length).toBeGreaterThan(plain.length);
  });
});

describe('error handling', () => {
  it('turns bad ids, duplicates and oversized uploads into 4xx', async () => {
    expect((await api().get('/api/products/not-an-id')).body.error).toBe('Invalid id');

    const v = await approvedVendor();
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const upload = await api()
      .post('/api/products/images')
      .set(auth(v.token))
      .attach('images', big, { filename: 'a.png', contentType: 'image/png' });
    expect(upload.status).toBe(400);

    const dup = await api()
      .post('/api/auth/register')
      .send({ name: 'Dup', email: v.user.email, password: 'password123' });
    expect(dup.status).toBe(409);
    expect((await api().get('/api/nope')).status).toBe(404);
  });
});

describe('access rules', () => {
  it('keeps coupons to admins and onboarded vendors', async () => {
    const c = await login('customer');
    expect((await api().get('/api/coupons').set(auth(c.token))).status).toBe(403);
    const fresh = await login('vendor');
    const res = await api().get('/api/coupons').set(auth(fresh.token));
    expect(res.body.error).toMatch(/onboarding/);

    const v = await approvedVendor();
    const gone = await api().delete('/api/coupons/000000000000000000000000').set(auth(v.token));
    expect(gone.status).toBe(404);
  });

  it('hides stores that are not approved', async () => {
    const v = await login('vendor');
    await api().post('/api/vendors/onboard').set(auth(v.token)).send({ storeName: 'Waiting Room' });
    expect((await api().get('/api/vendors/waiting-room')).status).toBe(404);
  });

  it('reports redis as down on the health check when it is', async () => {
    const { getRedis } = await import('../src/lib/redis.js');
    const spy = vi.spyOn(getRedis(), 'ping').mockRejectedValueOnce(new Error('down'));
    const res = await api().get('/api/health');
    spy.mockRestore();
    expect(res.body).toMatchObject({ redis: 'down', mongo: 'up', payments: 'mock' });
  });

  it('ignores Stripe webhooks when Stripe is off', async () => {
    const res = await api().post('/api/webhooks/stripe').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(404);
  });
});

describe('jobs runner', () => {
  it('starts an unref-ed timer so it never keeps the process alive', () => {
    const timer = startJobs();
    expect(timer.hasRef()).toBe(false);
    clearInterval(timer);
  });
});
