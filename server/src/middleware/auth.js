import jwt from 'jsonwebtoken';
import config from '../config.js';
import { getRedis } from '../lib/redis.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import { HttpError } from './error.js';

const sessionKey = (sid) => `session:${sid}`;

export async function createSession(user) {
  const sid = crypto.randomUUID();
  const payload = { id: user._id.toString(), role: user.role, name: user.name, email: user.email };
  await getRedis().set(sessionKey(sid), JSON.stringify(payload), 'EX', config.sessionTtlSeconds);
  const token = jwt.sign({ sub: payload.id, role: user.role, sid }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  return token;
}

export async function destroySession(sid) {
  await getRedis().del(sessionKey(sid));
}

// Verifies the JWT and checks the session still exists in Redis, so logout
// actually kills the token instead of waiting for it to expire.
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Not logged in');

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }

    const redis = getRedis();
    let session = await redis.get(sessionKey(decoded.sid));
    if (!session) throw new HttpError(401, 'Session expired, please log in again');
    session = JSON.parse(session);

    req.user = { ...session, sid: decoded.sid };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Not logged in'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Not allowed'));
    next();
  };
}

// Loads the caller's vendor profile onto req.vendor.
export function requireVendor({ approved = false } = {}) {
  return async (req, _res, next) => {
    try {
      if (req.user?.role !== 'vendor') throw new HttpError(403, 'Vendor account required');
      const vendor = await Vendor.findOne({ owner: req.user.id });
      if (!vendor) throw new HttpError(403, 'Finish vendor onboarding first');
      if (approved && vendor.status !== 'approved') {
        throw new HttpError(403, 'Your store is waiting for admin approval');
      }
      req.vendor = vendor;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function refreshSession(sid, userId) {
  const user = await User.findById(userId);
  if (!user) return;
  const payload = { id: user._id.toString(), role: user.role, name: user.name, email: user.email };
  await getRedis().set(sessionKey(sid), JSON.stringify(payload), 'EX', config.sessionTtlSeconds);
}
