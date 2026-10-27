import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { login, logout, register, uniqueEmail } from "./helpers";

// emails only go to the console in e2e, so build the same links the backend would send
function accountLink(kind: "reset" | "verify", email: string) {
  const code = `from apps.accounts import tokens; from apps.accounts.models import User; print(tokens.${kind}_link(User.objects.get(email="${email}")))`;
  const out = execFileSync(process.env.E2E_PYTHON ?? "python", ["manage.py", "shell", "--no-imports", "-c", code], {
    cwd: "../backend",
    env: { ...process.env, DJANGO_DEBUG: "1" },
  });
  const url = new URL(out.toString().trim());
  return url.pathname + url.search;
}

test("forgot password resets the password through the emailed link", async ({ page }) => {
  const email = uniqueEmail("reset");
  await register(page, { name: "Rita", email, workspace: "Reset Co" });
  await logout(page);

  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(`If an account exists for ${email}`);

  const link = accountLink("reset", email);
  await page.goto(link);
  await page.getByLabel("New password").fill("12345678");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.locator(".field-error")).toContainText(/too common|entirely numeric/);

  await page.getByLabel("New password").fill("brand-new-pass-77");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated.");

  // used links stop working
  await page.goto(link);
  await page.getByLabel("New password").fill("another-pass-88");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.locator(".form-error")).toContainText("invalid or has expired");

  await login(page, email, "brand-new-pass-77");
});

test("new accounts see the verify banner until the email is confirmed", async ({ page }) => {
  const email = uniqueEmail("verify");
  await register(page, { name: "Vic", email, workspace: "Verify Co" });

  const banner = page.locator(".verify-banner");
  await expect(banner).toContainText(email);
  await banner.getByRole("button", { name: "Resend email" }).click();
  await expect(banner).toContainText("Sent, check your inbox.");

  await page.goto("/verify-email?token=not-a-real-token");
  await expect(page.locator(".form-error")).toContainText("invalid or has expired");

  await page.goto(accountLink("verify", email));
  await expect(page.getByRole("status")).toContainText("Your email is confirmed.");
  await page.getByRole("link", { name: "Go to Sprintboard" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(banner).toBeHidden();
});

test("seeded accounts are already verified", async ({ page }) => {
  await login(page, "owner@acme-corp.test", "demo-pass-123");
  await expect(page.locator(".verify-banner")).toBeHidden();
});
