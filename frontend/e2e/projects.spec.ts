import { test, expect } from '@playwright/test';

test.describe('Project Reordering', () => {
  test('should support reordering projects up and down in the sidebar', async ({ page }) => {
    const uniqueEmail = `user-${Date.now()}@example.com`;
    const password = 'password123';
    const inviteCode = 'test-invite-code';

    // 1. Visit / and check we are redirected to /welcome
    await page.goto('/');
    await page.waitForURL('**/welcome');

    // 2. Sign up
    await page.fill('#auth-email', uniqueEmail);
    await page.fill('#auth-password', password);
    await page.fill('#auth-invite', inviteCode);
    await page.click('button[type="submit"]');

    // 3. Verify redirected to / and wait for sidebar to load
    await page.waitForURL('**/');
    await expect(page.locator('.ph-title')).toHaveText('Today');

    // Find the sidebar projects
    const secondProjectLink = page.locator('.group\\/project:has-text("Demo with Cortex")');
    const projectNames = page.locator('.group\\/project span');

    // Check initial order
    await expect(projectNames.nth(0)).toHaveText('Alerting Service');
    await expect(projectNames.nth(1)).toHaveText('Demo with Cortex');
    await expect(projectNames.nth(2)).toHaveText('AI Assisted Workflow');

    // Hover over 'Demo with Cortex' to make the buttons visible
    await secondProjectLink.hover();

    // Click the Move Up button ▲
    const upButton = secondProjectLink.locator('button:has-text("▲")');
    await expect(upButton).toBeVisible();
    await upButton.click();

    // Verify 'Demo with Cortex' has moved up and is now the first project
    await expect(projectNames.nth(0)).toHaveText('Demo with Cortex');
    await expect(projectNames.nth(1)).toHaveText('Alerting Service');
    await expect(projectNames.nth(2)).toHaveText('AI Assisted Workflow');

    // Reload page to verify persistence
    await page.reload();
    await expect(page.locator('.ph-title')).toHaveText('Today');

    await expect(projectNames.nth(0)).toHaveText('Demo with Cortex');
    await expect(projectNames.nth(1)).toHaveText('Alerting Service');
    await expect(projectNames.nth(2)).toHaveText('AI Assisted Workflow');
  });
});
