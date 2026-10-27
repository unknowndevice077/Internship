import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';
import config from '../config.js';

let client;

export function getRedis() {
  if (!client) {
    client = config.redisUrl
      ? new Redis(config.redisUrl, { maxRetriesPerRequest: 2 })
      : new RedisMock();
  }
  return client;
}

export async function closeRedis() {
  if (client) {
    await client.quit();
    client = undefined;
  }
}

// small read-through cache helper
export async function cached(key, ttlSeconds, load) {
  const redis = getRedis();
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);
  const value = await load();
  if (value !== null && value !== undefined) {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
  return value;
}
