import { test, expect } from '@playwright/test';

test.describe('Review View scheduling', () => {
  test('should allow scheduling tasks to Today and Week directly from Review view', async ({ page }) => {
    const uniqueEmail = `user-${Date.now()}@example.com`;
    const password = 'password123';
    const inviteCode = 'test-invite-code';

    // 1. Sign up
    await page.goto('/');
    await page.waitForURL('**/welcome');
    await page.fill('#auth-email', uniqueEmail);
    await page.fill('#auth-password', password);
    await page.fill('#auth-invite', inviteCode);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/');

    // 2. Navigate to Review
    await page.click('a[href="/review"]');
    await page.waitForURL('**/review');

    // 3. Give the project under review a task of its own. Review opens on the
    // first project, which on a fresh account is the empty default one — so
    // reaching for whatever the seed happens to put first is what made this
    // test brittle.
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const titleInput = page.getByPlaceholder(/Task title/);
    await titleInput.fill('Review scheduling task');
    await titleInput.press('Enter');

    // 4. Locate that row and verify its buttons
    const taskRow = page.locator('.task-row').filter({ hasText: 'Review scheduling task' });
    await expect(taskRow).toBeVisible();
    const todayBtn = taskRow.locator('button:has-text("Today")');
    const weekBtn = taskRow.locator('button:has-text("Week")');

    await expect(todayBtn).toBeVisible();
    await expect(todayBtn).toHaveText('+ Today');
    await expect(weekBtn).toBeVisible();
    await expect(weekBtn).toHaveText('+ Week');

    // Toggle Today on
    await todayBtn.click();
    await expect(todayBtn).toHaveText('✓ Today');

    // Toggle Week on
    await weekBtn.click();
    await expect(weekBtn).toHaveText('✓ Week');

    // Toggle Today off
    await todayBtn.click();
    await expect(todayBtn).toHaveText('+ Today');

    // Toggle Week off
    await weekBtn.click();
    await expect(weekBtn).toHaveText('+ Week');
  });
});
