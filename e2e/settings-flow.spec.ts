import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("settings page loads and is not redirected", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);
    // Page title should be visible
    await expect(page.getByText("Instellingen")).toBeVisible();
  });

  test("stamgegevens section exists", async ({ page }) => {
    await page.goto("/settings");
    // Either as a tab or as a card/link on the settings page
    await expect(
      page.getByText(/stamgegevens/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
