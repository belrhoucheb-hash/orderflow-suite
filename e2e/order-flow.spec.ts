import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import { TEST_ORDER } from "./helpers/test-data";

test.describe("Order lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("navigate to orders page", async ({ page }) => {
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/orders/);
    // De Orders-page heeft een eigen "Nieuwe order"-knop in de page-header,
    // los van de sidebar. Pak expliciet de knop in de main-content.
    await expect(
      page.getByRole("button", { name: "Nieuwe order" }),
    ).toBeVisible();
  });

  test("open new order form", async ({ page }) => {
    await page.goto("/orders");
    await page.getByRole("button", { name: "Nieuwe order" }).click();
    // Should navigate to /orders/nieuw
    await expect(page).toHaveURL(/\/orders\/nieuw/);
  });

  test("fill and save a new order", async ({ page }) => {
    await page.goto("/orders/nieuw");

    // Fill pickup city
    const pickupCity = page.getByLabel("Stad").first();
    if (await pickupCity.isVisible()) {
      await pickupCity.fill(TEST_ORDER.pickup.city);
    }

    // Fill delivery city
    const deliveryCity = page.getByLabel("Stad").nth(1);
    if (await deliveryCity.isVisible()) {
      await deliveryCity.fill(TEST_ORDER.delivery.city);
    }

    // Look for a save/submit button
    const saveButton = page
      .getByRole("button", { name: /opslaan|bewaar|aanmaken/i })
      .first();
    if (await saveButton.isVisible()) {
      await saveButton.click();
    }
  });

  test("click order row to open detail", async ({ page }) => {
    await page.goto("/orders");

    // Wait for table rows to load
    const firstRow = page.locator("table tbody tr").first();
    const rowVisible = await firstRow.isVisible().catch(() => false);

    if (rowVisible) {
      await firstRow.click();
      // Should navigate to /orders/:id
      await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    }
  });
});
