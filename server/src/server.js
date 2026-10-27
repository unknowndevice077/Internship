import mongoose from 'mongoose';
import config from './config.js';
import { createApp } from './app.js';
import { ensureIndex } from './lib/search.js';
import { closeRedis } from './lib/redis.js';

async function start() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  try {
    await ensureIndex();
  } catch (err) {
    console.warn('Elasticsearch not reachable, search will be degraded:', err.message);
  }

  const server = createApp().listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    server.close();
    await Promise.allSettled([mongoose.disconnect(), closeRedis()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
