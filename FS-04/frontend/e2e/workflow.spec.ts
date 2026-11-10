import { expect, test } from "@playwright/test";

import { card, column, createIssue, createProject, drag, openBoard, openIssue, register, uniqueEmail } from "./helpers";

test.beforeEach(async ({ page }) => {
  await register(page, { name: "Wanda Workflow", email: uniqueEmail("workflow"), workspace: "Workflow Co" });
  await createProject(page, "Ops", "OPS");
});

async function openWorkflow(page: import("@playwright/test").Page) {
  await page.locator(".nav-project", { hasText: "Ops" }).getByRole("link", { name: "Workflow" }).click();
  await expect(page.getByRole("heading", { name: "Workflow" })).toBeVisible();
}

const statusNames = (page: import("@playwright/test").Page) =>
  page
    .locator(".settings-section")
    .first()
    .locator("tbody input")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test("add, rename, recategorise, reorder and delete statuses", async ({ page }) => {
  await openWorkflow(page);
  await expect.poll(() => statusNames(page)).toEqual(["To Do", "In Progress", "In Review", "Done"]);

  await page.getByPlaceholder("New status name").fill("Blocked");
  await page.locator(".inline-form").getByRole("combobox").selectOption("todo");
  await page.getByRole("button", { name: "Add status" }).click();
  await expect.poll(() => statusNames(page)).toEqual(["To Do", "In Progress", "In Review", "Done", "Blocked"]);

  const rows = page.locator(".settings-section").first().locator("tbody tr");
  await rows.nth(4).getByRole("button", { name: "Move up" }).click();
  await expect.poll(() => statusNames(page)).toEqual(["To Do", "In Progress", "In Review", "Blocked", "Done"]);
  await rows.nth(0).getByRole("button", { name: "Move down" }).click();
  await expect.poll(() => statusNames(page)).toEqual(["In Progress", "To Do", "In Review", "Blocked", "Done"]);
  await expect(rows.nth(0).getByRole("button", { name: "Move up" })).toBeDisabled();

  const review = rows.nth(2).locator("input");
  await review.fill("QA");
  await review.blur();
  await rows.nth(2).getByRole("combobox").selectOption("done");
  await expect.poll(() => statusNames(page)).toContain("QA");

  await rows.nth(3).getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => statusNames(page)).toEqual(["In Progress", "To Do", "QA", "Done"]);

  await page.locator(".nav-project", { hasText: "Ops" }).getByRole("link", { name: "Board" }).click();
  await expect(page.locator(".column-header")).toHaveText([/In Progress/i, /To Do/i, /QA/i, /Done/i]);
  await expect(page.locator(".column").nth(2)).toHaveClass(/column-done/);
});

test("a status that still has issues can't be deleted", async ({ page }) => {
  await openBoard(page, "Ops");
  await createIssue(page, "Keeps To Do busy");
  await openWorkflow(page);
  await page
    .locator(".settings-section")
    .first()
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.locator(".form-error")).toContainText("Move the issues out of this status first.");
});

test("transition rules restrict drag and drop and the status picker", async ({ page }) => {
  await openWorkflow(page);
  await expect(page.getByText(/No rules yet/)).toBeVisible();
  await page.getByRole("checkbox", { name: "To Do to In Progress" }).check();
  await expect(page.getByText(/only move along the ticked transitions/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "To Do to In Progress" })).toBeChecked();

  await page.locator(".nav-project", { hasText: "Ops" }).getByRole("link", { name: "Board" }).click();
  await createIssue(page, "Restricted card");

  // Done isn't allowed from To Do: the card must stay put
  await drag(page, card(page, "Restricted card"), column(page, "Done").locator(".column-body"), 40);
  await expect(column(page, "To Do")).toContainText("Restricted card");
  await expect(column(page, "Done")).not.toContainText("Restricted card");

  const drawer = await openIssue(page, "Restricted card");
  const status = drawer.getByLabel("Status");
  const optionDisabled = (name: string) =>
    status.locator("option", { hasText: name }).evaluate((o) => (o as HTMLOptionElement).disabled);
  expect(await optionDisabled("Done")).toBe(true);
  expect(await optionDisabled("In Progress")).toBe(false);
  await page.getByRole("button", { name: "Close" }).click();

  await drag(page, card(page, "Restricted card"), column(page, "In Progress").locator(".column-body"), 40);
  await expect(column(page, "In Progress")).toContainText("Restricted card");

  // unticking the only rule makes the workflow open again
  await openWorkflow(page);
  await page.getByRole("checkbox", { name: "To Do to In Progress" }).uncheck();
  await expect(page.getByText(/No rules yet/)).toBeVisible();
});
