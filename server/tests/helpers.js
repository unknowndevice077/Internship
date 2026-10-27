import request from 'supertest';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import Vendor from '../src/models/Vendor.js';
import Product from '../src/models/Product.js';

export const app = createApp();
export const api = () => request(app);

let counter = 0;

export async function login(role = 'customer', extra = {}) {
  counter += 1;
  const email = `${role}${counter}@test.dev`;
  if (role === 'admin') {
    await User.create({ name: 'Admin', email, password: 'password123', role: 'admin' });
  } else {
    await api().post('/api/auth/register').send({ name: `${role} ${counter}`, email, password: 'password123', role });
  }
  const res = await api().post('/api/auth/login').send({ email, password: 'password123' });
  return { token: res.body.token, user: res.body.user, ...extra };
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

// a vendor that is already onboarded and approved
export async function approvedVendor(storeName = 'Test Store') {
  const v = await login('vendor');
  const res = await api().post('/api/vendors/onboard').set(auth(v.token)).send({ storeName });
  await Vendor.updateOne({ _id: res.body.vendor._id }, { status: 'approved', stripeAccountId: 'mock_acct_x' });
  return { ...v, vendorId: res.body.vendor._id };
}

export async function makeProduct(vendorId, overrides = {}) {
  return Product.create({
    vendor: vendorId,
    title: 'Blue Running Shoes',
    category: 'shoes',
    brand: 'Stride',
    price: 50,
    stock: 10,
    ...overrides,
  });
}

export const address = { line1: '1 Main St', city: 'Manila', postalCode: '1000', country: 'PH' };
