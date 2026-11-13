import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

const API_PORT = 4021;
const WEB_PORT = 5201;

// Same tests, but against the real MongoDB, Redis and Elasticsearch from docker-compose
// (`docker compose up -d mongo redis elasticsearch`). Uses its own database, Redis db and index,
// so it doesn't touch your dev data. Payments stay on the mock provider.
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${WEB_PORT}` },
  webServer: [
    {
      command: 'npm --prefix ../server run seed && npm --prefix ../server start',
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        NODE_ENV: 'development',
        CLIENT_URL: `http://localhost:${WEB_PORT}`,
        MONGO_URI: 'mongodb://127.0.0.1:27017/vendora_e2e',
        REDIS_URL: 'redis://127.0.0.1:6379/5',
        ELASTICSEARCH_URL: 'http://127.0.0.1:9200',
        ELASTICSEARCH_INDEX: 'products_e2e',
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
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
