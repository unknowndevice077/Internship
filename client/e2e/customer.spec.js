import { expect, test } from '@playwright/test';
import { cartCount, fillAddress, logout, openProduct, register, unique } from './helpers';

test.describe('customer shopping flow', () => {
  test('sign up, fill the cart from two stores, use a coupon and pay', async ({ page }) => {
    await register(page, { name: 'Maya Test', email: `${unique('maya')}@test.dev` });
    await expect(page).toHaveURL('/');
    await expect(cartCount(page)).toHaveText('0');

    await openProduct(page, 'Red Lipstick');
    await page.locator('.buy-row select').selectOption('2');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added to cart')).toBeVisible();
    await expect(cartCount(page)).toHaveText('2');

    await openProduct(page, 'iPhone X');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(cartCount(page)).toHaveText('3');

    await page.getByRole('link', { name: /Cart/ }).click();
    await expect(page.locator('.cart-row')).toHaveCount(2);
    await expect(page.getByText('Sold by Glow Beauty Co')).toBeVisible();
    await expect(page.getByText('Sold by Gadget Hub')).toBeVisible();

    // change quantity, then remove and re-add
    const lipstick = page.locator('.cart-row', { hasText: 'Lipstick' });
    await lipstick.locator('select').selectOption('1');
    await expect(cartCount(page)).toHaveText('2');
    await lipstick.getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.cart-row')).toHaveCount(1);
    await openProduct(page, 'Red Lipstick');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.getByRole('link', { name: /Cart/ }).click();

    const subtotal = await page.locator('.summary strong').textContent();
    await page.getByRole('link', { name: 'Proceed to checkout' }).click();
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();

    await page.getByPlaceholder('Coupon code').fill('NOPE');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('Coupon not found')).toBeVisible();

    await page.getByPlaceholder('Coupon code').fill('welcome10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('Coupon WELCOME10')).toBeVisible();
    const sub = Number(subtotal.replace(/[$,]/g, ''));
    const toNumber = (text) => Number(text.replace(/[$,]/g, ''));
    const total = toNumber(await page.locator('.summary .total span').last().textContent());
    // Glow Beauty is under its free-shipping limit, so its flat rate is added
    const shippingRow = page.locator('.summary .row', { hasText: 'Shipping from Glow Beauty Co' });
    await expect(shippingRow).toBeVisible();
    const shipping = toNumber(await shippingRow.locator('span').last().textContent());
    expect(shipping).toBe(4.99);
    expect(total).toBeCloseTo(sub * 0.9 + shipping, 1);

    await fillAddress(page);
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page).toHaveURL(/\/orders\?placed=2/);
    await expect(page.getByText('Your payment went through')).toBeVisible();
    await expect(page.locator('.order-row')).toHaveCount(2);
    await expect(cartCount(page)).toHaveText('0');
    await expect(page.locator('.order-row .badge').first()).toHaveText('placed');
  });

  test('order detail shows the timeline, invoice and cancel restocks', async ({ page }) => {
    await register(page, { name: 'Leo Test', email: `${unique('leo')}@test.dev` });
    await openProduct(page, 'Ice Cube Tray');
    const stockText = await page.getByText(/in stock/).textContent();
    const stockBefore = Number(stockText.match(/\d+/)[0]);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.goto('/checkout');
    await fillAddress(page);
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page).toHaveURL(/\/orders/);

    await page.locator('.order-row').first().click();
    await expect(page.getByRole('heading', { name: /Order VD-/ })).toBeVisible();
    await expect(page.locator('.timeline li.done')).toHaveCount(1);
    await expect(page.getByText('Ship to: 12 Market St, Manila 1000, PH')).toBeVisible();
    // customers don't see the platform's cut
    await expect(page.getByText('Seller payout')).toHaveCount(0);

    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Download invoice (PDF)' }).click();
    await expect((await popup).url()).toMatch(/^blob:/);

    const product = page.locator('.cart-row a').first();
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await expect(page.locator('.order-head .badge')).toHaveText('cancelled');
    await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);

    await product.click();
    await expect(page.getByText(`${stockBefore} in stock`)).toBeVisible();
  });

  test('checkout is blocked when an item is out of stock', async ({ page }) => {
    await register(page, { name: 'Ava Test', email: `${unique('ava')}@test.dev` });
    await openProduct(page, 'Ice Cube Tray');
    const stock = Number((await page.getByText(/in stock/).textContent()).match(/\d+/)[0]);
    // the picker caps at 10, so ask the API directly for more than is in stock
    const res = await page.evaluate(
      async ({ id, qty }) => {
        const r = await fetch('/api/cart/items', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('vendora_token')}`,
          },
          body: JSON.stringify({ productId: id, quantity: qty }),
        });
        return { status: r.status, body: await r.json() };
      },
      { id: page.url().split('/').pop(), qty: stock + 1 },
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/left in stock/);
  });

  test('logging out clears the session and the cart badge', async ({ page }) => {
    await register(page, { name: 'Zoe Test', email: `${unique('zoe')}@test.dev` });
    await openProduct(page, 'Red Lipstick');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(cartCount(page)).toHaveText('1');
    await logout(page);
    await expect(cartCount(page)).toHaveText('0');
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login/);
  });
});
