import { expect, test } from "@playwright/test";

import { createProject, register, uniqueEmail } from "./helpers";

test("the command palette jumps between pages and projects", async ({ page }) => {
  await register(page, { name: "Pia", email: uniqueEmail("palette"), workspace: "Palette Co" });
  await createProject(page, "Palette Project", "PAL");

  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect(page.getByLabel("Search commands")).toBeFocused();

  await page.getByLabel("Search commands").fill("account");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/account$/);
  await expect(palette).toBeHidden();

  await page.getByRole("button", { name: /Search or jump to/ }).click();
  await page.getByLabel("Search commands").fill("pal board");
  await expect(palette.getByRole("option", { name: /PAL Palette Project board/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/projects\/\d+\/board$/);

  await page.keyboard.press("Control+k");
  await page.getByLabel("Search commands").fill("zzzz");
  await expect(palette).toContainText("Nothing matches");
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});

test("the shortcuts list opens with ? and closes with Escape", async ({ page }) => {
  await register(page, { name: "Sho", email: uniqueEmail("keys"), workspace: "Keys Co" });
  await page.locator("body").click({ position: { x: 700, y: 10 } });
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Create an issue");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Shortcuts help" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("the theme can be switched, and the choice survives a reload", async ({ page }) => {
  await register(page, { name: "The", email: uniqueEmail("theme"), workspace: "Theme Co" });
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: /^Theme:/ });

  await expect(html).not.toHaveAttribute("data-theme", /.*/);
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(13, 17, 23)");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await toggle.click();
  await expect(html).not.toHaveAttribute("data-theme", /.*/);
});

test.describe("motion", () => {
  test("pages animate in, and reduced motion turns it off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await register(page, { name: "Mia", email: uniqueEmail("motion"), workspace: "Motion Co" });
    const animation = () =>
      page.locator(".page").evaluate((el) => {
        const s = getComputedStyle(el);
        return { name: s.animationName, seconds: parseFloat(s.animationDuration) };
      });

    const normal = await animation();
    expect(normal.name).toBe("page-in");
    expect(normal.seconds).toBeGreaterThan(0.2);

    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await animation()).seconds).toBeLessThan(0.01);
  });
});
