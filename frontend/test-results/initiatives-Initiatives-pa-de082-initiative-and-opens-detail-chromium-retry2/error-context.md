# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: initiatives.spec.ts >> Initiatives page >> creates an initiative and opens detail
- Location: tests/initiatives.spec.ts:93:3

# Error details

```
Error: apiRequestContext.post: Request context disposed.
Call log:
  - → POST https://forge-ai-ioom.onrender.com/v1/auth/register
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 121

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
> 15  |   const signupResp = await page.request.post(`${API_URL}/v1/auth/register`, {
      |                                         ^ Error: apiRequestContext.post: Request context disposed.
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
  68  |     expect.soft(hasAI || hasCRM || hasMarketplace, 'Expected at least one suggestion chip to be present').toBe(true)
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
```