import jwt from 'jsonwebtoken';
import config from '../config.js';
import { getRedis } from '../lib/redis.js';
import Vendor from '../models/Vendor.js';
import { HttpError } from './error.js';

const sessionKey = (sid) => `session:${sid}`;
// set of a user's session ids, so an admin can log them out everywhere
const userSessionsKey = (userId) => `user-sessions:${userId}`;

export async function createSession(user) {
  const sid = crypto.randomUUID();
  const userId = user._id.toString();
  const payload = { id: userId, role: user.role, name: user.name, email: user.email };
  await getRedis()
    .multi()
    .set(sessionKey(sid), JSON.stringify(payload), 'EX', config.sessionTtlSeconds)
    .sadd(userSessionsKey(userId), sid)
    .expire(userSessionsKey(userId), config.sessionTtlSeconds)
    .exec();
  return jwt.sign({ sub: userId, role: user.role, sid }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export async function destroySession(sid, userId) {
  await getRedis().multi().del(sessionKey(sid)).srem(userSessionsKey(userId), sid).exec();
}

export async function destroyUserSessions(userId) {
  const redis = getRedis();
  const sids = await redis.smembers(userSessionsKey(userId));
  await redis.del(userSessionsKey(userId), ...sids.map(sessionKey));
}

// session check in Redis so logout actually kills the token
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
