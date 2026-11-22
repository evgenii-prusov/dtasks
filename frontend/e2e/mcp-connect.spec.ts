import { createHash, randomBytes } from 'node:crypto'
import { test, expect } from '@playwright/test'

// The flow Claude drives when you add dtasks as a connector (docs/mcp.md §3),
// starting logged out: authorize → log in → back to consent → Allow → code.
test('connecting Claude from a logged-out browser', async ({ page, request }) => {
  const redirectUri = 'https://claude.ai/api/mcp/auth_callback'
  const client = await (
    await request.post('/register', { data: { client_name: 'Claude', redirect_uris: [redirectUri] } })
  ).json()
  const challenge = createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url')

  // Stand in for claude.ai: capture where dtasks sends the browser back to.
  let callback = ''
  await page.route('https://claude.ai/**', (route) => {
    callback = route.request().url()
    return route.fulfill({ body: 'ok' })
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'e2e',
  })
  await page.goto(`/authorize?${params}`)

  await page.waitForURL('**/welcome')
  await page.fill('#auth-email', `mcp-${Date.now()}@example.com`)
  await page.fill('#auth-password', 'password123')
  await page.fill('#auth-invite', 'test-invite-code')
  await page.click('button[type="submit"]')

  await expect(page.getByText('Connect Claude to dtasks')).toBeVisible()
  await page.getByRole('button', { name: 'Allow' }).click()

  await expect.poll(() => callback).toContain('code=')
  expect(new URL(callback).searchParams.get('state')).toBe('e2e')

  await page.goto('/connected-apps')
  await expect(page.getByText('Claude', { exact: true })).toBeVisible()
})
