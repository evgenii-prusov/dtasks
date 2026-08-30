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

  test('# on a parked task names the project to move it to', async ({ page }) => {
    await signUp(page);

    const quickAdd = page.getByPlaceholder('Quick add task…');
    await quickAdd.fill('Sort me later');
    await quickAdd.press('Enter');

    // 1. On the Inbox page: open the task and type a #tag into its title.
    await page.getByRole('link', { name: /Inbox/ }).click();
    await page.locator('.task-row').filter({ hasText: 'Sort me later' }).click();
    const title = page.getByLabel('Title');
    await title.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' #Alerting');

    await page.getByRole('button', { name: /Alerting Service/ }).click();
    // The tag names a destination, so it leaves the title behind.
    await expect(title).toHaveValue('Sort me later');
    await page.getByRole('button', { name: 'Save' }).click();

    // It left the Inbox for the project named by the tag.
    await expect(page.locator('.task-row').filter({ hasText: 'Sort me later' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Alerting Service' }).click();
    await expect(page.locator('.task-row').filter({ hasText: 'Sort me later' })).toBeVisible();
  });

  test('# works the same way in the Review tab', async ({ page }) => {
    await signUp(page);

    const quickAdd = page.getByPlaceholder('Quick add task…');
    await quickAdd.fill('Triage me in review');
    await quickAdd.press('Enter');

    await page.click('a[href="/review"]');
    await expect(page.getByRole('heading', { level: 3 })).toContainText('Inbox');

    const row = page.locator('.task-row').filter({ hasText: 'Triage me in review' });
    // The row centre is the "File to…" select in this phase, so click the title.
    await row.getByText('Triage me in review').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' #Demo');
    await page.getByRole('button', { name: /Demo with Cortex/ }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Inbox zero ✓')).toBeVisible();
  });
});
