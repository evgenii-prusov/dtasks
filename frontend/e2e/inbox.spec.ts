import { test, expect } from '@playwright/test';

async function signUp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForURL('**/welcome');
  await page.fill('#auth-email', `user-${Date.now()}@example.com`);
  await page.fill('#auth-password', 'password123');
  await page.fill('#auth-invite', 'test-invite-code');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  await expect(page.locator('.ph-title')).toHaveText('Today');
}

test.describe('Inbox', () => {
  test('parks a task with no project, then files it during review', async ({ page }) => {
    await signUp(page);

    // 1. Quick add without naming a project: no Work/Personal question, and the
    //    task lands in the Inbox.
    const quickAdd = page.getByPlaceholder('Quick add task…');
    await quickAdd.fill('Half-formed idea');
    await quickAdd.press('Enter');

    const inboxLink = page.getByRole('link', { name: /Inbox/ });
    await expect(inboxLink).toContainText('1');
    await expect(page.getByText('Is this for Work or Personal?')).toHaveCount(0);

    // 2. The Inbox page holds it.
    await inboxLink.click();
    await expect(page.locator('.ph-title')).toContainText('Inbox');
    await expect(page.locator('.task-row').filter({ hasText: 'Half-formed idea' })).toBeVisible();

    // 3. Review opens on the Inbox, ahead of every project.
    await page.click('a[href="/review"]');
    await page.waitForURL('**/review');
    await expect(page.getByRole('heading', { level: 3 })).toContainText('Inbox');

    // 4. File it into a real project; the Inbox empties.
    const row = page.locator('.task-row').filter({ hasText: 'Half-formed idea' });
    await row.getByLabel('File to…').selectOption({ label: 'Alerting Service' });
    await expect(row).toHaveCount(0);
    await expect(page.getByText('Inbox zero ✓')).toBeVisible();
    await expect(page.getByRole('link', { name: /Inbox/ })).not.toContainText('1');
  });
});
