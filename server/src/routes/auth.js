import { Router } from 'express';
import { z } from 'zod';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import { createSession, destroySession, destroyUserSessions, requireAuth } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { issueToken, useToken } from '../lib/tokens.js';
import { sendMail, templates } from '../lib/mail.js';

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

async function sendVerification(user) {
  const token = await issueToken('verify', user._id, 60 * 60 * 24);
  await sendMail(user.email, templates.verifyEmail(user, token));
}

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
    await sendVerification(user);
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

router.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    const userId = await useToken('verify', token);
    if (!userId) throw new HttpError(400, 'This link is invalid or has expired');
    await User.updateOne({ _id: userId }, { emailVerified: true });
    res.json({ verified: true });
  }),
);

router.post(
  '/resend-verification',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user.emailVerified) await sendVerification(user);
    res.status(204).end();
  }),
);

// always 204 so this can't be used to check which emails have accounts
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (user) {
      const token = await issueToken('reset', user._id, 60 * 60);
      await sendMail(user.email, templates.resetPassword(user, token));
    }
    res.status(204).end();
  }),
);

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = z
      .object({ token: z.string().min(1), password: z.string().min(8).max(100) })
      .parse(req.body);
    const userId = await useToken('reset', token);
    const user = userId && (await User.findById(userId));
    if (!user) throw new HttpError(400, 'This link is invalid or has expired');
    user.password = password;
    // getting the email proves they own it
    user.emailVerified = true;
    await user.save();
    await destroyUserSessions(user._id.toString());
    res.json({ reset: true });
  }),
);

export default router;
