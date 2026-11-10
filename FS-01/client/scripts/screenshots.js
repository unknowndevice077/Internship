// Takes the README screenshots from a running, seeded app.
// usage: node scripts/screenshots.js [http://localhost:5173]
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://localhost:5173';
const out = new URL('../../docs/screenshots/', import.meta.url);
const PASSWORD = 'demo-pass-123';

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

async function session(theme = 'light') {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: theme,
    // skips the entrance animations so nothing is caught half faded
    reducedMotion: 'reduce',
  });
  await context.addInitScript((t) => localStorage.setItem('vendora_theme', t), theme);
  return context.newPage();
}

async function login(page, email) {
  await page.goto(`${base}/login`);
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Log out' }).waitFor();
}

async function shot(page, name) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, out)) });
  console.log(`saved ${name}.png`);
}

// storefront
let page = await session();
await page.goto(base);
await page.locator('.product-card').first().waitFor();
await shot(page, 'home');

await page.locator('.product-card').first().click();
await page.locator('.product-info h1').waitFor();
await shot(page, 'product');

page = await session('dark');
await page.goto(base);
await page.locator('.product-card').first().waitFor();
await shot(page, 'home-dark');

// customer: cart and an order
page = await session();
await login(page, 'customer@vendora.test');
await page.goto(`${base}/?q=lipstick`);
await page.locator('.product-card').first().click();
await page.getByRole('button', { name: 'Add to cart' }).click();
await page.getByText('Added to cart').waitFor();
await page.goto(`${base}/cart`);
await page.locator('.cart-row').first().waitFor();
await shot(page, 'cart');

await page.goto(`${base}/orders`);
await page.locator('.order-row').first().click();
await page.locator('.timeline').waitFor();
await shot(page, 'order');

// seller and admin
page = await session();
await login(page, 'vendor@vendora.test');
await page.goto(`${base}/vendor`);
await page.locator('.stat').first().waitFor();
await shot(page, 'seller-hub');

page = await session();
await login(page, 'admin@vendora.test');
await page.goto(`${base}/admin`);
await page.locator('.recharts-surface').first().waitFor();
await shot(page, 'admin');

await browser.close();
