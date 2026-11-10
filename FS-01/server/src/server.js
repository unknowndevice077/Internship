import './lib/sentry.js';
import mongoose from 'mongoose';
import config from './config.js';
import { createApp } from './app.js';
import { ensureIndex } from './lib/search.js';
import { closeRedis } from './lib/redis.js';
import { startJobs } from './lib/jobs.js';
import logger from './lib/logger.js';

async function start() {
  await mongoose.connect(config.mongoUri);
  logger.info('MongoDB connected');

  try {
    await ensureIndex();
  } catch (err) {
    logger.warn({ err: err.message }, 'Elasticsearch not reachable, search will be degraded');
  }

  const server = createApp().listen(config.port, () => {
    logger.info(`API listening on http://localhost:${config.port}`);
  });

  const jobs = startJobs();

  const shutdown = async () => {
    clearInterval(jobs);
    server.close();
    await Promise.allSettled([mongoose.disconnect(), closeRedis()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  logger.fatal(err);
  process.exit(1);
});
