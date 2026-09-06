# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: initiatives.spec.ts >> Initiatives page >> shows suggestion chips and credit preview when available
- Location: tests/initiatives.spec.ts:61:3

# Error details

```
Error: Expected at least one suggestion chip to be present

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- paragraph [ref=e9]: Opening…
```

# Test source

```ts
  1   | import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
  2   | 
  3   | const API_URL = process.env.FORGE_API_URL || 'http://localhost:8000'
  4   | const BASE_URL = process.env.FORGE_BASE_URL || 'http://localhost:5173'
  5   | 
  6   | const TEST_PASSWORD = 'InitiativesTest123!'
  7   | const TEST_NAME = 'Initiatives Test User'
  8   | 
  9   | function uniqueEmail() {
  10  |   return `forge-initiatives-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.com`
  11  | }
  12  | 
  13  | async function ensureAuthenticated(page: Page): Promise<void> {
  14  |   const TEST_EMAIL = uniqueEmail()
  15  |   const signupResp = await page.request.post(`${API_URL}/v1/auth/register`, {
  16  |     data: { email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD },
  17  |   })
  18  | 
  19  |   const signupBody = await signupResp.text()
  20  |   console.log(`signup status=${signupResp.status()} body=${signupBody}`)
  21  | 
  22  |   expect.soft(signupResp.status(), `Signup failed: ${signupBody}`).toBe(200)
  23  |   const signupData = (await signupResp.json()) as any
  24  |   expect.soft(signupData.user, 'Signup did not return a user').toBeDefined()
  25  | 
  26  |   const accessToken = signupData.access_token as string | undefined
  27  |   expect.soft(accessToken, 'Signup did not return an access token').toBeTruthy()
  28  | 
  29  |   await page.context().addCookies([
  30  |     {
  31  |       name: 'access_token',
  32  |       value: accessToken!,
  33  |       domain: new URL(BASE_URL).hostname,
  34  |       path: '/',
  35  |       httpOnly: true,
  36  |       secure: new URL(BASE_URL).protocol === 'https:',
  37  |       sameSite: 'Lax',
  38  |     },
  39  |   ])
  40  | }
  41  | 
  42  | test.describe('Initiatives page', () => {
  43  |   test.beforeEach(async ({ page }) => {
  44  |     await ensureAuthenticated(page)
  45  |   })
  46  | 
  47  |   test('opens initiatives list and shows expected UI', async ({ page }) => {
  48  |     await page.goto('/initiatives')
  49  | 
  50  |     await expect.soft(page.getByRole('heading', { name: /turn ideas into/i })).toBeVisible({ timeout: 20_000 })
  51  |     await expect.soft(page.getByLabel(/describe a product to plan end-to-end/i)).toBeVisible()
  52  | 
  53  |     const emptyState = page.getByText(/no initiatives yet/i)
  54  |     const demoState = page.getByText(/demo mode/i)
  55  |     const hasEmpty = (await emptyState.count()) > 0
  56  |     const hasDemo = (await demoState.count()) > 0
  57  | 
  58  |     expect.soft(hasEmpty || hasDemo, 'Expected either empty state or demo mode to be visible').toBe(true)
  59  |   })
  60  | 
  61  |   test('shows suggestion chips and credit preview when available', async ({ page }) => {
  62  |     await page.goto('/initiatives')
  63  | 
  64  |     const hasAI = (await page.getByText('AI SaaS Platform').count()) > 0
  65  |     const hasCRM = (await page.getByText('CRM for Healthcare').count()) > 0
  66  |     const hasMarketplace = (await page.getByText('Marketplace').count()) > 0
  67  | 
> 68  |     expect.soft(hasAI || hasCRM || hasMarketplace, 'Expected at least one suggestion chip to be present').toBe(true)
      |                                                                                                           ^ Error: Expected at least one suggestion chip to be present
  69  | 
  70  |     const creditBadge = page.locator('text=/credits remaining/i')
  71  |     if (await creditBadge.count()) {
  72  |       await expect.soft(creditBadge.first()).toBeVisible()
  73  |     }
  74  |   })
  75  | 
  76  |   test('toggles view mode and uses search and filters', async ({ page }) => {
  77  |     await page.goto('/initiatives')
  78  | 
  79  |     const listButton = page.getByRole('button', { name: /list view/i }).first()
  80  |     if (await listButton.count()) {
  81  |       await listButton.click()
  82  |       await expect.soft(page.getByRole('button', { name: /icon view/i }).first()).toHaveAttribute('aria-pressed', 'true')
  83  |     }
  84  | 
  85  |     await page.getByLabel(/search initiatives/i).fill('nonexistent initiative xyz')
  86  |     await expect.soft(page.getByText(/no results for "nonexistent initiative xyz"/i)).toBeVisible()
  87  | 
  88  |     await page.getByLabel(/search initiatives/i).fill('')
  89  |     await page.getByLabel(/filter by status/i).selectOption('failed')
  90  |     await expect.soft(page.getByText(/no initiatives yet|no matches|demo mode/i)).toBeVisible()
  91  |   })
  92  | 
  93  |   test('creates an initiative and opens detail', async ({ page }) => {
  94  |     await page.goto('/initiatives')
  95  | 
  96  |     await page.getByLabel(/describe a product to plan end-to-end/i).fill(`Forge E2E initiative ${Date.now()}`)
  97  |     await page.getByRole('button', { name: /generate plan/i }).click()
  98  | 
  99  |     await expect.soft(page).toHaveURL(/\/initiatives\/[^/]+$/, { timeout: 20_000 })
  100 |     await expect.soft(page.getByRole('heading', { name: /forge e2e initiative/i })).toBeVisible({ timeout: 20_000 })
  101 |   })
  102 | 
  103 |   test('detail page shows tabs and actions', async ({ page }) => {
  104 |     await page.goto('/initiatives')
  105 |     const prompt = `Forge E2E initiative detail ${Date.now()}`
  106 |     await page.getByLabel(/describe a product to plan end-to-end/i).fill(prompt)
  107 |     await page.getByRole('button', { name: /generate plan/i }).click()
  108 | 
  109 |     await expect.soft(page).toHaveURL(/\/initiatives\/[^/]+$/, { timeout: 20_000 })
  110 | 
  111 |     await expect.soft(page.getByRole('link', { name: /overview/i })).toBeVisible()
  112 |     await expect.soft(page.getByRole('link', { name: /board/i })).toBeVisible()
  113 |     await expect.soft(page.getByRole('link', { name: /sprints/i })).toBeVisible()
  114 |     await expect.soft(page.getByRole('link', { name: /agent runs/i })).toBeVisible()
  115 |     await expect.soft(page.getByRole('link', { name: /roadmap/i })).toBeVisible()
  116 |     await expect.soft(page.getByRole('link', { name: /graph/i })).toBeVisible()
  117 |     await expect.soft(page.getByRole('link', { name: /releases/i })).toBeVisible()
  118 |     await expect.soft(page.getByRole('link', { name: /activity/i })).toBeVisible()
  119 |     await expect.soft(page.getByRole('link', { name: /integrations/i })).toBeVisible()
  120 |     await expect.soft(page.getByRole('link', { name: /analytics/i })).toBeVisible()
  121 | 
  122 |     await expect.soft(page.getByRole('button', { name: /export/i })).toBeVisible()
  123 |   })
  124 | 
  125 |   test('can navigate between initiative tabs', async ({ page }) => {
  126 |     await page.goto('/initiatives')
  127 |     await page.getByLabel(/describe a product to plan end-to-end/i).fill(`Forge E2E initiative tabs ${Date.now()}`)
  128 |     await page.getByRole('button', { name: /generate plan/i }).click()
  129 | 
  130 |     await expect.soft(page).toHaveURL(/\/initiatives\/[^/]+$/, { timeout: 20_000 })
  131 | 
  132 |     const tabs = ['board', 'sprints', 'agent-runs', 'roadmap', 'graph', 'releases', 'activity', 'integrations', 'analytics']
  133 |     for (const tab of tabs) {
  134 |       const link = page.getByRole('link', { name: new RegExp(tab.replace('-', '\\s'), 'i') })
  135 |       if (await link.count()) {
  136 |         await link.click()
  137 |         await expect.soft(page).toHaveURL(new RegExp(`\\/initiatives\\/[^/]+\\/${tab}$`), { timeout: 10_000 })
  138 |       }
  139 |     }
  140 |   })
  141 | })
  142 | 
```