import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { createIssue, createProject, openBoard, openIssue, register, uniqueEmail } from "./helpers";

test.beforeEach(async ({ page }) => {
  await register(page, { name: "Chris Commenter", email: uniqueEmail("activity"), workspace: "Activity Co" });
  await createProject(page, "Support", "SUP");
  await openBoard(page, "Support");
  await createIssue(page, "Login fails on Safari");
});

test("add and delete comments", async ({ page }) => {
  const drawer = await openIssue(page, "Login fails on Safari");
  await expect(drawer.getByText("No comments yet.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Save" })).toBeDisabled();

  const box = drawer.getByPlaceholder(/Add a comment/);
  await box.fill("Reproduced on Safari 17");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(box).toHaveValue("");
  await box.fill("Fix is in review");
  await drawer.getByRole("button", { name: "Save" }).click();

  const comments = drawer.locator(".comment");
  await expect(comments).toHaveCount(2);
  await expect(comments.first()).toContainText("Fix is in review");
  await expect(comments.first()).toContainText("Chris Commenter");

  await comments.first().getByRole("button", { name: "Delete comment" }).click();
  await expect(comments).toHaveCount(1);
  await expect(comments.first()).toContainText("Reproduced on Safari 17");

  await drawer.getByRole("button", { name: "History" }).click();
  await expect(drawer.locator(".history")).toContainText("commented");
  await expect(drawer.locator(".history")).toContainText("deleted comment");
});

test("upload, download and remove an attachment", async ({ page }) => {
  const drawer = await openIssue(page, "Login fails on Safari");
  await expect(drawer.getByText("No files.")).toBeVisible();

  await drawer.locator('input[type="file"]').setInputFiles({
    name: "safari-log.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("TypeError: undefined is not an object"),
  });
  const row = drawer.locator(".attachment-list li", { hasText: "safari-log.txt" });
  await expect(row).toContainText("37 B");

  const downloadPromise = page.waitForEvent("download");
  await row.getByRole("button", { name: "safari-log.txt" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("safari-log.txt");
  expect(readFileSync(await download.path(), "utf-8")).toBe("TypeError: undefined is not an object");

  await drawer.getByRole("button", { name: "History" }).click();
  await expect(drawer.locator(".history")).toContainText("attached safari-log.txt");

  await row.getByRole("button", { name: "Remove" }).click();
  await expect(drawer.getByText("No files.")).toBeVisible();
});

test("oversized attachment shows the limit error", async ({ page }) => {
  const drawer = await openIssue(page, "Login fails on Safari");
  await drawer.locator('input[type="file"]').setInputFiles({
    name: "huge.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(11 * 1024 * 1024),
  });
  await expect(drawer.locator(".form-error")).toContainText(/at most 10 MB|too large|Request Entity/i);
  await expect(drawer.getByText("No files.")).toBeVisible();
});
