import { getRedis } from './redis.js';
import { expireReservations, retryFailedTransfers } from './orders.js';
import logger from './logger.js';

const INTERVAL_MS = 60 * 1000;

// Redis lock so only one API instance runs the jobs each minute
async function withLock(name, fn) {
  const ok = await getRedis().set(`lock:${name}`, process.pid, 'EX', 55, 'NX');
  if (!ok) return;
  await fn();
}

export async function runJobs() {
  await withLock('jobs', async () => {
    const expired = await expireReservations();
    const retried = await retryFailedTransfers();
    if (expired || retried) logger.info({ expired, retried }, 'jobs ran');
  });
}

export function startJobs() {
  const timer = setInterval(
    () => runJobs().catch((err) => logger.error({ err }, 'jobs failed')),
    INTERVAL_MS,
  );
  timer.unref();
  return timer;
}
