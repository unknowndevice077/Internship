import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { card, createIssue, createProject, openBoard, openIssue, register, uniqueEmail } from "./helpers";

test.beforeEach(async ({ page }) => {
  await register(page, { name: "Pat Planner", email: uniqueEmail("sprints"), workspace: "Sprint Co" });
  await createProject(page, "Payments", "PAY");
  await openBoard(page, "Payments");
  await createIssue(page, "Refund flow");
  await createIssue(page, "Invoice emails");
  await createIssue(page, "Tax rates");
});

async function backlog(page: Page) {
  await page.locator(".nav-project", { hasText: "Payments" }).getByRole("link", { name: "Backlog" }).click();
  await expect(page.getByRole("heading", { name: "Backlog" })).toBeVisible();
}

const section = (page: Page, name: string) =>
  page.locator(".sprint-section").filter({ has: page.locator("header strong", { hasText: new RegExp(`^${name}$`) }) });

async function plan(page: Page, title: string, sprint: string) {
  await page.locator(".issue-list li", { hasText: title }).locator(".sprint-picker").selectOption({ label: sprint });
  await expect(section(page, sprint)).toContainText(title);
}

test("plan, start and complete a sprint, then read its report", async ({ page }) => {
  await backlog(page);
  await expect(section(page, "Backlog")).toContainText("3 issues");

  await page.getByRole("button", { name: "New sprint" }).click();
  await expect(page.locator(".page-header input:not(.search)").first()).toHaveValue("Sprint 1");
  await page.getByPlaceholder("Sprint goal").fill("Ship refunds");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(section(page, "Sprint 1")).toContainText("Ship refunds");
  await expect(section(page, "Sprint 1").getByRole("button", { name: "Start sprint" })).toBeDisabled();

  await plan(page, "Refund flow", "Sprint 1");
  await plan(page, "Invoice emails", "Sprint 1");
  await expect(section(page, "Backlog")).toContainText("1 issues");

  // points so the report has numbers
  for (const [title, pts] of [
    ["Refund flow", "5"],
    ["Invoice emails", "3"],
  ]) {
    await page.locator(".issue-list li", { hasText: title }).locator(".grow").click();
    const drawer = page.getByRole("dialog", { name: "Issue details" });
    await drawer.getByLabel("Story points").fill(pts);
    await drawer.getByLabel("Story points").blur();
    await page.getByRole("button", { name: "Close" }).click();
  }
  await expect(section(page, "Sprint 1")).toContainText("8 pts");

  await section(page, "Sprint 1").getByRole("button", { name: "Start sprint" }).click();
  await expect(section(page, "Sprint 1").locator(".badge-active")).toBeVisible();

  // a second sprint can't start while one is active
  await page.getByRole("button", { name: "New sprint" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await plan(page, "Tax rates", "Sprint 2");
  await expect(section(page, "Sprint 2").getByRole("button", { name: "Start sprint" })).toBeDisabled();

  // finish one issue on the board
  await page.locator(".nav-project", { hasText: "Payments" }).getByRole("link", { name: "Board" }).click();
  const drawer = await openIssue(page, "Refund flow");
  await drawer.getByLabel("Status").selectOption({ label: "Done" });
  await page.getByRole("button", { name: "Close" }).click();
  await expect(card(page, "Refund flow")).toBeVisible();

  await backlog(page);
  await expect(section(page, "Sprint 1")).toContainText("1 done");
  await section(page, "Sprint 1").getByRole("button", { name: "Complete sprint" }).click();
  await expect(section(page, "Sprint 1")).toHaveCount(0);
  await expect(section(page, "Backlog")).toContainText("Invoice emails");
  await expect(section(page, "Sprint 2").getByRole("button", { name: "Start sprint" })).toBeEnabled();

  await page.locator(".nav-project", { hasText: "Payments" }).getByRole("link", { name: "Reports" }).click();
  const report = page.locator(".card", { hasText: "Sprint 1" });
  await expect(report.locator(".stat").first()).toContainText("5 / 8");
  await expect(report).toContainText("62.5%");
  await expect(report).toContainText("1 / 2");

  const downloadPromise = page.waitForEvent("download");
  await report.getByRole("button", { name: "Download CSV" }).click();
  const csv = readFileSync(await (await downloadPromise).path(), "utf-8");
  expect(csv.split(/\r?\n/)[0]).toBe("Key,Title,Type,Status,Done,Points,Assignee");
  expect(csv).toContain("Refund flow");
  expect(csv).toContain("Invoice emails");
});

test("generate a report on demand", async ({ page }) => {
  await backlog(page);
  await page.getByRole("button", { name: "New sprint" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await plan(page, "Tax rates", "Sprint 1");

  await page.locator(".nav-project", { hasText: "Payments" }).getByRole("link", { name: "Reports" }).click();
  await expect(page.getByText(/created automatically when a sprint is completed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate" })).toBeDisabled();
  await page.locator(".page-header select").selectOption({ label: "Sprint 1 (planned)" });
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.locator(".card", { hasText: "Sprint 1" })).toContainText("0 / 1");
});

test("create an issue straight into a sprint from the backlog", async ({ page }) => {
  await backlog(page);
  await page.getByRole("button", { name: "New sprint" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await section(page, "Sprint 1").getByRole("button", { name: "+ Create issue" }).click();
  await page.locator(".modal").getByLabel("Summary").fill("Created inside the sprint");
  await page.locator(".modal").getByRole("button", { name: "Create", exact: true }).click();
  await expect(section(page, "Sprint 1")).toContainText("Created inside the sprint");
});
