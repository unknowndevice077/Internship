import { defineConfig } from '@playwright/test';

const API_PORT = 4020;
const WEB_PORT = 5200;

// Each run boots its own seeded API (in-memory Mongo, mock Redis/payments) and a Vite dev server,
// so the tests never touch your local database.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm --prefix ../server run dev:memory',
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        NODE_ENV: 'development',
        CLIENT_URL: `http://localhost:${WEB_PORT}`,
        REDIS_URL: '',
        ELASTICSEARCH_URL: '',
        STRIPE_SECRET_KEY: '',
        S3_BUCKET: '',
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { VITE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
});
