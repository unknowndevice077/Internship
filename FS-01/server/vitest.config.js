import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    // each file gets its own in-memory mongo, keep them sequential so ports don't clash
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    env: {
      NODE_ENV: 'test',
      REDIS_URL: '',
      ELASTICSEARCH_URL: '',
      STRIPE_SECRET_KEY: '',
      S3_BUCKET: '',
    },
  },
});
