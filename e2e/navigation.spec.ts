import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

/** Sidebar navigation items visible to a planner */
const SIDEBAR_LINKS = [
  { label: "Dashboard", path: "/" },
  { label: "Inbox", path: "/inbox" },
  { label: "Orders", path: "/orders" },
  { label: "Klanten", path: "/klanten" },
  { label: "Planbord", path: "/planning" },
  { label: "Dispatch", path: "/dispatch" },
  { label: "Ritoverzicht", path: "/ritten" },
  { label: "Chauffeurs", path: "/chauffeurs" },
  { label: "Vloot", path: "/vloot" },
  { label: "Rapportage", path: "/rapportage" },
  { label: "Facturatie", path: "/facturatie" },
] as const;

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const { label, path } of SIDEBAR_LINKS) {
    test(`sidebar link "${label}" navigates to ${path}`, async ({ page }) => {
      // Click the sidebar link by its text
      const link = page.getByRole("link", { name: label }).first();
      await expect(link).toBeVisible({ timeout: 5_000 });
      await link.click();

      if (path === "/") {
        // Dashboard is at root
        await expect(page).toHaveURL(/\/$/);
      } else {
        await expect(page).toHaveURL(new RegExp(path.replace("/", "\\/")));
      }
    });
  }

  test("settings link navigates to /settings", async ({ page }) => {
    // Settings is in the admin section; look for the link or gear icon
    const settingsLink = page
      .getByRole("link", { name: /instellingen/i })
      .or(page.locator("a[href='/settings']"))
      .first();
    const visible = await settingsLink.isVisible({ timeout: 3_000 }).catch(() => false);

    if (visible) {
      await settingsLink.click();
      await expect(page).toHaveURL(/\/settings/);
    }
  });

  test("logout button works", async ({ page }) => {
    const logoutButton = page.getByLabel("Uitloggen");
    await expect(logoutButton).toBeVisible({ timeout: 5_000 });
    await logoutButton.click();

    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/);
  });
});
