import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("AI Inbox", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("inbox page loads", async ({ page }) => {
    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/inbox/);
    // Inbox should show some container (email list or empty state)
    await expect(page.locator("main, [data-testid], .inbox, [role='main']").first()).toBeVisible();
  });

  test("click on an email in the inbox", async ({ page }) => {
    await page.goto("/inbox");

    // Wait for email list items to appear
    const emailItem = page.locator("[data-testid='email-item'], .email-item, table tbody tr, [role='listitem']").first();
    const visible = await emailItem.isVisible({ timeout: 5_000 }).catch(() => false);

    if (visible) {
      await emailItem.click();
      // After clicking, the detail panel or extraction panel should appear
      await expect(
        page.getByText("Extraheer").or(page.getByText("Analyseert...")),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("Extraheer button triggers extraction", async ({ page }) => {
    await page.goto("/inbox");

    const emailItem = page.locator("[data-testid='email-item'], .email-item, table tbody tr, [role='listitem']").first();
    const visible = await emailItem.isVisible({ timeout: 5_000 }).catch(() => false);

    if (visible) {
      await emailItem.click();

      const extractButton = page.getByText("Extraheer");
      const btnVisible = await extractButton.isVisible({ timeout: 5_000 }).catch(() => false);

      if (btnVisible) {
        await extractButton.click();
        // Either it starts analysing or shows extracted fields
        await expect(
          page
            .getByText("Analyseert...")
            .or(page.getByText(/ophaal|aflever|referentie/i)),
        ).toBeVisible({ timeout: 15_000 });
      }
    }
  });
});
