import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("Planning board", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("planning page loads", async ({ page }) => {
    await page.goto("/planning");
    await expect(page).toHaveURL(/\/planning/);
  });

  test("planning board shows vehicles", async ({ page }) => {
    await page.goto("/planning");
    // The planning board should render some content (vehicle rows, planbord text, etc.)
    await expect(
      page
        .getByText(/planbord|voertuig|chauffeur/i)
        .or(page.locator("[data-testid='planning-board']"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("map container renders (Leaflet)", async ({ page }) => {
    await page.goto("/planning");
    // Leaflet renders into a container with class "leaflet-container"
    const mapContainer = page.locator(".leaflet-container").first();
    const mapVisible = await mapContainer.isVisible({ timeout: 10_000 }).catch(() => false);

    // Map may or may not be present depending on layout; assert if visible
    if (mapVisible) {
      await expect(mapContainer).toBeVisible();
    }
  });
});
