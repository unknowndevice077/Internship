import { expect } from '@playwright/test';

export const PASSWORD = 'demo-pass-123';
export const unique = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

export async function login(page, email, password = PASSWORD) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
}

export async function logout(page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
}

export async function register(page, { name, email, role = 'customer' }) {
  await page.goto('/register');
  await page.getByPlaceholder('Full name').fill(name);
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill('password-123');
  await page.getByText(role === 'vendor' ? 'I want to sell' : 'I want to shop').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
}

export async function fillAddress(page) {
  await page.getByPlaceholder('Street address').fill('12 Market St');
  await page.getByPlaceholder('City').fill('Manila');
  await page.getByPlaceholder('Postal code').fill('1000');
  await page.getByPlaceholder('Country').fill('PH');
}

export const cartCount = (page) => page.locator('.cart-count');

// opens the first product card that matches a search
export async function openProduct(page, query) {
  await page.goto(`/?q=${encodeURIComponent(query)}`);
  await page.locator('.product-card').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}
