import { defineConfig, devices } from '@playwright/test';

/**
 * Some sandboxes (Claude Code's cloud containers, CI images that pre-bake
 * browsers) ship a Chromium whose build number does not match the one this
 * Playwright version downloads, so the default lookup fails with "Executable
 * doesn't exist". Point this at the binary and it is used instead. Unset —
 * the normal case — Playwright resolves the browser itself.
 */
const browserPath = process.env.PLAYWRIGHT_BROWSER_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    ...(browserPath ? { launchOptions: { executablePath: browserPath } } : {}),
  },
  /**
   * The specs need a migrated database, the dev invite code and both servers.
   * Starting them here rather than by hand means `npx playwright test` is the
   * whole procedure, and the make targets stay the single source of truth for
   * how the backend is launched.
   */
  webServer: [
    {
      command: 'make e2e-backend',
      cwd: '..',
      // Public endpoint: 200 without a session, unlike the rest of /api.
      url: 'http://localhost:8010/api/auth/providers',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
