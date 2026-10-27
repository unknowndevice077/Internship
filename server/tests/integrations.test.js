import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import Vendor from '../src/models/Vendor.js';
import Order from '../src/models/Order.js';
import { address, api, approvedVendor, auth, login, makeProduct } from './helpers.js';

// fake Stripe SDK, records what we asked it to do
const stripe = vi.hoisted(() => ({
  accounts: {
    create: vi.fn(async () => ({ id: 'acct_test_1' })),
    retrieve: vi.fn(async () => ({ charges_enabled: true, payouts_enabled: true })),
  },
  accountLinks: { create: vi.fn(async () => ({ url: 'https://connect.stripe.test/onboard' })) },
  paymentIntents: {
    create: vi.fn(async (p) => ({ id: 'pi_test_1', client_secret: 'pi_test_1_secret', ...p })),
    retrieve: vi.fn(async () => ({ id: 'pi_test_1', status: 'succeeded', latest_charge: 'ch_test_1' })),
  },
  transfers: { create: vi.fn(async () => ({ id: 'tr_test_1' })) },
  refunds: { create: vi.fn(async () => ({ id: 're_test_1' })) },
  webhooks: { constructEvent: vi.fn((body) => JSON.parse(body.toString())) },
}));
vi.mock('stripe', () => ({ default: vi.fn(function Stripe() { return stripe; }) }));

// fake Elasticsearch client
const es = vi.hoisted(() => ({
  indices: { exists: vi.fn(async () => false), create: vi.fn(), delete: vi.fn() },
  index: vi.fn(),
  delete: vi.fn(),
  bulk: vi.fn(),
  search: vi.fn(async () => ({
    hits: { total: { value: 1 }, hits: [{ _id: 'abc', _source: { title: 'Indexed Shoe', price: 10 } }] },
    aggregations: {
      categories: { buckets: [{ key: 'shoes', doc_count: 1 }] },
      brands: { buckets: [] },
      price: { min: 10, max: 10 },
    },
  })),
}));
vi.mock('@elastic/elasticsearch', () => ({ Client: vi.fn(function Client() { return es; }) }));

describe('with Stripe Connect enabled', () => {
  beforeAll(() => {
    config.stripe.secretKey = 'sk_test_fake';
    config.stripe.webhookSecret = 'whsec_fake';
  });
  afterAll(() => {
    config.stripe.secretKey = '';
  });
  beforeEach(() => vi.clearAllMocks());

  it('onboards a vendor to an Express account', async () => {
    const v = await approvedVendor();
    await Vendor.updateOne({ _id: v.vendorId }, { $unset: { stripeAccountId: 1 } });
    const res = await api().post('/api/vendors/me/payouts').set(auth(v.token));
    expect(res.body.url).toBe('https://connect.stripe.test/onboard');
    expect(stripe.accounts.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'express' }));

    const status = await api().get('/api/vendors/me/payouts').set(auth(v.token));
    expect(status.body.vendor.payoutsEnabled).toBe(true);
  });

  it('charges once and transfers each vendor their share', async () => {
    const a = await approvedVendor('Store A');
    const b = await approvedVendor('Store B');
    await Vendor.updateOne({ _id: b.vendorId }, { commissionRate: 0.2 });
    const p1 = await makeProduct(a.vendorId, { price: 100 });
    const p2 = await makeProduct(b.vendorId, { price: 50 });
    const c = await login('customer');
    for (const p of [p1, p2]) {
      await api().post('/api/cart/items').set(auth(c.token)).send({ productId: p._id, quantity: 1 });
    }

    const checkout = await api().post('/api/orders/checkout').set(auth(c.token)).send({ shippingAddress: address });
    expect(checkout.body.provider).toBe('stripe');
    expect(checkout.body.clientSecret).toBe('pi_test_1_secret');
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 15000, transfer_group: checkout.body.paymentGroup }),
    );

    // Stripe tells us the payment succeeded
    const event = {
      type: 'payment_intent.succeeded',
      data: { object: { metadata: { paymentGroup: checkout.body.paymentGroup } } },
    };
    const hook = await api()
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 'sig')
      .send(JSON.stringify(event));
    expect(hook.status).toBe(200);

    const amounts = stripe.transfers.create.mock.calls.map(([t]) => t.amount).sort((x, y) => x - y);
    expect(amounts).toEqual([4000, 9000]); // 50 - 20%, 100 - 10%
    expect(stripe.transfers.create.mock.calls[0][0].source_transaction).toBe('ch_test_1');

    const orders = await Order.find({ paymentGroup: checkout.body.paymentGroup });
    expect(orders.every((o) => o.status === 'placed' && o.payment.transferId === 'tr_test_1')).toBe(true);
  });

  it('refunds when a paid order is cancelled', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { price: 20 });
    const c = await login('customer');
    await api().post('/api/cart/items').set(auth(c.token)).send({ productId: p._id, quantity: 1 });
    const checkout = await api().post('/api/orders/checkout').set(auth(c.token)).send({ shippingAddress: address });
    await api().post(`/api/orders/confirm/${checkout.body.paymentGroup}`).set(auth(c.token));

    const id = checkout.body.orders[0]._id;
    await api().patch(`/api/orders/${id}/status`).set(auth(v.token)).send({ status: 'cancelled' });
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_test_1', amount: 2000 });
  });

  it('updates payout status from account.updated webhooks', async () => {
    const v = await approvedVendor();
    await Vendor.updateOne({ _id: v.vendorId }, { stripeAccountId: 'acct_hook', payoutsEnabled: false });
    const event = { type: 'account.updated', data: { object: { id: 'acct_hook', charges_enabled: true, payouts_enabled: true } } };
    await api().post('/api/webhooks/stripe').set('Content-Type', 'application/json').send(JSON.stringify(event));
    expect((await Vendor.findById(v.vendorId)).payoutsEnabled).toBe(true);
  });

  it('rejects webhooks with a bad signature', async () => {
    stripe.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error('bad signature');
    });
    const res = await api().post('/api/webhooks/stripe').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
  });
});

