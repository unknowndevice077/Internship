import { Router } from 'express';
import { z } from 'zod';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import { createSession, destroySession, requireAuth } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  // admins are created by the seed script, never through signup
  role: z.enum(['customer', 'vendor']).default('customer'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function profile(user) {
  const vendor = user.role === 'vendor' ? await Vendor.findOne({ owner: user._id }) : null;
  return { user, vendor };
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    if (await User.exists({ email: data.email.toLowerCase() })) {
      throw new HttpError(409, 'Email is already registered');
    }
    const user = await User.create(data);
    const token = await createSession(user);
    res.status(201).json({ token, ...(await profile(user)) });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.checkPassword(password))) {
      throw new HttpError(401, 'Wrong email or password');
    }
    if (!user.isActive) throw new HttpError(403, 'This account is disabled');
    const token = await createSession(user);
    res.json({ token, ...(await profile(user)) });
  }),
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await destroySession(req.user.sid, req.user.id);
    res.status(204).end();
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new HttpError(404, 'User not found');
    res.json(await profile(user));
  }),
);

const addressSchema = z.object({
  line1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().optional(),
  postalCode: z.string().min(1),
  country: z.string().min(2),
});

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = z
      .object({ name: z.string().trim().min(2).optional(), address: addressSchema.optional() })
      .parse(req.body);
    const user = await User.findByIdAndUpdate(req.user.id, data, { returnDocument: 'after' });
    res.json({ user });
  }),
);

export default router;
