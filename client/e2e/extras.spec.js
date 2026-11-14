import { expect, test } from '@playwright/test';
import { login, openProduct, register, unique } from './helpers';

test.describe('customer extras', () => {
  test('save products and see recently viewed ones', async ({ page }) => {
    await register(page, { name: 'Ava Test', email: `${unique('ava')}@test.dev` });
    // new accounts are asked to confirm their email
    await expect(page.getByText('Please confirm your email address')).toBeVisible();

    await openProduct(page, 'Red Lipstick');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await openProduct(page, 'iPhone X');
    await expect(page.getByRole('heading', { name: 'Recently viewed' })).toBeVisible();
    await expect(page.locator('.recent .product-card')).toContainText(/Lipstick/);

    await page.getByRole('link', { name: 'Saved' }).click();
    await expect(page.getByRole('heading', { name: 'Saved items' })).toBeVisible();
    await expect(page.locator('.saved-card')).toHaveCount(1);
    await page.getByRole('button', { name: /Remove .* from saved items/ }).click();
    await expect(page.getByText('Nothing saved yet')).toBeVisible();
  });

  test('cart shows shipping and how far off free shipping is', async ({ page }) => {
    await register(page, { name: 'Noah Test', email: `${unique('noah')}@test.dev` });
    await openProduct(page, 'Red Lipstick');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.getByRole('link', { name: /Cart/ }).click();
    await expect(page.locator('.summary .row', { hasText: 'Shipping' })).toContainText('$4.99');
    await expect(page.getByText(/more from Glow Beauty Co for free shipping/)).toBeVisible();
  });

  test('forgot password always answers the same way', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await page.getByPlaceholder('Email').fill('nobody-here@test.dev');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('a reset link is on its way')).toBeVisible();

    await page.goto('/reset-password?token=not-a-real-token');
    await page.getByPlaceholder(/New password/).fill('another-pass-1');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByText('invalid or has expired')).toBeVisible();
  });
});

test.describe('search, theme and layout', () => {
  test('search suggestions work from the keyboard', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('combobox', { name: 'Search' });
    await box.fill('iphone');
    await expect(page.getByRole('option').first()).toBeVisible();
    await box.press('ArrowDown');
    await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/products\//);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/iPhone/i);

    // partial words still find things
    await page.goto('/?q=phone');
    await expect(page.locator('.product-card').first()).toBeVisible();
  });

  test('dark mode toggles and is remembered', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const start = await html.getAttribute('data-theme');
    const other = start === 'dark' ? 'light' : 'dark';
    await page.getByRole('button', { name: `Switch to ${other} mode` }).click();
    await expect(html).toHaveAttribute('data-theme', other);
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', other);
  });

  test('filters fold away on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /^Filters/ });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Filters' })).toBeHidden();
    await toggle.click();
    await page.getByRole('button', { name: /^Show all/ }).click();
    await page.getByRole('button', { name: /^laptops/ }).click();
    await expect(toggle).toHaveText('Filters (1)');
  });

  test('product page has a breadcrumb and a star picker', async ({ page }) => {
    await login(page, 'customer@vendora.test');
    await openProduct(page, 'Red Lipstick');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(/beauty/i);
    const three = page.getByRole('radio', { name: '3 stars' });
    await three.click();
    await expect(three).toHaveAttribute('aria-checked', 'true');
  });

  test('unknown pages offer a way back', async ({ page }) => {
    await page.goto('/definitely-not-a-page');
    await expect(page.getByText('Page not found.')).toBeVisible();
    await page.getByRole('link', { name: 'Back to the shop' }).click();
    await expect(page.locator('.product-card').first()).toBeVisible();
  });

  test('skip link jumps to the content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  });
});

test.describe('seller and admin extras', () => {
  test('vendor filters orders, exports CSV and sets shipping', async ({ page }) => {
    await login(page, 'vendor@vendora.test');
    await page.getByRole('link', { name: 'Orders' }).click();
    await page.getByRole('button', { name: 'delivered', exact: true }).click();
    await expect(page).toHaveURL(/status=delivered/);
    await expect(page.locator('tbody tr').first()).toContainText('delivered');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/);

    await page.getByRole('link', { name: 'Store settings' }).click();
    await page.getByLabel('Flat rate per order ($)').fill('4.99');
    await page.getByLabel('Free when the order is over ($)').fill('50');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
  });

  test('admin sees the payouts page and API docs are up', async ({ page }) => {
    await login(page, 'admin@vendora.test');
    await page.getByRole('link', { name: 'Payouts' }).click();
    await expect(page.getByRole('heading', { name: 'Vendor payouts' })).toBeVisible();
    await expect(page.getByText('No failed payouts.')).toBeVisible();
    await page.getByRole('button', { name: 'paid' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();

    const spec = await page.request.get('/api/openapi.json');
    expect((await spec.json()).info.title).toBe('Vendora API');
  });
});
