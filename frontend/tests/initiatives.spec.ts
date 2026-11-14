import { test, expect, type Page } from '@playwright/test'

const API_URL = process.env.FORGE_API_URL || 'http://localhost:8000'
const BASE_URL = process.env.FORGE_BASE_URL || 'http://localhost:5173'

const TEST_PASSWORD = 'InitiativesTest123!'
const TEST_NAME = 'Initiatives Test User'

function uniqueEmail() {
  return `forge-initiatives-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.com`
}

async function ensureAuthenticated(page: Page): Promise<void> {
  const TEST_EMAIL = uniqueEmail()
  const signupResp = await page.request.post(`${API_URL}/v1/auth/register`, {
    data: { email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD },
  })

  const signupBody = await signupResp.text()
  console.log(`signup status=${signupResp.status()} body=${signupBody}`)

  expect.soft(signupResp.status(), `Signup failed: ${signupBody}`).toBe(200)
  const signupData = (await signupResp.json()) as any
  expect.soft(signupData.user, 'Signup did not return a user').toBeDefined()

  const accessToken = signupData.access_token as string | undefined
  expect.soft(accessToken, 'Signup did not return an access token').toBeTruthy()

  await page.context().addCookies([
    {
      name: 'access_token',
      value: accessToken!,
      domain: new URL(BASE_URL).hostname,
      path: '/',
      httpOnly: true,
      secure: new URL(BASE_URL).protocol === 'https:',
      sameSite: 'Lax',
    },
  ])
}

test.describe('Initiatives page', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page)
  })

  test('opens initiatives list and shows expected UI', async ({ page }) => {
    await page.goto('/initiatives')

    await expect.soft(page.getByRole('heading', { name: /turn ideas into/i })).toBeVisible({ timeout: 20_000 })
    await expect.soft(page.getByLabel(/describe a product to plan end-to-end/i)).toBeVisible()

    const emptyState = page.getByText(/no initiatives yet/i)
    const demoState = page.getByText(/demo mode/i)
    const hasEmpty = (await emptyState.count()) > 0
    const hasDemo = (await demoState.count()) > 0

    expect.soft(hasEmpty || hasDemo, 'Expected either empty state or demo mode to be visible').toBe(true)
  })

  test('shows suggestion chips and credit preview when available', async ({ page }) => {
    await page.goto('/initiatives')

    const hasAI = (await page.getByText('AI SaaS Platform').count()) > 0
    const hasCRM = (await page.getByText('CRM for Healthcare').count()) > 0
    const hasMarketplace = (await page.getByText('Marketplace').count()) > 0

    expect.soft(hasAI || hasCRM || hasMarketplace, 'Expected at least one suggestion chip to be present').toBe(true)

    const creditBadge = page.locator('text=/credits remaining/i')
    if (await creditBadge.count()) {
      await expect.soft(creditBadge.first()).toBeVisible()
    }
  })

  test('toggles view mode and uses search and filters', async ({ page }) => {
    await page.goto('/initiatives')

    const listButton = page.getByRole('button', { name: /list view/i }).first()
    if (await listButton.count()) {
      await listButton.click()
      await expect.soft(page.getByRole('button', { name: /icon view/i }).first()).toHaveAttribute('aria-pressed', 'true')
    }

    await page.getByLabel(/search initiatives/i).fill('nonexistent initiative xyz')
    await expect.soft(page.getByText(/no results for "nonexistent initiative xyz"/i)).toBeVisible()

    await page.getByLabel(/search initiatives/i).fill('')
    await page.getByLabel(/filter by status/i).selectOption('failed')
    await expect.soft(page.getByText(/no initiatives yet|no matches|demo mode/i)).toBeVisible()
  })

  test('creates an initiative and opens detail', async ({ page }) => {
    await page.goto('/initiatives')

    await page.getByLabel(/describe a product to plan end-to-end/i).fill(`Forge E2E initiative ${Date.now()}`)
    await page.getByRole('button', { name: /generate plan/i }).click()

    await expect.soft(page).toHaveURL(/\/initiatives\/[^/]+$/, { timeout: 20_000 })
    await expect.soft(page.getByRole('heading', { name: /forge e2e initiative/i })).toBeVisible({ timeout: 20_000 })
  })

  test('detail page shows tabs and actions', async ({ page }) => {
    await page.goto('/initiatives')
    const prompt = `Forge E2E initiative detail ${Date.now()}`
    await page.getByLabel(/describe a product to plan end-to-end/i).fill(prompt)
    await page.getByRole('button', { name: /generate plan/i }).click()

    await expect.soft(page).toHaveURL(/\/initiatives\/[^/]+$/, { timeout: 20_000 })

    await expect.soft(page.getByRole('link', { name: /overview/i })).toBeVisible()
    await expect.soft(page.getByRole('link', { name: /board/i })).toBeVisible()
    await expect.soft(page.getByRole('link', { name: /sprints/i })).toBeVisible()
    await expect.soft(page.getByRole('link', { name: /agent runs/i })).toBeVisible()
    await expect.soft(page.getByRole('link', { name: /roadmap/i })).toBeVisible()
    await expect.soft(page.getByRole('link', { name: /graph/i })).toBeVisible()
    await expect.soft(page.getByRole('link', { name: /releases/i })).toBeVisible()
    await expect.soft(page.getByRole('link', { name: /activity/i })).toBeVisible()
    await expect.soft(page.getByRole('link', { name: /integrations/i })).toBeVisible()
    await expect.soft(page.getByRole('link', { name: /analytics/i })).toBeVisible()

    await expect.soft(page.getByRole('button', { name: /export/i })).toBeVisible()
  })

  test('can navigate between initiative tabs', async ({ page }) => {
    await page.goto('/initiatives')
    await page.getByLabel(/describe a product to plan end-to-end/i).fill(`Forge E2E initiative tabs ${Date.now()}`)
    await page.getByRole('button', { name: /generate plan/i }).click()

    await expect.soft(page).toHaveURL(/\/initiatives\/[^/]+$/, { timeout: 20_000 })

    const tabs = ['board', 'sprints', 'agent-runs', 'roadmap', 'graph', 'releases', 'activity', 'integrations', 'analytics']
    for (const tab of tabs) {
      const link = page.getByRole('link', { name: new RegExp(tab.replace('-', '\\s'), 'i') })
      if (await link.count()) {
        await link.click()
        await expect.soft(page).toHaveURL(new RegExp(`\\/initiatives\\/[^/]+\\/${tab}$`), { timeout: 10_000 })
      }
    }
  })
})
