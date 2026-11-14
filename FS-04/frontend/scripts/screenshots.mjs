// Takes the README screenshots from a running, seeded app (API + Vite dev server).
// usage: node scripts/screenshots.mjs [http://localhost:5173] [http://localhost:8000]
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.argv[2] || "http://localhost:5173";
const api = process.argv[3] || "http://localhost:8000";
const out = new URL("../../docs/screenshots/", import.meta.url);
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const file = (name) => new URL(`${name}.png`, out).pathname.replace(/^\/([A-Za-z]:)/, "$1");

async function session({ scheme = "light", width = 1440, height = 900, scale = 1, signedIn = true } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: scheme,
    // skips the entrance animations so nothing is caught half faded
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  if (signedIn) {
    await page.goto(`${base}/login`);
    await page.getByLabel("Email").fill("owner@acme-corp.test");
    await page.getByLabel("Password").fill("demo-pass-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("heading", { name: "Projects" }).waitFor();
  }
  return page;
}
async function shot(page, name, path) {
  if (path) await page.goto(path.startsWith("http") ? path : base + path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  await page.screenshot({ path: file(name) });
  console.log("saved", name);
}
// the seeded Website project is the one with the most going on
async function website(page, tab) {
  await page.locator(".nav-project", { hasText: "Website" }).getByRole("link", { name: tab }).click();
}

const guest = await session({ signedIn: false });
await shot(guest, "17-landing", "/");
await shot(guest, "01-login", "/login?demo=1");

const p = await session();
await shot(p, "02-projects");
await website(p, "Board");
await shot(p, "03-board");
await p.locator(".issue-card").first().click();
await p.getByRole("dialog", { name: "Issue details" }).waitFor();
await shot(p, "04-issue-drawer");
await p.getByRole("button", { name: "Close" }).click();
await website(p, "Backlog");
await shot(p, "05-backlog");
await website(p, "Workflow");
await shot(p, "06-workflow");
await website(p, "Reports");
await shot(p, "07-reports");
await p.getByRole("link", { name: "Settings", exact: true }).click();
await p.getByRole("heading", { name: "Webhooks" }).scrollIntoViewIfNeeded();
await shot(p, "08-settings-webhooks");
await shot(p, "09-billing", "/billing");
await p.goto(base + "/");
await p.getByRole("button", { name: /^Notifications/ }).click();
await shot(p, "10-notifications");
await p.keyboard.press("Escape");
await shot(p, "11-api-docs", `${api.replace("localhost", "127.0.0.1")}/api/docs/`);
await shot(p, "12-account", "/account");
await p.getByRole("button", { name: "Set up" }).click();
await shot(p, "13-two-factor");
await p.goto(base + "/");
await website(p, "Board");
await p.keyboard.press("Control+k");
await p.getByLabel("Search commands").fill("web");
await shot(p, "15-command-palette");

const phone = await session({ width: 390, height: 844, scale: 2 });
await phone.goto(base + "/");
await phone.getByRole("button", { name: "Menu" }).click();
await website(phone, "Board");
await shot(phone, "14-mobile-board");

const dark = await session({ scheme: "dark" });
await shot(dark, "18-overview-dark");
await website(dark, "Board");
await shot(dark, "16-dark-board");

await browser.close();
