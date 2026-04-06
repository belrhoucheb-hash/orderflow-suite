import { type Page } from "@playwright/test";

/**
 * Log in as a planner (or any user) via the login form.
 * Waits for redirect to the dashboard ("/") after successful login.
 */
export async function login(
  page: Page,
  email = process.env.E2E_USER_EMAIL ?? "test@orderflow.nl",
  password = process.env.E2E_USER_PASSWORD ?? "Test1234!",
) {
  await page.goto("/login");

  // Fill the login form
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);

  // Click the "Inloggen" button
  await page.getByRole("button", { name: "Inloggen" }).click();

  // Wait until we are redirected away from /login (dashboard loads)
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}
