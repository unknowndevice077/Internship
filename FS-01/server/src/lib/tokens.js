import { createHash, randomBytes } from 'node:crypto';
import { getRedis } from './redis.js';

// One-time tokens for email links. Only the hash is stored, so a Redis dump can't be used to log in.
const hash = (token) => createHash('sha256').update(token).digest('hex');

export async function issueToken(kind, userId, ttlSeconds) {
  const token = randomBytes(32).toString('base64url');
  await getRedis().set(`${kind}:${hash(token)}`, userId.toString(), 'EX', ttlSeconds);
  return token;
}

// returns the user id and deletes the token, or null if it's wrong or expired
export async function useToken(kind, token) {
  if (!token) return null;
  const key = `${kind}:${hash(token)}`;
  const redis = getRedis();
  const [[, userId]] = await redis.multi().get(key).del(key).exec();
  return userId;
}
