import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('browsing as a guest', () => {
  test('shop lists seeded products with facets', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'All products' })).toBeVisible();
    await expect(page.getByText('194 items')).toBeVisible();
    await expect(page.locator('.product-card')).toHaveCount(24);
  });

  test('filters by category, price and rating, and sorts', async ({ page }) => {
    await page.goto('/');
    await page.locator('.facet', { hasText: 'laptops' }).click();
    await expect(page).toHaveURL(/category=laptops/);
    await expect(page.getByText('5 items')).toBeVisible();

    await page.locator('select').selectOption('price_asc');
    await expect(page).toHaveURL(/sort=price_asc/);
    const prices = await page.locator('.product-card .price').allTextContents();
    const numbers = prices.map((p) => Number(p.replace(/[$,]/g, '')));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));

    await page.getByPlaceholder('Min').fill('1000');
    await page.getByRole('button', { name: 'Go' }).click();
    await expect(page).toHaveURL(/minPrice=1000/);
    for (const p of await page.locator('.product-card .price').allTextContents()) {
      expect(Number(p.replace(/[$,]/g, ''))).toBeGreaterThanOrEqual(1000);
    }

    await page.goto('/');
    await page.locator('.facet', { hasText: '& up' }).first().click();
    await expect(page).toHaveURL(/minRating=4/);
    // the box is driven by the URL, which router updates in a transition, so click and wait
    await page.getByLabel('In stock only').click();
    await expect(page).toHaveURL(/inStock=true/);
    await expect(page.getByLabel('In stock only')).toBeChecked();
  });

  test('searches from the header and pages through results', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Search products, brands…').fill('lipstick');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('heading', { name: /Results for “lipstick”/ })).toBeVisible();
    await expect(page.locator('.product-card').first()).toContainText(/Lipstick/i);

    await page.goto('/');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Page 2 of 9')).toBeVisible();
  });

  test('product page shows details, gallery, reviews and the store', async ({ page }) => {
    await page.goto('/?q=iPhone');
    await page.locator('.product-card').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('iPhone');
    await expect(page.locator('.price.big')).toBeVisible();
    await expect(page.getByText(/in stock/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Customer reviews' })).toBeVisible();

    const thumbs = page.locator('.thumbs button');
    if ((await thumbs.count()) > 1) {
      await thumbs.nth(1).click();
      await expect(thumbs.nth(1)).toHaveClass(/active/);
    }

    await page.locator('a', { hasText: 'Gadget Hub' }).click();
    await expect(page.getByRole('heading', { name: 'Gadget Hub' })).toBeVisible();
    expect(await page.locator('.product-card').count()).toBeGreaterThan(5);
  });

  test('adding to cart as a guest asks to sign in, then returns to the product', async ({ page }) => {
    await page.goto('/?q=lipstick');
    await page.locator('.product-card').first().click();
    const url = page.url();
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByRole('button', { name: 'Customer' }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(url);
  });

  test('protected pages redirect by role', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login/);

    await login(page, 'customer@vendora.test');
    await page.goto('/admin');
    await expect(page).toHaveURL('/');
    await page.goto('/vendor');
    await expect(page).toHaveURL('/');
  });

  test('unknown routes and bad logins are handled', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page.getByText('Page not found.')).toBeVisible();

    await page.goto('/login');
    await page.getByPlaceholder('Email').fill('customer@vendora.test');
    await page.getByPlaceholder('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Wrong email or password')).toBeVisible();
  });
});
