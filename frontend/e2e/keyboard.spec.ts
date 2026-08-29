import { test, expect, type Page } from '@playwright/test'

/** Each spec signs up its own user; there are no shared fixtures in this suite. */
async function signup(page: Page) {
  const email = `kbd-${Date.now()}@example.com`
  await page.goto('/')
  await page.fill('#auth-email', email)
  await page.fill('#auth-password', 'password123')
  await page.fill('#auth-invite', 'test-invite-code')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/')
  await expect(page.locator('.ph-title')).toBeVisible()
}

test('g-sequences move between pages', async ({ page }) => {
  await signup(page)

  await page.keyboard.press('g')
  await page.keyboard.press('p')
  await expect(page.locator('.nav.on')).toHaveText(/Plan/)

  await page.keyboard.press('g')
  await page.keyboard.press('h')
  await expect(page.locator('.nav.on')).toHaveText(/Habits/)

  await page.keyboard.press('g')
  await page.keyboard.press('t')
  await expect(page.locator('.nav.on')).toHaveText(/Today/)

  // The Inbox is a project route, but it answers the same kind of chord.
  await page.keyboard.press('g')
  await page.keyboard.press('i')
  await expect(page.locator('.nav.on')).toHaveText(/Inbox/)
  await expect(page.locator('.ph-title')).toContainText('Inbox')
})

test('the palette finds a project and navigates to it', async ({ page }) => {
  await signup(page)

  await page.keyboard.press('ControlOrMeta+KeyK')
  const input = page.getByRole('combobox')
  await expect(input).toBeFocused()

  await input.fill('Plan')
  await page.keyboard.press('Enter')
  await expect(page.locator('.nav.on')).toHaveText(/Plan/)
})

test('a task can be created, scheduled and completed without the mouse', async ({ page }) => {
  await signup(page)

  // `n` focuses quick add. The #tag names its own project, so the
  // Work/Personal prompt never appears and the flow stays on the keyboard.
  await page.keyboard.press('n')
  const quickAdd = page.getByPlaceholder(/Quick add task/)
  await expect(quickAdd).toBeFocused()
  await quickAdd.fill('Keyboard smoke task #Smoke')
  // The #tag autocomplete would claim the first Enter, so Escape dismisses the
  // dropdown first. It has to be open when that Escape lands: quick add opens
  // it from an effect, and the same key with no dropdown showing clears the
  // field instead, leaving Enter nothing to submit.
  await expect(page.getByRole('button', { name: /Create project "Smoke"/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')

  await page.keyboard.press('Escape')

  // Find it by name from anywhere; the jump focuses the row it landed on.
  // Waiting for the option covers the write still being in flight.
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.getByRole('combobox').fill('Keyboard smoke')
  await expect(page.getByRole('option', { name: /Keyboard smoke task/ })).toBeVisible()
  await page.keyboard.press('Enter')

  await expect(page.locator('.task-row[data-active]')).toContainText('Keyboard smoke task')

  // Complete it straight from the focused row.
  await page.keyboard.press('x')
  await expect(page.locator('.undo-toast')).toBeVisible()
})

test('# files a task under a section without ever asking Work or Personal', async ({
  page,
}) => {
  await signup(page)

  await page.keyboard.press('n')
  const quickAdd = page.getByPlaceholder(/Quick add task/)
  await quickAdd.fill('Daily standup #')

  // The Inbox leads the dropdown -- one Enter parks a thought -- with the two
  // group defaults behind it.
  await expect(page.getByRole('button', { name: /Inbox/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Work \(Default\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Personal \(Default\)/ })).toBeVisible()
  await page.keyboard.press('Enter')

  await expect(page.getByText('Is this for Work or Personal?')).toHaveCount(0)

  // Typing towards Personal narrows to that one option.
  await quickAdd.fill('Book dentist #per')
  await expect(page.getByRole('button', { name: /Personal \(Default\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Work \(Default\)/ })).toHaveCount(0)
  await page.keyboard.press('Enter')

  // One parked in the Inbox, one filed under Personal; Plan lists both.
  await page.keyboard.press('Escape')
  await page.keyboard.press('g')
  await page.keyboard.press('p')
  await expect(page.getByText('Daily standup')).toBeVisible()
  await expect(page.getByText('Book dentist')).toBeVisible()
})

test('j and k walk the task list', async ({ page }) => {
  await signup(page)

  // Plan lists every open task; a fresh account has nothing scheduled yet, so
  // Today would be empty.
  await page.keyboard.press('g')
  await page.keyboard.press('p')
  await expect(page.locator('.task-row').first()).toBeVisible()

  await page.keyboard.press('j')
  const first = await page.locator('.task-row[data-active]').textContent()

  await page.keyboard.press('j')
  const second = await page.locator('.task-row[data-active]').textContent()
  expect(second).not.toBe(first)

  await page.keyboard.press('k')
  await expect(page.locator('.task-row[data-active]')).toHaveText(first ?? '')
})

test('the shortcuts overlay opens with ?', async ({ page }) => {
  await signup(page)

  await page.keyboard.press('Shift+Slash')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Keyboard shortcuts')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
