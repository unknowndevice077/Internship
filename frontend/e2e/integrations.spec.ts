import { createHmac } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test, type Page } from "@playwright/test";

import {
  createIssue,
  createProject,
  login,
  openBoard,
  openIssue,
  PASSWORD,
  register,
  SEED_PASSWORD,
  uniqueEmail,
} from "./helpers";

type Hit = { headers: IncomingHttpHeaders; body: string };

let server: Server;
let hits: Hit[] = [];
let hookUrl = "";

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push({ headers: req.headers, body });
      res.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});

test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
test.beforeEach(() => {
  hits = [];
});

async function settings(page: Page) {
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace settings" })).toBeVisible();
}

test("webhooks need a paid plan", async ({ page }) => {
  await register(page, { name: "Fred Free", email: uniqueEmail("free"), workspace: "Free Hooks" });
  await settings(page);
  await page.getByPlaceholder("https://example.com/hooks/sprintboard").fill("https://example.com/hook");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByText(/Webhooks aren't included in the Free plan/)).toBeVisible();
});

test("add, ping, deliver, disable and delete a webhook", async ({ page }) => {
  await login(page, "owner@globex.test", SEED_PASSWORD);
  await settings(page);

  await page.getByPlaceholder("https://example.com/hooks/sprintboard").fill(hookUrl);
  await page.getByRole("checkbox", { name: "issue.created" }).check();
  await page.getByRole("button", { name: "Add endpoint" }).click();
  const secret = await page.locator(".notice code").innerText();
  expect(secret).toMatch(/^[0-9a-f]{48}$/);
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator(".notice")).toHaveCount(0);

  const row = page.locator(".webhook", { hasText: hookUrl });
  await expect(row).toContainText("1 events");
  await row.getByRole("button", { name: "Send ping" }).click();
  await expect.poll(() => hits.length).toBe(1);
  expect(hits[0].headers["x-sprintboard-event"]).toBe("ping");

  await row.getByRole("button", { name: "Deliveries" }).click();
  await expect(row.locator(".deliveries")).toContainText("success");
  await expect(row.locator(".deliveries")).toContainText("ping");

  // a real event, signed with the secret shown at creation
  await page.locator(".nav-project", { hasText: "Billing" }).getByRole("link", { name: "Board" }).click();
  await createIssue(page, "Webhook triggering issue");
  await expect.poll(() => hits.length).toBe(2);
  const event = hits[1];
  expect(event.headers["x-sprintboard-event"]).toBe("issue.created");
  const expected = "sha256=" + createHmac("sha256", secret).update(event.body).digest("hex");
  expect(event.headers["x-sprintboard-signature"]).toBe(expected);
  expect(JSON.parse(event.body).issue.title).toBe("Webhook triggering issue");

  // events outside the filter are not sent
  const drawer = await openIssue(page, "Webhook triggering issue");
  await drawer.getByLabel("Priority").selectOption("high");
  await page.getByRole("button", { name: "Close" }).click();

  await settings(page);
  await row.getByRole("button", { name: "Disable" }).click();
  await expect(row.locator(".dot")).not.toHaveClass(/dot-on/);
  await page.locator(".nav-project", { hasText: "Billing" }).getByRole("link", { name: "Board" }).click();
  await createIssue(page, "Created while disabled");
  await page.waitForTimeout(1000);
  expect(hits.map((h) => h.headers["x-sprintboard-event"])).toEqual(["ping", "issue.created"]);

  await settings(page);
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".webhook", { hasText: hookUrl })).toHaveCount(0);
});

test("assignments and mentions show up in the notification bell", async ({ page, browser }) => {
  const ownerEmail = uniqueEmail("bell-owner");
  await register(page, { name: "Nora Notified", email: ownerEmail, workspace: "Bell Co" });
  await createProject(page, "Alerts", "ALR");

  const mateEmail = uniqueEmail("bell-mate");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByPlaceholder("teammate@company.com").fill(mateEmail);
  await page.getByRole("button", { name: "Invite" }).click();

  const mate = await (await browser.newContext()).newPage();
  await mate.goto("/register");
  await mate.getByLabel("Your name").fill("Max Mate");
  await mate.getByLabel("Work email").fill(mateEmail);
  await mate.getByLabel("Password").fill(PASSWORD);
  await mate.getByRole("button", { name: "Create account" }).click();
  await openBoard(mate, "Alerts");
  await mate.getByRole("button", { name: "Create issue" }).click();
  await mate.locator(".modal").getByLabel("Summary").fill("Please look at this");
  await mate.locator(".modal").getByLabel("Assignee").selectOption({ label: "Nora Notified" });
  await mate.locator(".modal").getByRole("button", { name: "Create", exact: true }).click();
  const drawer = await openIssue(mate, "Please look at this");
  await drawer.getByPlaceholder(/Add a comment/).fill(`@${ownerEmail} any update?`);
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer.locator(".comment")).toHaveCount(1);
  await mate.close();

  await page.reload();
  const bell = page.getByRole("button", { name: /Notifications \(2 unread\)/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const panel = page.locator(".bell-panel");
  await expect(panel).toContainText("Max Mate assigned you ALR-1 Please look at this");
  await expect(panel).toContainText("Max Mate mentioned you on ALR-1 Please look at this");
  await expect(panel.locator("li.unread")).toHaveCount(2);

  await panel.locator("li", { hasText: "assigned you" }).click();
  await expect(page).toHaveURL(/\/projects\/\d+\/board$/);
  await expect(page.getByRole("button", { name: /Notifications \(1 unread\)/ })).toBeVisible();

  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByRole("button", { name: "Notifications (0 unread)" })).toBeVisible();
  await expect(page.locator(".bell-count")).toHaveCount(0);

  // clicking outside closes the panel
  await page.mouse.click(900, 600);
  await expect(page.locator(".bell-panel")).toHaveCount(0);
});

test("billing page shows plan, usage and disabled checkout without Stripe", async ({ page }) => {
  await register(page, { name: "Bill Owner", email: uniqueEmail("bill"), workspace: "Bill Co" });
  await createProject(page, "Only", "ONLY");
  await page.getByRole("link", { name: "Billing" }).click();
  await expect(page.getByText("Current plan: Free")).toBeVisible();
  await expect(page.locator(".meter", { hasText: "Projects" })).toContainText("1 / 3");
  await expect(page.locator(".meter", { hasText: "Members" })).toContainText("1 / 5");
  await expect(page.getByText(/Stripe isn't configured/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Current plan" })).toBeDisabled();

  await page.goto("/billing?checkout=cancelled");
  await expect(page.getByText("Checkout cancelled. You haven't been charged.")).toBeVisible();
});

test("seeded business workspace shows unlimited limits", async ({ page }) => {
  await login(page, "owner@acme-corp.test", SEED_PASSWORD);
  await page.getByRole("link", { name: "Billing" }).click();
  await expect(page.getByText("Current plan: Business")).toBeVisible();
  await expect(page.locator(".meter", { hasText: "Projects" })).toContainText("3 / ∞");
  await expect(page.locator(".plan-card.current")).toContainText("Business");

  // seeded plans have no Stripe customer, so there is nothing to open in the portal
  await expect(page.getByText(/no billing account to manage/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage billing" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch in billing portal" })).toBeDisabled();
});
