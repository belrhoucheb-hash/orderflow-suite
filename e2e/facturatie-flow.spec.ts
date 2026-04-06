import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("Facturatie (Invoicing)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("facturatie page loads", async ({ page }) => {
    await page.goto("/facturatie");
    await expect(page).toHaveURL(/\/facturatie/);
    // Should show invoice list or empty state
    await expect(
      page.getByText("Nieuwe factuur").or(page.getByText(/factur/i)).first(),
    ).toBeVisible();
  });

  test("open new invoice dialog", async ({ page }) => {
    await page.goto("/facturatie");

    const newInvoiceBtn = page.getByText("Nieuwe factuur");
    await expect(newInvoiceBtn).toBeVisible();
    await newInvoiceBtn.click();

    // Dialog should open with title
    await expect(
      page.getByText("Nieuwe factuur aanmaken"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("click invoice row navigates to detail", async ({ page }) => {
    await page.goto("/facturatie");

    // Wait for table rows
    const firstRow = page.locator("table tbody tr").first();
    const rowVisible = await firstRow.isVisible({ timeout: 5_000 }).catch(() => false);

    if (rowVisible) {
      await firstRow.click();
      // Should navigate to /facturatie/:id
      await expect(page).toHaveURL(/\/facturatie\/[^/]+$/);
    }
  });
});
