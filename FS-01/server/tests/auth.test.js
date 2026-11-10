import { describe, expect, it } from 'vitest';
import { api, auth, login } from './helpers.js';

describe('auth', () => {
  it('registers, logs in and returns the profile', async () => {
    const reg = await api()
      .post('/api/auth/register')
      .send({ name: 'Maya', email: 'maya@test.dev', password: 'password123' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.role).toBe('customer');
    expect(reg.body.user.password).toBeUndefined();

    const me = await api().get('/api/auth/me').set(auth(reg.body.token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('maya@test.dev');
  });

  it('rejects duplicate emails and bad passwords', async () => {
    const body = { name: 'Leo', email: 'leo@test.dev', password: 'password123' };
    await api().post('/api/auth/register').send(body);
    expect((await api().post('/api/auth/register').send(body)).status).toBe(409);
    const bad = await api().post('/api/auth/login').send({ email: body.email, password: 'nope-nope' });
    expect(bad.status).toBe(401);
  });

  it('does not allow signing up as admin', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 'x@test.dev', password: 'password123', role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('kills the token on logout', async () => {
    const { token } = await login();
    expect((await api().post('/api/auth/logout').set(auth(token))).status).toBe(204);
    expect((await api().get('/api/auth/me').set(auth(token))).status).toBe(401);
  });

  it('blocks routes by role', async () => {
    const customer = await login('customer');
    const vendor = await login('vendor');
    expect((await api().get('/api/admin/analytics').set(auth(customer.token))).status).toBe(403);
    expect((await api().get('/api/cart').set(auth(vendor.token))).status).toBe(403);
    expect((await api().get('/api/cart')).status).toBe(401);
  });
});
