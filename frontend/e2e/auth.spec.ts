import { test, expect } from '@playwright/test';

test.describe('Authentication and onboarding', () => {
  test('should handle full signup, logout, and login flow', async ({ page }) => {
    // Generate a unique email to avoid conflicts in local SQLite
    const uniqueEmail = `user-${Date.now()}@example.com`;
    const password = 'password123';
    const inviteCode = 'test-invite-code';

    // 1. Visit / and check we are redirected to /welcome
    await page.goto('/');
    await page.waitForURL('**/welcome');
    await expect(page.locator('form h2')).toHaveText('Create your account');

    // 2. Sign up with invite code
    await page.fill('#auth-email', uniqueEmail);
    await page.fill('#auth-password', password);
    await page.fill('#auth-invite', inviteCode);
    
    // Click submit
    await page.click('button[type="submit"]');

    // 3. Verify redirected to / and starter data is visible
    await page.waitForURL('**/');
    await expect(page.locator('.ph-title')).toHaveText('Today');
    
    // Verify starter/seeded data is visible
    await expect(page.locator('text=Implement Slack integration').first()).toBeVisible();
    await expect(page.locator('text=Define demo storyline & key messages').first()).toBeVisible();

    // Verify email is in Sidebar
    await expect(page.getByText(uniqueEmail)).toBeVisible();

    // 4. Logout
    await page.click('button:has-text("Log out")');
    await page.waitForURL('**/welcome');

    // 5. Login again with same credentials
    // First switch to login mode
    await page.click('button:has-text("Log in")');
    await expect(page.locator('form h2')).toHaveText('Welcome back');

    await page.fill('#auth-email', uniqueEmail);
    await page.fill('#auth-password', password);
    await page.click('button[type="submit"]');

    // 6. Verify redirected back to / and data is still there
    await page.waitForURL('**/');
    await expect(page.locator('.ph-title')).toHaveText('Today');
    await expect(page.locator('text=Implement Slack integration').first()).toBeVisible();
    await expect(page.locator('text=Define demo storyline & key messages').first()).toBeVisible();
    await expect(page.getByText(uniqueEmail)).toBeVisible();
  });
});
