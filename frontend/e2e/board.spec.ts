import { expect, test } from "@playwright/test";

import {
  card,
  column,
  columnTitles,
  createIssue,
  createProject,
  drag,
  openBoard,
  openIssue,
  register,
  uniqueEmail,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await register(page, { name: "Board Owner", email: uniqueEmail("board"), workspace: "Board Co" });
});

test("create project validates the key and fills it from the name", async ({ page }) => {
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("Website");
  await expect(page.getByLabel("Key")).toHaveValue("WEBS");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Name")).toBeHidden();

  await createProject(page, "Website", "WEB");
  await expect(page.locator(".nav-project", { hasText: "Website" })).toBeVisible();

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("Duplicate");
  await page.getByLabel("Key").fill("WEB");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Key already used in this workspace.")).toBeVisible();

  await page.getByLabel("Key").fill("1AB");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Use letters and digits only, starting with a letter.")).toBeVisible();
});

test("free plan stops at three projects and links to billing", async ({ page }) => {
  await createProject(page, "One", "ONE");
  await createProject(page, "Two", "TWO");
  await createProject(page, "Three", "THR");

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("Four");
  await page.getByLabel("Key").fill("FOUR");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Your Free plan allows 3 projects. Upgrade to add more.")).toBeVisible();
  await page.getByRole("link", { name: "See plans" }).click();
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(page.getByText("Current plan: Free")).toBeVisible();
});

test("new project has a default board and issues get sequential keys", async ({ page }) => {
  await createProject(page, "Mobile", "MOB");
  await openBoard(page, "Mobile");
  await expect(page.locator(".column-header")).toHaveText([
    /To Do\s*0/i,
    /In Progress\s*0/i,
    /In Review\s*0/i,
    /Done\s*0/i,
  ]);

  await createIssue(page, "Crash on launch", { type: "bug", priority: "highest" });
  await createIssue(page, "Add dark mode");
  await expect(card(page, "Crash on launch")).toContainText("MOB-1");
  await expect(card(page, "Add dark mode")).toContainText("MOB-2");
  await expect(column(page, "To Do").locator(".count")).toHaveText("2");

  // modal cancel and validation
  await page.getByRole("button", { name: "Create issue" }).click();
  await page.locator(".modal").getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".modal")).toBeHidden();
});

test("drag and drop moves cards between columns and persists", async ({ page }) => {
  await createProject(page, "Drag", "DRG");
  await openBoard(page, "Drag");
  for (const t of ["Alpha", "Bravo", "Charlie"]) await createIssue(page, t);
  expect(await columnTitles(page, "To Do")).toEqual(["Alpha", "Bravo", "Charlie"]);

  await drag(page, card(page, "Alpha"), column(page, "In Progress").locator(".column-body"), 40);
  await expect(column(page, "In Progress")).toContainText("Alpha");
  await expect(column(page, "In Progress").locator(".count")).toHaveText("1");

  await drag(page, card(page, "Charlie"), card(page, "Bravo"), 5);
  await expect.poll(() => columnTitles(page, "To Do")).toEqual(["Charlie", "Bravo"]);

  await drag(page, card(page, "Bravo"), column(page, "Done").locator(".column-body"), 40);
  await expect(column(page, "Done")).toContainText("Bravo");

  await page.reload();
  await expect.poll(() => columnTitles(page, "To Do")).toEqual(["Charlie"]);
  expect(await columnTitles(page, "In Progress")).toEqual(["Alpha"]);
  expect(await columnTitles(page, "Done")).toEqual(["Bravo"]);
});

test("issue drawer edits every field and saves", async ({ page }) => {
  await createProject(page, "Edit", "EDT");
  await openBoard(page, "Edit");
  await createIssue(page, "Original title");

  const drawer = await openIssue(page, "Original title");
  await drawer.locator(".drawer-title").fill("Renamed issue");
  await drawer.getByLabel("Description").click();
  await drawer.getByLabel("Description").fill("Steps to reproduce");
  await drawer.getByLabel("Story points").click();
  await drawer.getByLabel("Story points").fill("5");
  await drawer.getByLabel("Status").click();
  await drawer.getByLabel("Status").selectOption({ label: "In Review" });
  await drawer.getByLabel("Type").selectOption("story");
  await drawer.getByLabel("Priority").selectOption("high");
  await drawer.getByLabel("Assignee").selectOption({ label: "Board Owner" });
  await expect(column(page, "In Review")).toContainText("Renamed issue");

  // a focused native select keeps the Escape key, so move focus first
  await drawer.locator(".drawer-key").click();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await page.reload();
  const reopened = await openIssue(page, "Renamed issue");
  await expect(reopened.getByLabel("Description")).toHaveValue("Steps to reproduce");
  await expect(reopened.getByLabel("Story points")).toHaveValue("5");
  await expect(reopened.getByLabel("Type")).toHaveValue("story");
  await expect(reopened.getByLabel("Priority")).toHaveValue("high");
  await expect(reopened.getByLabel("Status")).toHaveValue(/\d+/);
  await expect(card(page, "Renamed issue")).toContainText("5");

  // backdrop click closes, close button closes
  await page.mouse.click(200, 450);
  await expect(reopened).toBeHidden();
  await openIssue(page, "Renamed issue");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("history records each change in the drawer", async ({ page }) => {
  await createProject(page, "Hist", "HST");
  await openBoard(page, "Hist");
  await createIssue(page, "Track me");
  const drawer = await openIssue(page, "Track me");
  await drawer.getByLabel("Priority").selectOption("low");
  await drawer.getByLabel("Status").selectOption({ label: "Done" });
  await drawer.getByRole("button", { name: "History" }).click();
  const history = drawer.locator(".history");
  await expect(history).toContainText("created the issue");
  await expect(history).toContainText("changed priority from medium to low");
  await expect(history).toContainText("changed status from To Do to Done");
});
