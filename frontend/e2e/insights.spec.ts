import { expect, test } from "@playwright/test";

import { card, column, createIssue, createProject, drag, openBoard, register, uniqueEmail } from "./helpers";

test("landing page leads to sign up and to the demo account", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Plan the sprint/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Simple plans" })).toBeVisible();

  await page.getByRole("link", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/login\?demo=1$/);
  await expect(page.getByLabel("Email")).toHaveValue("owner@acme-corp.test");

  // the logo goes back to the landing page
  await page.getByRole("link", { name: "Sprintboard" }).click();
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
});

test("home shows workspace numbers and the activity feed links to the issue", async ({ page }) => {
  await register(page, { name: "Ona Overview", email: uniqueEmail("overview"), workspace: "Overview Co" });
  // nothing to chart in an empty workspace
  await expect(page.locator(".tile", { hasText: "Open issues" }).locator("strong")).toHaveText("0");
  await expect(page.getByRole("region", { name: "Workspace overview" })).toHaveCount(0);

  await createProject(page, "Insights", "INS");
  await openBoard(page, "Insights");
  await createIssue(page, "Chart the trend");
  await createIssue(page, "Count the issues");
  await drag(page, card(page, "Chart the trend"), column(page, "Done"));
  await expect(column(page, "Done")).toContainText("Chart the trend");

  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.locator(".tile", { hasText: "Open issues" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".tile", { hasText: "Done this week" }).locator("strong")).toHaveText("1");

  const overview = page.getByRole("region", { name: "Workspace overview" });
  await expect(overview.getByRole("img", { name: "Created and Completed per day" })).toBeVisible();
  await expect(overview.getByRole("img", { name: "To do 1, In progress 0, Done 1" })).toBeVisible();

  const feed = overview.locator(".feed");
  await expect(feed.locator("li").first()).toContainText("Ona Overview moved INS-1 to Done");

  // feed links open the issue on its board, and the link survives a reload
  await feed.getByRole("link", { name: "INS-2" }).first().click();
  await expect(page).toHaveURL(/\/board\?issue=\d+$/);
  const drawer = page.getByRole("dialog", { name: "Issue details" });
  await expect(drawer.locator(".drawer-title")).toHaveValue("Count the issues");
  await page.reload();
  await expect(drawer.locator(".drawer-title")).toHaveValue("Count the issues");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/board$/);
});

test("a running sprint gets a burndown chart", async ({ page }) => {
  await register(page, { name: "Bea Burndown", email: uniqueEmail("burndown"), workspace: "Burndown Co" });
  await createProject(page, "Burn", "BRN");
  await openBoard(page, "Burn");
  await createIssue(page, "First task");

  const nav = page.locator(".nav-project", { hasText: "Burn" });
  await nav.getByRole("link", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Sprint reports" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Burndown" })).toHaveCount(0);

  await nav.getByRole("link", { name: "Backlog" }).click();
  await page.getByRole("button", { name: "New sprint" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.locator(".issue-list li", { hasText: "First task" }).locator(".sprint-picker").selectOption({
    label: "Sprint 1",
  });
  await page.locator(".issue-list li", { hasText: "First task" }).locator(".grow").click();
  const drawer = page.getByRole("dialog", { name: "Issue details" });
  await drawer.getByLabel("Story points").fill("5");
  await drawer.getByLabel("Story points").blur();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Start sprint" }).click();
  await expect(page.locator(".badge-active")).toBeVisible();

  await nav.getByRole("link", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Burndown" })).toBeVisible();
  await expect(page.getByText("5 points committed across 1 issues, 5 left.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Remaining and Ideal per day" })).toBeVisible();
});
