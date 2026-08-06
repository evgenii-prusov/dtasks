import { test, expect, type Page } from '@playwright/test'

/** Each spec signs up its own user; there are no shared fixtures in this suite. */
async function signup(page: Page) {
  const email = `edit-${Date.now()}@example.com`
  await page.goto('/')
  await page.fill('#auth-email', email)
  await page.fill('#auth-password', 'password123')
  await page.fill('#auth-invite', 'test-invite-code')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/')
  await expect(page.locator('.ph-title')).toBeVisible()
}

test('a task is renamed and given notes without leaving the keyboard', async ({ page }) => {
  await signup(page)

  await page.keyboard.press('n')
  const quickAdd = page.getByPlaceholder(/Quick add task/)
  await expect(quickAdd).toBeFocused()
  await quickAdd.fill('Rename me #Edit')
  // The #tag autocomplete claims the first Enter, and Escape only dismisses it
  // once it is actually open — pressing early would clear the field instead.
  await expect(page.getByRole('button', { name: /Create project "Edit"/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')

  // A fresh account comes seeded, so work inside the project the #tag made —
  // it holds this task and nothing else, which keeps `j` unambiguous.
  const projectLink = page.getByRole('link', { name: 'Edit', exact: true })
  await expect(projectLink).toBeVisible()
  await projectLink.click()
  await expect(page.locator('.task-row').first()).toBeVisible()
  await page.keyboard.press('j')
  await expect(page.locator('.task-row[data-active]')).toContainText('Rename me')

  // Enter opens the editor straight into the title, with the text selected —
  // so typing replaces it outright.
  await page.keyboard.press('Enter')
  const title = page.getByLabel('Title')
  await expect(title).toBeFocused()
  await page.keyboard.type('Renamed by keyboard')
  await expect(title).toHaveValue('Renamed by keyboard')

  // Then the jump into the description, and save from there.
  await page.keyboard.press('ControlOrMeta+ArrowDown')
  const notes = page.getByLabel('Notes')
  await expect(notes).toBeFocused()
  await page.keyboard.type('Body text')
  await page.keyboard.press('ControlOrMeta+Enter')

  await expect(page.locator('.task-row')).toContainText('Renamed by keyboard')
  await expect(title).toBeHidden()

  // The same chord from the focused row opens the editor in the description.
  await expect(page.locator('.task-row[data-active]')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+ArrowDown')
  await expect(page.getByLabel('Notes')).toBeFocused()
  await expect(page.getByLabel('Notes')).toHaveValue('Body text')
})

// The test above works inside a project holding a single task, which is
// exactly the case that can't catch this: the editor swaps the row's element,
// and with a neighbour in the list the nav registry read that as a deleted row
// and moved the focus on to it, so the open editor took no typing at all.
test('Enter keeps the caret in the title when the list has other rows', async ({ page }) => {
  await signup(page)

  // Plan lists every open task from the seeded account, so the row has
  // neighbours above and below it.
  await page.keyboard.press('g')
  await page.keyboard.press('p')
  await expect(page.locator('.task-row').first()).toBeVisible()

  await page.keyboard.press('j')
  await page.keyboard.press('j')
  const target = await page.locator('.task-row[data-active]').textContent()

  await page.keyboard.press('Enter')
  const title = page.getByLabel('Title')
  await expect(title).toBeFocused()

  // Opened on the row that was actually active, with its text selected.
  const original = await title.inputValue()
  expect(target).toContain(original)

  await page.keyboard.type('Typed into the editor')
  await expect(title).toHaveValue('Typed into the editor')
})
