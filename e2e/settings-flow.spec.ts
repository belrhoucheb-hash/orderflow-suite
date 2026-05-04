import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// /settings is admin-only (RoleGuard allow={["admin"]} in App.tsx).
// Voor planner of medewerker redirect de app naar "/", waardoor deze
// specs faalden zonder echte bug. Skip wanneer er geen admin-creds zijn.
const IS_ADMIN = process.env.E2E_USER_IS_ADMIN === "true";

test.describe("Settings", () => {
  test.skip(!IS_ADMIN, "E2E_USER_IS_ADMIN=true vereist (settings is admin-only)");

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
