import { defineConfig } from "@playwright/test";

const API_PORT = 8020;
const WEB_PORT = 5191;
const python = process.env.E2E_PYTHON ?? "python";

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/test-results",
  // tests share one database, so keep them in order
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: process.env.PW_CHANNEL,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `${python} manage.py runserver ${API_PORT} --noreload`,
      cwd: "../backend",
      url: `http://localhost:${API_PORT}/api/health/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        CELERY_TASK_ALWAYS_EAGER: "1",
        WEBHOOK_ALLOW_PRIVATE_URLS: "1",
        DJANGO_DEBUG: "1",
        // the suite invites people from freshly registered accounts
        REQUIRE_VERIFIED_EMAIL: "0",
        // the suite signs in far more often than a person would
        THROTTLE_AUTH_RATE: "1000/min",
        THROTTLE_ANON_RATE: "1000/min",
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
});