describe('with Elasticsearch enabled', () => {
  beforeAll(() => {
    config.elasticUrl = 'http://es.test:9200';
  });
  afterAll(() => {
    config.elasticUrl = '';
  });
  beforeEach(() => vi.clearAllMocks());

  it('indexes products when they are created', async () => {
    const v = await approvedVendor();
    await api()
      .post('/api/products')
      .set(auth(v.token))
      .send({ title: 'Trail Shoe', category: 'shoes', price: 60, stock: 4 });
    expect(es.index).toHaveBeenCalledWith(
      expect.objectContaining({ index: 'products', document: expect.objectContaining({ title: 'Trail Shoe', vendorName: 'Test Store' }) }),
    );
  });

  it('builds a filtered, sorted query', async () => {
    const res = await api().get('/api/products?q=shoe&category=shoes&minPrice=5&maxPrice=50&sort=price_asc');
    expect(res.body.engine).toBe('elasticsearch');
    expect(res.body.items[0].title).toBe('Indexed Shoe');

    const query = es.search.mock.calls[0][0];
    expect(query.query.bool.must[0].multi_match.query).toBe('shoe');
    expect(query.query.bool.filter).toEqual(
      expect.arrayContaining([{ term: { category: 'shoes' } }, { range: { price: { gte: 5, lte: 50 } } }]),
    );
    expect(query.sort).toEqual([{ price: 'asc' }]);
  });

  it('drops products from the index when a vendor is suspended', async () => {
    const v = await approvedVendor();
    await makeProduct(v.vendorId);
    const admin = await login('admin');
    await api().patch(`/api/admin/vendors/${v.vendorId}`).set(auth(admin.token)).send({ status: 'suspended' });
    expect(es.delete).toHaveBeenCalled();
  });

  it('pushes the new stock to search after a purchase', async () => {
    const v = await approvedVendor();
    const p = await makeProduct(v.vendorId, { stock: 5 });
    const c = await login('customer');
    await api().post('/api/cart/items').set(auth(c.token)).send({ productId: p._id, quantity: 2 });
    const checkout = await api().post('/api/orders/checkout').set(auth(c.token)).send({ shippingAddress: address });
    es.index.mockClear();
    await api().post(`/api/orders/confirm/${checkout.body.paymentGroup}`).set(auth(c.token));
    expect(es.index).toHaveBeenCalledWith(
      expect.objectContaining({ id: p._id.toString(), document: expect.objectContaining({ stock: 3 }) }),
    );
  });

  it('reindexes everything on demand', async () => {
    const v = await approvedVendor();
    await makeProduct(v.vendorId);
    await makeProduct(v.vendorId, { title: 'Second' });
    const admin = await login('admin');
    const res = await api().post('/api/admin/search/reindex').set(auth(admin.token));
    expect(res.body.indexed).toBe(2);
    expect(es.bulk.mock.calls[0][0].operations).toHaveLength(4);
  });
});
