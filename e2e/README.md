# E2E Tests — OrderFlow Suite

End-to-end tests use [Playwright](https://playwright.dev/) to verify critical user flows in the application.

## GitHub Actions Secrets Setup

The E2E workflow (`.github/workflows/e2e.yml`) requires two repository secrets for authentication during test runs:

| Secret              | Description                        |
| ------------------- | ---------------------------------- |
| `E2E_USER_EMAIL`    | Email address of a test user       |
| `E2E_USER_PASSWORD` | Password for the test user account |

### How to add secrets

1. Go to your GitHub repository.
2. Navigate to **Settings > Secrets and variables > Actions**.
3. Click **New repository secret**.
4. Add `E2E_USER_EMAIL` with the email of a dedicated test account.
5. Click **New repository secret** again.
6. Add `E2E_USER_PASSWORD` with the password for that account.

> **Tip:** Create a dedicated Supabase test user for CI so production accounts are never used in automated tests.

## Running E2E Tests Locally

1. **Install dependencies** (if not done already):

   ```bash
   npm install
   npx playwright install --with-deps chromium
   ```

2. **Set environment variables** — create a `.env` file in the project root (or export them in your shell):

   ```bash
   E2E_USER_EMAIL=your-test-user@example.com
   E2E_USER_PASSWORD=your-test-password
   ```

3. **Start the dev server** in a separate terminal:

   ```bash
   npm run dev
   ```

4. **Run the tests:**

   ```bash
   npx playwright test
   ```

   To run a specific test file:

   ```bash
   npx playwright test e2e/order-flow.spec.ts
   ```

   To run in headed mode (see the browser):

   ```bash
   npx playwright test --headed
   ```

5. **View the report** after a run:

   ```bash
   npx playwright show-report
   ```

## What the Tests Cover

| Test file                    | Flow                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| `navigation.spec.ts`        | Sidebar navigation, page routing, menu items                         |
| `order-flow.spec.ts`        | Creating, editing, and managing transport orders                     |
| `planning-flow.spec.ts`     | Planning board interactions, drag-and-drop, vehicle assignment        |
| `facturatie-flow.spec.ts`   | Invoice creation, status updates, PDF generation                     |
| `inbox-flow.spec.ts`        | Email/document inbox, AI-powered order extraction                    |
| `settings-flow.spec.ts`    | Application settings, company configuration                          |

Helper utilities shared across tests live in the `e2e/helpers/` directory.
