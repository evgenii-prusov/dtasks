import { test, expect, type Page } from '@playwright/test'

/** Each spec signs up its own user; there are no shared fixtures in this suite. */
async function signup(page: Page) {
  await page.goto('/')
  await page.waitForURL('**/welcome')
  await page.fill('#auth-email', `completed-${Date.now()}@example.com`)
  await page.fill('#auth-password', 'password123')
  await page.fill('#auth-invite', 'test-invite-code')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/')
  await expect(page.locator('.ph-title')).toBeVisible()
}

test.describe('Completed tasks', () => {
  test('Review folds them away, and opens and searches them on request', async ({ page }) => {
    await signup(page)
    await page.click('a[href="/review"]')
    await expect(page.getByRole('heading', { level: 3 })).toContainText('Inbox')

    // Review opens on the Inbox. Add two tasks there and tick both off.
    for (const title of ['Renew the passport', 'Send the tax form']) {
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      const titleInput = page.getByPlaceholder(/Task title/)
      await titleInput.fill(title)
      await titleInput.press('Enter')
      await page.locator('.task-row').filter({ hasText: title }).locator('.cb').click()
      await expect(page.locator('.task-row').filter({ hasText: title })).toHaveCount(0)
    }

    // The undo toast repeats the title, so look inside the card, not the page.
    const card = page.locator('.card')

    // Finished, counted, and out of the way.
    await expect(card.getByText('Completed (2)')).toBeVisible()
    await expect(card.getByText('Renew the passport')).toHaveCount(0)
    await expect(card.getByText('Send the tax form')).toHaveCount(0)

    await card.getByRole('button', { name: /Show \(2\)/ }).click()
    await expect(card.getByText('Renew the passport')).toBeVisible()
    await expect(card.getByText('Send the tax form')).toBeVisible()

    await card.getByRole('textbox', { name: 'Search completed…' }).fill('PASSPORT')
    await expect(card.getByText('Completed (1 of 2)')).toBeVisible()
    await expect(card.getByText('Renew the passport')).toBeVisible()
    await expect(card.getByText('Send the tax form')).toHaveCount(0)

    await card.getByRole('textbox', { name: 'Search completed…' }).fill('zzz')
    await expect(card.getByText('No completed tasks match "zzz"')).toBeVisible()

    // Folding it forgets the search, so it opens again showing everything.
    await card.getByRole('button', { name: 'Hide' }).click()
    await expect(card.getByText('Renew the passport')).toHaveCount(0)
    await card.getByRole('button', { name: /Show \(2\)/ }).click()
    await expect(card.getByText('Send the tax form')).toBeVisible()
    await expect(card.getByRole('textbox', { name: 'Search completed…' })).toHaveValue('')
  })

  test('the palette still lands on a finished task, though the list starts folded', async ({
    page,
  }) => {
    await signup(page)

    // Park a task and finish it from the Inbox page.
    const quickAdd = page.getByPlaceholder('Quick add task…')
    await quickAdd.fill('Renew the passport')
    await quickAdd.press('Enter')
    await page.getByRole('link', { name: /Inbox/ }).click()
    await expect(page.locator('.ph-title')).toContainText('Inbox')
    await page.locator('.task-row').filter({ hasText: 'Renew the passport' }).locator('.cb').click()

    // It now sits in the folded Completed card, not in the page.
    await expect(page.getByText('Completed (1)')).toBeVisible()
    await expect(page.locator('.task-row').filter({ hasText: 'Renew the passport' })).toHaveCount(0)

    // Leave, then find it by name from anywhere.
    await page.getByRole('link', { name: /Today/ }).click()
    await expect(page.locator('.ph-title')).toContainText('Today')
    await page.keyboard.press('ControlOrMeta+KeyK')
    await page.getByRole('combobox').fill('passport')
    await expect(page.getByRole('option', { name: /Renew the passport/ })).toBeVisible()
    await page.keyboard.press('Enter')

    // The jump opened the list to get at it, and focused the row it found.
    await expect(page.locator('.task-row[data-active]')).toContainText('Renew the passport')
    await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible()
    // And it is spent: a reload would not repeat the jump.
    await expect(page).not.toHaveURL(/task=/)
  })
})
