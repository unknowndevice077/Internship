import Redis from 'ioredis';
import { createRequire } from 'node:module';
import config from '../config.js';

let client;

export function getRedis() {
  if (!client) {
    if (config.redisUrl) {
      client = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });
    } else {
      // dev/test only, ioredis-mock is a devDependency so production never loads it
      const RedisMock = createRequire(import.meta.url)('ioredis-mock');
      client = new RedisMock();
    }
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
