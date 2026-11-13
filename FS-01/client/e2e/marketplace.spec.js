import { expect, test } from '@playwright/test';
import { fillAddress, login, logout, openProduct, register, unique } from './helpers';

// 1x1 png for the upload test
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// The whole marketplace loop, in order: a new seller signs up, gets approved, lists a product,
// a customer buys it with the store's coupon, the seller ships it, the customer reviews it,
// and the admin sees it all in analytics.
test.describe.serial('seller to customer to admin', () => {
  const run = unique('e2e');
  const vendorEmail = `${run}-seller@test.dev`;
  const customerEmail = `${run}-buyer@test.dev`;
  const storeName = `Shop ${run}`;
  const productTitle = `Handmade Mug ${run}`;
  const couponCode = `MUG${Date.now().toString().slice(-6)}`;

  test('vendor signs up and opens a store', async ({ page }) => {
    await register(page, { name: 'Sam Seller', email: vendorEmail, role: 'vendor' });
    await expect(page).toHaveURL('/vendor');
    await expect(page.getByRole('heading', { name: 'Open your store' })).toBeVisible();

    await page.getByPlaceholder('Store name').fill(storeName);
    await page.getByPlaceholder('What do you sell?').fill('Mugs made by hand.');
    await page.getByRole('button', { name: 'Create store' }).click();
    await expect(page.getByText('waiting for admin approval')).toBeVisible();

    // can't list anything yet
    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByRole('link', { name: 'Add product' }).click();
    await page.getByPlaceholder('Title').fill('Too early');
    await page.getByPlaceholder('Category (e.g. laptops)').fill('kitchen');
    await page.getByPlaceholder('Price').fill('10');
    await page.getByPlaceholder('Stock').fill('1');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByText('waiting for admin approval').last()).toBeVisible();

    // payouts can be set up before approval
    await page.getByRole('link', { name: 'Payouts' }).click();
    await page.getByRole('button', { name: 'Connect with Stripe' }).click();
    await expect(page.getByText('Enabled')).toBeVisible();
    await expect(page.locator('code')).toContainText('mock_acct_');
  });

  test('admin approves the store and sets its commission', async ({ page }) => {
    await login(page, 'admin@vendora.test');
    await expect(page).toHaveURL('/admin');
    await page.getByRole('link', { name: 'Vendors' }).click();
    await page.locator('select').selectOption('pending');
    const row = page.locator('tr', { hasText: storeName });
    await expect(row.locator('.badge')).toHaveText('pending');

    page.once('dialog', (d) => d.accept('15'));
    await row.getByRole('button', { name: 'default' }).click();
    await page.locator('select').selectOption('');
    await expect(row.getByRole('button', { name: '15%' })).toBeVisible();

    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(row.locator('.badge')).toHaveText('approved');
  });

  test('vendor lists a product with an image, then edits it', async ({ page }) => {
    await login(page, vendorEmail, 'password-123');
    await expect(page.getByText('waiting for admin approval')).toHaveCount(0);

    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByRole('link', { name: 'Add product' }).click();
    await page.getByPlaceholder('Title').fill(productTitle);
    await page.getByPlaceholder('Description').fill('Stoneware mug, holds 350ml.');
    await page.getByPlaceholder('Category (e.g. laptops)').fill('Kitchen-Accessories');
    await page.getByPlaceholder('Brand', { exact: true }).fill('Clayworks');
    await page.getByPlaceholder('Price').fill('20');
    await page.getByPlaceholder('Stock').fill('3');
    await page.getByPlaceholder('Tags, comma separated').fill('mug, handmade');
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'mug.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('.thumb-edit img')).toHaveCount(1);
    await page.getByRole('button', { name: 'Create product' }).click();

    await expect(page).toHaveURL('/vendor/products');
    const row = page.locator('tr', { hasText: productTitle });
    await expect(row).toContainText('$20.00');
    await expect(row.locator('img.mini')).toBeVisible();

    await row.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByPlaceholder('Title')).toHaveValue(productTitle);
    await page.getByPlaceholder('Price').fill('25');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('tr', { hasText: productTitle })).toContainText('$25.00');

    // hide and show it again
    await page.locator('tr', { hasText: productTitle }).getByRole('button', { name: 'Live' }).click();
    await expect(page.locator('tr', { hasText: productTitle })).toHaveClass(/faded/);
    await page.locator('tr', { hasText: productTitle }).getByRole('button', { name: 'Hidden' }).click();
    await expect(page.locator('tr', { hasText: productTitle })).not.toHaveClass(/faded/);
  });

  test('vendor creates a store coupon', async ({ page }) => {
    await login(page, vendorEmail, 'password-123');
    await page.getByRole('link', { name: 'Coupons' }).click();
    await page.getByPlaceholder('CODE').fill(couponCode);
    await page.locator('.coupon-form select').selectOption('fixed');
    await page.getByPlaceholder('Value').fill('5');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('tr', { hasText: couponCode })).toContainText('$5.00');
  });

  test('customer finds the product, buys it with the store coupon', async ({ page }) => {
    await register(page, { name: 'Bea Buyer', email: customerEmail });
    await openProduct(page, productTitle);
    await expect(page.getByText(`sold by ${storeName}`, { exact: false })).toBeVisible();
    await expect(page.locator('.main-image img')).toBeVisible();
    await page.locator('.buy-row select').selectOption('2');
    await page.getByRole('button', { name: 'Add to cart' }).click();

    await page.goto('/checkout');
    await page.getByPlaceholder('Coupon code').fill(couponCode);
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.summary .total')).toContainText('$45.00');
    await fillAddress(page);
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.locator('.order-row')).toHaveCount(1);
    await expect(page.locator('.order-row')).toContainText('$45.00');

    await openProduct(page, productTitle);
    await expect(page.getByText('1 in stock')).toBeVisible();
  });

  test('vendor ships the order step by step', async ({ page }) => {
    await login(page, vendorEmail, 'password-123');
    await expect(page.locator('.stat', { hasText: 'Waiting to ship' })).toContainText('1');
    await expect(page.locator('.stat', { hasText: 'Your payout' })).toContainText('$38.25');

    await page.getByRole('link', { name: 'Orders' }).click();
    const row = page.locator('tbody tr').first();
    await expect(row).toContainText('Bea Buyer');
    await expect(row).toContainText('$45.00');
    await row.getByRole('button', { name: 'Mark packed' }).click();
    await expect(row.locator('.badge')).toHaveText('packed');

    // the detail page shows the commission split
    await row.getByRole('link').first().click();
    await expect(page.getByText('Platform commission (15%)')).toBeVisible();
    await expect(page.locator('.summary')).toContainText('$38.25');
    await page.getByRole('button', { name: 'Mark as shipped' }).click();
    await expect(page.locator('.order-head .badge')).toHaveText('shipped');
    await page.getByRole('button', { name: 'Mark as delivered' }).click();
    await expect(page.locator('.order-head .badge')).toHaveText('delivered');
    await expect(page.locator('.timeline li.done')).toHaveCount(4);
    await expect(page.getByRole('button', { name: /Cancel/ })).toHaveCount(0);

    await page.goto('/vendor/orders');
    await page.getByRole('button', { name: 'delivered' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('customer sees delivery and leaves a verified review', async ({ page }) => {
    await login(page, customerEmail, 'password-123');
    await page.getByRole('link', { name: 'Orders' }).click();
    await expect(page.locator('.order-row .badge')).toHaveText('delivered');

    await openProduct(page, productTitle);
    await page.getByRole('radio', { name: '4 stars' }).click();
    await page.getByPlaceholder('What did you think?').fill('Lovely mug, arrived well packed.');
    await page.getByRole('button', { name: 'Post review' }).click();
    const review = page.locator('.review', { hasText: 'Lovely mug' });
    await expect(review).toContainText('Verified purchase');
    await expect(page.locator('.product-page .stars .muted')).toHaveText(' (1)');
  });

  test('admin sees the sale in analytics and manages the platform', async ({ page }) => {
    await login(page, 'admin@vendora.test');
    await expect(page.getByRole('heading', { name: 'Marketplace analytics' })).toBeVisible();
    await expect(page.locator('.stat', { hasText: 'Gross sales' })).toContainText('$');
    await expect(page.locator('.recharts-line').first()).toBeVisible();
    await page.locator('select').selectOption('7');
    await expect(page.locator('.recharts-line').first()).toBeVisible();

    // platform coupon
    await page.getByRole('link', { name: 'Coupons' }).click();
    await expect(page.locator('tr', { hasText: couponCode })).toBeVisible();
    await page.getByPlaceholder('CODE').fill(`ADMIN${run.slice(-4)}`);
    await page.getByPlaceholder('Value').fill('95');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Percent coupons max out at 90%')).toBeVisible();

    // suspending the store hides its products
    await page.getByRole('link', { name: 'Vendors' }).click();
    const row = page.locator('tr', { hasText: storeName });
    await row.getByRole('button', { name: 'Suspend' }).click();
    await expect(row.locator('.badge')).toHaveText('suspended');
    await page.goto(`/?q=${encodeURIComponent(productTitle)}`);
    await expect(page.locator('.product-card', { hasText: productTitle })).toHaveCount(0);

    await page.goto('/admin/vendors');
    const again = page.locator('tr', { hasText: storeName });
    await again.getByRole('button', { name: 'Approve' }).click();
    await expect(again.locator('.badge')).toHaveText('approved');
    await page.goto(`/?q=${encodeURIComponent(productTitle)}`);
    await expect(page.locator('.product-card', { hasText: productTitle })).toHaveCount(1);
  });

  test('admin disabling a customer logs them out', async ({ browser }) => {
    const customer = await browser.newPage();
    await login(customer, customerEmail, 'password-123');

    const admin = await browser.newPage();
    await login(admin, 'admin@vendora.test');
    await admin.getByRole('link', { name: 'Users' }).click();
    await admin.locator('select').selectOption('customer');
    const row = admin.locator('tr', { hasText: customerEmail });
    await row.getByRole('button', { name: 'Active' }).click();
    await expect(row.getByRole('button', { name: 'Disabled' })).toBeVisible();

    await customer.goto('/orders');
    await expect(customer).toHaveURL(/\/login/);
    await customer.getByPlaceholder('Email').fill(customerEmail);
    await customer.getByPlaceholder('Password').fill('password-123');
    await customer.getByRole('button', { name: 'Sign in' }).click();
    await expect(customer.getByText('This account is disabled')).toBeVisible();

    await row.getByRole('button', { name: 'Disabled' }).click();
    await expect(row.getByRole('button', { name: 'Active' })).toBeVisible();
    await logout(admin);
  });
});
