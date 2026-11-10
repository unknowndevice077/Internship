import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  card,
  createIssue,
  createProject,
  login,
  openBoard,
  openIssue,
  PASSWORD,
  register,
  uniqueEmail,
} from "./helpers";

async function newUser(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

async function invite(page: Page, email: string, role: string) {
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByPlaceholder("teammate@company.com").fill(email);
  await page.locator(".inline-form").getByRole("combobox").selectOption(role);
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.locator("tbody tr", { hasText: email })).toBeVisible();
}

const memberRow = (page: Page, email: string) =>
  page.locator(".settings-section").first().locator("tbody tr", { hasText: email });

test("invited viewer claims the account and gets a read-only UI", async ({ page, browser }) => {
  await register(page, { name: "Olivia Owner", email: uniqueEmail("owner"), workspace: "Roles Co" });
  await createProject(page, "Core", "CORE");
  await openBoard(page, "Core");
  await createIssue(page, "Read only card");

  const viewerEmail = uniqueEmail("viewer");
  await invite(page, viewerEmail, "viewer");
  await expect(memberRow(page, viewerEmail)).toContainText("Invited");

  const viewer = await newUser(browser);
  await viewer.goto("/register");
  await viewer.getByLabel("Your name").fill("Vic Viewer");
  await viewer.getByLabel("Work email").fill(viewerEmail);
  await viewer.getByLabel("Password").fill(PASSWORD);
  await viewer.getByRole("button", { name: "Create account" }).click();
  await expect(viewer.locator(".me")).toContainText("viewer");
  await expect(viewer.getByRole("button", { name: "New project" })).toHaveCount(0);
  await expect(viewer.getByRole("link", { name: "Billing" })).toHaveCount(0);
  await expect(viewer.getByRole("link", { name: "Workflow" })).toHaveCount(0);

  await openBoard(viewer, "Core");
  await expect(viewer.getByRole("button", { name: "Create issue" })).toHaveCount(0);
  const drawer = await openIssue(viewer, "Read only card");
  await expect(drawer.getByLabel("Status")).toBeDisabled();
  await expect(drawer.locator(".drawer-title")).toBeDisabled();
  await expect(drawer.getByPlaceholder(/Add a comment/)).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "+ Add" })).toHaveCount(0);

  // promoting the viewer unlocks editing after a reload
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await memberRow(page, viewerEmail).getByRole("combobox").selectOption("member");
  await expect(memberRow(page, viewerEmail).getByRole("combobox")).toHaveValue("member");
  await viewer.reload();
  await expect(viewer.getByRole("button", { name: "Create issue" })).toBeVisible();
  await expect(viewer.locator(".me")).toContainText("member");

  // removing them sends them to an empty state on next load
  await memberRow(page, viewerEmail).getByRole("button", { name: "Remove" }).click();
  await expect(memberRow(page, viewerEmail)).toHaveCount(0);
  await viewer.close();
});

test("owner row can't be changed and admins can't grant owner", async ({ page, browser }) => {
  const ownerEmail = uniqueEmail("owner2");
  await register(page, { name: "Oscar Owner", email: ownerEmail, workspace: "Admin Co" });
  const adminEmail = uniqueEmail("admin");
  await invite(page, adminEmail, "admin");
  await expect(memberRow(page, ownerEmail).getByRole("button", { name: "Remove" })).toHaveCount(0);

  const admin = await newUser(browser);
  await admin.goto("/register");
  await admin.getByLabel("Your name").fill("Ada Admin");
  await admin.getByLabel("Work email").fill(adminEmail);
  await admin.getByLabel("Password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Create account" }).click();
  await admin.getByRole("link", { name: "Settings", exact: true }).click();

  // admins see member management but not the owner option or owner row controls
  await expect(memberRow(admin, ownerEmail).getByRole("combobox")).toHaveCount(0);
  const otherEmail = uniqueEmail("member");
  await invite(admin, otherEmail, "member");
  const options = await memberRow(admin, otherEmail).getByRole("combobox").locator("option").allInnerTexts();
  expect(options).not.toContain("owner");
  await expect(admin.getByRole("link", { name: "Billing" })).toBeVisible();
  await admin.getByRole("link", { name: "Billing" }).click();
  await expect(admin.getByRole("button", { name: /Upgrade to/ }).first()).toBeDisabled();
  await admin.close();
});

test("members of two workspaces can switch and only see each one's data", async ({ page, browser }) => {
  const dualEmail = uniqueEmail("dual");
  const dual = await newUser(browser);
  await register(dual, { name: "Dee Dual", email: dualEmail, workspace: "Home Co" });
  await createProject(dual, "Home project", "HOME");

  await register(page, { name: "Owen Other", email: uniqueEmail("other"), workspace: "Client Co" });
  await createProject(page, "Client project", "CLI");
  await invite(page, dualEmail, "member");

  await dual.reload();
  const switcher = dual.locator(".ws-switcher");
  await expect(switcher.locator("option")).toHaveText(["Client Co", "Home Co"]);
  await expect(dual.locator(".project-card")).toHaveText([/Home project/]);

  await switcher.selectOption({ label: "Client Co" });
  await expect(dual.locator(".project-card")).toHaveText([/Client project/]);
  await expect(dual.locator(".nav-project")).toHaveCount(1);
  await expect(dual.locator(".me")).toContainText("member");

  await switcher.selectOption({ label: "Home Co" });
  await expect(dual.locator(".project-card")).toHaveText([/Home project/]);
  await expect(dual.locator(".me")).toContainText("owner");
  await dual.close();
});

test("member invite is blocked at the free plan limit", async ({ page }) => {
  await register(page, { name: "Fay Full", email: uniqueEmail("full"), workspace: "Full Co" });
  for (let i = 0; i < 4; i++) await invite(page, uniqueEmail(`m${i}`), "member");
  await page.getByPlaceholder("teammate@company.com").fill(uniqueEmail("sixth"));
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText("Your Free plan allows 5 members. Upgrade to add more.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See plans" })).toBeVisible();

  await page
    .getByPlaceholder("teammate@company.com")
    .fill(await page.locator("tbody tr").nth(1).locator("td").nth(1).innerText());
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.locator(".field-error").first()).toBeVisible();
});

test("signed-in member of a seeded workspace sees seeded data", async ({ page }) => {
  await login(page, "owner@acme-corp.test", "demo-pass-123");
  await expect(page.locator(".project-card")).toHaveCount(3);
  await openBoard(page, "Website");
  await expect(card(page, "")).not.toHaveCount(0);
});
