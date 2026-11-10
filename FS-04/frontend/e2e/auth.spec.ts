import { expect, test } from "@playwright/test";

import { login, logout, PASSWORD, register, uniqueEmail } from "./helpers";

test("register creates a workspace and signs in", async ({ page }) => {
  const email = uniqueEmail("owner");
  await register(page, { name: "Ana Owner", email, workspace: "Register Co" });

  await expect(page.locator(".ws-switcher")).toHaveValue(/register-co/);
  await expect(page.locator(".me")).toContainText("Ana Owner");
  await expect(page.locator(".me")).toContainText("owner");
  await expect(page.getByText("No projects yet.")).toBeVisible();
});

test("register shows field errors", async ({ page }) => {
  const email = uniqueEmail("dup");
  await register(page, { name: "First", email, workspace: "Dup Co" });
  await logout(page);

  await page.goto("/register");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Company / workspace name").fill("Another");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("An account with this email already exists.")).toBeVisible();

  await page.getByLabel("Work email").fill(uniqueEmail("weak"));
  await page.getByLabel("Password").fill("12345678");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".field-error").first()).toContainText(/too common|entirely numeric/);

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Company / workspace name").fill("");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Required when you weren't invited.")).toBeVisible();
});

test("login rejects a wrong password and accepts the right one", async ({ page }) => {
  const email = uniqueEmail("login");
  await register(page, { name: "Lee", email, workspace: "Login Co" });
  await logout(page);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();

  await login(page, email);
  await expect(page.locator(".me")).toContainText("Lee");
});

test("session survives a reload and sign out clears it", async ({ page }) => {
  const email = uniqueEmail("session");
  await register(page, { name: "Sam", email, workspace: "Session Co" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  await logout(page);
  // signed out, "/" is the public landing page and everything else asks you to sign in
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Plan the sprint/ })).toBeVisible();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});

test("register and login pages link to each other", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create a workspace" }).click();
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
