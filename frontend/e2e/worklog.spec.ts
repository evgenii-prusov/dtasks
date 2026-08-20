import { test, expect, type Page } from '@playwright/test';

async function signup(page: Page) {
  const email = `worklog-${Date.now()}@example.com`;
  await page.goto('/');
  await page.waitForURL('**/welcome');
  await page.fill('#auth-email', email);
  await page.fill('#auth-password', 'password123');
  await page.fill('#auth-invite', 'test-invite-code');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  // Let the layout mount before pressing keys: the global hotkeys register there.
  await expect(page.locator('.ph-title')).toBeVisible();
}

test.describe('Work Log', () => {
  test('captures an entry with evidence, rates the day, and rolls it up by week', async ({ page }) => {
    await signup(page);

    // The `g l` jump, not a sidebar click — this covers the hotkey wiring too.
    await page.keyboard.press('g');
    await page.keyboard.press('l');
    await page.waitForURL('**/worklog');
    await expect(page.locator('.nav.on')).toHaveText(/Work Log/);

    // Rate the day: energy 4, friction 2.
    await page.getByRole('group', { name: 'Energy' }).getByRole('button', { name: '4' }).click();
    await page.getByRole('group', { name: 'Friction' }).getByRole('button', { name: '2' }).click();

    await page.getByRole('button', { name: /Log something/ }).click();
    await page.getByPlaceholder('What did you do?').fill('Cut checkout latency');
    await page.getByPlaceholder(/What was broken/).fill('p95 was over a second');
    await page.getByPlaceholder(/820ms/).fill('p95 820ms -> 340ms');

    // A GitHub PR url should classify itself without touching the dropdown.
    await page.getByPlaceholder(/Paste a PR/).fill('https://github.com/acme/api/pull/1421');
    await expect(page.getByRole('combobox')).toHaveValue('pr');

    await page.getByRole('button', { name: 'Save entry' }).click();

    const row = page.locator('.task-row').filter({ hasText: 'Cut checkout latency' });
    await expect(row).toBeVisible();
    await expect(row.getByText('p95 820ms -> 340ms')).toBeVisible();
    await expect(row.getByText('Shipped')).toBeVisible();
    await expect(row.getByRole('link', { name: 'PR' })).toHaveAttribute(
      'href',
      'https://github.com/acme/api/pull/1421',
    );

    // The signal and the entry must both survive a reload.
    await page.reload();
    await expect(page.locator('.task-row').filter({ hasText: 'Cut checkout latency' })).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Energy' }).getByRole('button', { name: '4' }),
    ).toHaveAttribute('aria-pressed', 'true');

    // The weekly rollup should count it in the current (last) bucket.
    await page.getByRole('button', { name: 'By week' }).click();
    const table = page.getByRole('table');
    await expect(table).toBeVisible();

    // Columns: period, total, 4 categories, with-impact, days, energy, friction.
    const lastRow = table.locator('tbody tr').last();
    await expect(lastRow.locator('td').nth(1)).toHaveText('1');
    // Energy column reads back the rating given on the capture tab.
    await expect(lastRow.locator('td').nth(8)).toHaveText('4.0');

    // And the bucket's evidence list repeats the entry underneath the table.
    await expect(
      page.locator('.card').filter({ hasText: 'Cut checkout latency' }).first(),
    ).toBeVisible();
  });

  test('promotes a task completed today into a log entry', async ({ page }) => {
    await signup(page);

    // Create the task from Review (its add form targets one known project, which
    // is what keeps this from depending on quick-add's group prompt), then
    // complete it so it becomes promotable.
    await page.click('a[href="/review"]');
    await page.waitForURL('**/review');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const titleInput = page.getByPlaceholder(/Task title/);
    await titleInput.fill('Drain the retry queue');
    await titleInput.press('Enter');

    const taskRow = page.locator('.task-row').filter({ hasText: 'Drain the retry queue' });
    await expect(taskRow).toBeVisible();
    await taskRow.locator('.cb').click();

    await page.click('a[href="/worklog"]');
    await page.waitForURL('**/worklog');

    const promote = page.locator('.card').filter({ hasText: 'Finished today' });
    await expect(promote).toBeVisible();
    await promote.getByRole('button', { name: 'Log it' }).click();

    // The form arrives prefilled, so logging it is one click.
    await expect(page.getByPlaceholder('What did you do?')).toHaveValue('Drain the retry queue');
    await page.getByRole('button', { name: 'Save entry' }).click();

    await expect(
      page.locator('.task-row').filter({ hasText: 'Drain the retry queue' }),
    ).toBeVisible();
    // Once logged, it drops out of the promote list.
    await expect(page.locator('.card').filter({ hasText: 'Finished today' })).toHaveCount(0);
  });
});
