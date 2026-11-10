import { expect, type Locator, type Page } from "@playwright/test";

export const PASSWORD = "e2e-pass-12345";
export const SEED_PASSWORD = "demo-pass-123";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@e2e.test`;
}

export async function register(page: Page, opts: { name: string; email: string; workspace?: string }) {
  await page.goto("/register");
  await page.getByLabel("Your name").fill(opts.name);
  await page.getByLabel("Work email").fill(opts.email);
  await page.getByLabel("Password").fill(PASSWORD);
  if (opts.workspace) await page.getByLabel("Company / workspace name").fill(opts.workspace);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
}

export async function createProject(page: Page, name: string, key: string) {
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Key").fill(key);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".project-card", { hasText: name })).toBeVisible();
}

export async function openBoard(page: Page, projectName: string) {
  await page.locator(".project-card", { hasText: projectName }).click();
  await expect(page.locator(".column").first()).toBeVisible();
}

export async function createIssue(page: Page, title: string, opts: { type?: string; priority?: string } = {}) {
  await page.getByRole("button", { name: "Create issue" }).first().click();
  const modal = page.locator(".modal");
  await modal.getByLabel("Summary").fill(title);
  if (opts.type) await modal.getByLabel("Type").selectOption(opts.type);
  if (opts.priority) await modal.getByLabel("Priority").selectOption(opts.priority);
  await modal.getByRole("button", { name: "Create", exact: true }).click();
  await expect(modal).toBeHidden();
}

export function column(page: Page, name: string): Locator {
  return page.locator(".column").filter({ has: page.locator(".column-header", { hasText: name }) });
}

export function card(page: Page, title: string): Locator {
  // the drag overlay is a copy of the card while the drop animation runs
  return page.locator(".issue-card:not(.overlay)", { hasText: title });
}

export async function columnTitles(page: Page, name: string) {
  return column(page, name).locator(".card-title").allInnerTexts();
}

// dnd-kit needs real pointer movement, a single jump doesn't trigger the sensor
export async function drag(page: Page, from: Locator, to: Locator, offsetY = 0) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + offsetY, { steps: 25 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await expect(page.locator(".issue-card.overlay")).toHaveCount(0);
}

export async function openIssue(page: Page, title: string) {
  await card(page, title).click();
  const drawer = page.getByRole("dialog", { name: "Issue details" });
  await expect(drawer.locator(".drawer-title")).toHaveValue(title);
  return drawer;
}
