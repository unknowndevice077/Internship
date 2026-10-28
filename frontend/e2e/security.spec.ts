import { createHmac } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { card, createIssue, createProject, login, logout, openBoard, PASSWORD, register, uniqueEmail } from "./helpers";

// same algorithm as an authenticator app (RFC 6238, SHA-1, 30 second steps)
function totp(secret: string, stepOffset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret].map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + stepOffset));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[19] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

async function signIn(page: Page, email: string, password: string, otp?: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (otp) {
    await page.getByLabel("Authentication code").fill(otp);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
}

test("two-factor sign-in with an authenticator code and a recovery code", async ({ page }) => {
  const email = uniqueEmail("totp");
  await register(page, { name: "Tia", email, workspace: "Totp Co" });

  await page.getByRole("link", { name: "Account" }).click();
  await page.getByRole("button", { name: "Set up" }).click();
  await expect(page.locator(".qr svg")).toBeVisible();
  const secret = (await page.locator(".account-form code").innerText()).trim();

  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.locator(".field-error")).toContainText("didn't match");

  await page.getByLabel("Code").fill(totp(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.locator(".recovery-codes code")).toHaveCount(8);
  const codes = await page.locator(".recovery-codes code").allInnerTexts();
  expect(codes).toHaveLength(8);
  await page.getByRole("button", { name: "I've saved them" }).click();
  await expect(page.getByRole("status").filter({ hasText: "is on" })).toBeVisible();

  await logout(page);

  // password alone isn't enough, and a wrong code is refused
  await signIn(page, email, PASSWORD);
  await expect(page.getByLabel("Authentication code")).toBeVisible();
  await page.getByLabel("Authentication code").fill("111111");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That code didn't work.")).toBeVisible();

  // the enrolment code is spent, so use the next time window
  await page.getByLabel("Authentication code").fill(totp(secret, 1));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await logout(page);

  // a recovery code works once
  await signIn(page, email, PASSWORD, codes[0]);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await logout(page);
  await signIn(page, email, PASSWORD, codes[0]);
  await expect(page.getByText("That code didn't work.")).toBeVisible();

  // turning it off needs the password and a code
  await page.getByLabel("Authentication code").fill(codes[1]);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Account" }).click();
  await page.getByRole("button", { name: "Turn off" }).click();
  const off = page.locator(".account-form", { has: page.getByLabel("Code or recovery code") });
  await off.getByLabel("Password").fill(PASSWORD);
  await off.getByLabel("Code or recovery code").fill(codes[2]);
  await off.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByRole("button", { name: "Set up" })).toBeVisible();
});

test("changing the password signs in with the new one only", async ({ page }) => {
  const email = uniqueEmail("pw");
  await register(page, { name: "Pat", email, workspace: "Password Co" });
  await page.getByRole("link", { name: "Account" }).click();

  const form = page.locator("section", { has: page.getByRole("heading", { name: "Password" }) });
  await form.getByLabel("Current password").fill("not-my-password");
  await form.getByLabel("New password").fill("changed-pass-4321");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.locator(".field-error")).toContainText("isn't your current password");

  await form.getByLabel("Current password").fill(PASSWORD);
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByRole("status")).toContainText("Password changed");

  // this session keeps working
  await page.reload();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();

  await logout(page);
  await signIn(page, email, PASSWORD);
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
  await login(page, email, "changed-pass-4321");
});

test("the account locks after repeated wrong passwords", async ({ page }) => {
  const email = uniqueEmail("lock");
  await register(page, { name: "Lou", email, workspace: "Lock Co" });
  await logout(page);

  for (let i = 0; i < 5; i++) {
    await signIn(page, email, "wrong-password");
    await expect(page.getByText("Wrong email or password.")).toBeVisible();
  }
  await signIn(page, email, PASSWORD);
  await expect(page.getByText(/Too many failed attempts/)).toBeVisible();
});

test("filtering the board, searching the backlog and keyboard shortcuts", async ({ page }) => {
  const email = uniqueEmail("search");
  await register(page, { name: "Sam", email, workspace: "Search Co" });
  await createProject(page, "Search Project", "SRC");
  await openBoard(page, "Search Project");
  await createIssue(page, "Zebra crossing is broken");
  await createIssue(page, "Update the footer");

  await page.getByLabel("Filter cards").fill("zebra");
  await expect(card(page, "Zebra crossing")).toBeVisible();
  await expect(card(page, "Update the footer")).toHaveCount(0);
  await expect(page.getByText("Clear the filter to move cards.")).toBeVisible();
  await page.getByLabel("Filter cards").fill("src-2");
  await expect(card(page, "Update the footer")).toBeVisible();
  await page.getByLabel("Filter cards").fill("");

  // "c" opens the create dialog, Escape closes it
  await page.locator("body").click({ position: { x: 600, y: 8 } });
  await page.keyboard.press("c");
  await expect(page.locator(".modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toBeHidden();

  // "/" jumps to the filter box
  await page.keyboard.press("/");
  await expect(page.getByLabel("Filter cards")).toBeFocused();

  await page.getByRole("link", { name: "Backlog" }).click();
  const rows = page.locator("li");
  await page.getByLabel("Search issues").fill("crossing");
  await expect(rows.filter({ hasText: "Zebra crossing is broken" })).toBeVisible();
  await expect(rows.filter({ hasText: "Update the footer" })).toHaveCount(0);
  await page.getByLabel("Search issues").fill("SRC-2");
  await expect(rows.filter({ hasText: "Update the footer" })).toBeVisible();
  await expect(rows.filter({ hasText: "Zebra crossing is broken" })).toHaveCount(0);
});

test("owners can export the workspace and delete it", async ({ page }) => {
  const email = uniqueEmail("owner");
  await register(page, { name: "Olga", email, workspace: "Doomed Co" });
  await createProject(page, "Keep Me", "KEP");

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export workspace data" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("doomed-co-export.json");
  const fs = await import("node:fs/promises");
  const data = JSON.parse(await fs.readFile((await download.path())!, "utf8"));
  expect(data.workspace.slug).toBe("doomed-co");
  expect(data.projects.map((p: { name: string }) => p.name)).toEqual(["Keep Me"]);

  const remove = page.getByRole("button", { name: "Delete workspace" });
  await expect(remove).toBeDisabled();
  await page.getByLabel("Type the workspace slug to confirm").fill("doomed-co");
  await remove.click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test.describe("small screens", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the sidebar becomes a menu and the board scrolls sideways", async ({ page }) => {
    const email = uniqueEmail("mobile");
    await register(page, { name: "Mo", email, workspace: "Mobile Co" });

    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeHidden();
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(sidebar).toBeVisible();
    await page.getByRole("link", { name: "Account" }).click();
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(sidebar).toBeHidden();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
