import { test, expect, type Page } from '@playwright/test'

const API_URL = process.env.FORGE_API_URL || 'http://localhost:8000'

const TEST_EMAIL = `forge-smoke-${Date.now().toString(36)}@example.com`
const TEST_PASSWORD = 'SmokeTest123!'
const TEST_NAME = 'Smoke Test User'

async function getCsrfToken(page: Page): Promise<string> {
  const resp = await page.request.get(`${API_URL}/v1/auth/csrf-token`)
  if (resp.status() !== 200) return ''
  const data = await resp.json()
  return data.csrf_token || ''
}

async function authenticatedHeaders(page: Page): Promise<Record<string, string>> {
  const token = await getCsrfToken(page)
  return token ? { 'X-CSRF-Token': token } : {}
}

test.describe('Forge AI revenue path — smoke test', () => {
  test('critical path: signup → payment → webhook → generate app → usage tracked', async ({ request, browser }) => {
    // ------------------------------------------------------------------
    // STEP 0 — VERIFY EMAIL so build creation is allowed
    // ------------------------------------------------------------------
    const signupResp = await request.post(`${API_URL}/v1/auth/register`, {
      data: { email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD },
    })
    expect.soft(signupResp.status(), `STEP 0 FAILED: POST /v1/auth/register returned HTTP ${signupResp.status()}. Expected 200.`).toBe(200)
    const signupData = (await signupResp.json()) as any
    expect.soft(signupData.user, 'STEP 0 FAILED: /v1/auth/register did not return a user object.').toBeDefined()
    const userId = signupData.user?.id as string | undefined
    expect.soft(userId, 'STEP 0 FAILED: No user ID returned from signup.').toBeTruthy()

    const resendResp = await request.post(`${API_URL}/v1/auth/resend-verification`, {
      data: { email: TEST_EMAIL },
    })
    expect.soft(resendResp.status(), `STEP 0 FAILED: POST /v1/auth/resend-verification returned HTTP ${resendResp.status()}. Expected 200.`).toBe(200)
    const resendData = (await resendResp.json()) as any
    const rawToken = resendData.verification_token as string | undefined
    expect.soft(rawToken, 'STEP 0 FAILED: resend-verification did not return a verification_token. Ensure SMOKE_TEST_MODE=true is set on the backend so the test can complete email verification without an external mailbox.').toBeTruthy()

    const verifyResp = await request.get(`${API_URL}/v1/auth/verify-email?token=${encodeURIComponent(rawToken!)}`)
    expect.soft(verifyResp.status(), `STEP 0 FAILED: GET /v1/auth/verify-email returned HTTP ${verifyResp.status()}. Expected 200.`).toBe(200)

    // ------------------------------------------------------------------
    // STEP 1 — LOGIN via the real frontend
    // ------------------------------------------------------------------
    const page = await browser.newPage()
    await page.goto('/login')

    await page.getByLabel(/^email$/i).fill(TEST_EMAIL)
    await page.getByLabel(/^password$/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect.soft(page).toHaveURL(/.*\/projects/, { timeout: 20_000 })
    await expect.soft(page.getByRole('heading', { name: /no projects yet/i }).first()).toBeVisible({ timeout: 20_000 })

    // ------------------------------------------------------------------
    // STEP 2 — PAYMENT: real Stripe checkout (no mocking)
    // ------------------------------------------------------------------
    // BLOCKER: A fully real Stripe checkout round-trip requires:
    // 1. STRIPE_SECRET_KEY configured in the backend
    // 2. A publicly accessible webhook endpoint for Stripe to deliver events
    // 3. Stripe CLI (`stripe listen` + `stripe trigger`) for local webhook forwarding
    //
    // Without these, we cannot complete a real test-mode payment and receive
    // a genuine webhook in this environment. The step below attempts a real
    // checkout if Stripe is configured; otherwise it fails with a clear message.
    
    // First, check if Stripe is configured by calling the checkout API directly
    const csrfToken = await getCsrfToken(page)
    const checkoutProbeResp = await page.request.post(`${API_URL}/v1/billing/checkout`, {
      data: { plan: 'standard', interval: 'monthly', success_url: 'http://localhost:5173/billing', cancel_url: 'http://localhost:5173/billing' },
      headers: { 'X-CSRF-Token': csrfToken },
    })
    
    if (checkoutProbeResp.status() === 503) {
      const probeData = (await checkoutProbeResp.json()) as { detail?: string }
      throw new Error(
        `STEP 2 FAILED: Stripe is not configured on the backend (503: ${probeData.detail || 'Billing not configured'}). ` +
        'To run a real checkout, set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and Stripe price IDs in the backend environment. ' +
        'For webhook delivery in local/test environments, install the Stripe CLI and run: ' +
        'stripe listen --forward-to localhost:8000/billing/webhook'
      )
    }
    
    // If we get here, Stripe is configured. Proceed with UI flow.
    await page.goto('/billing')
    await page.waitForTimeout(2000)

    await expect.soft(page.getByRole('heading', { name: /plans/i })).toBeVisible({ timeout: 15_000 })

    const standardButton = page.locator('button:has-text("Select Standard")').first()
    await standardButton.click()

    // Wait for redirect to Stripe checkout
    await page.waitForURL(/.*\/(billing|projects|checkout\.stripe\.com)/, { timeout: 15_000 })

    // If Stripe is configured, we should be redirected to checkout.stripe.com
    const currentUrl = page.url()
    const isStripeCheckout = currentUrl.includes('checkout.stripe.com')
    const isBillingPage = currentUrl.includes('/billing')

    if (!isStripeCheckout && isBillingPage) {
      throw new Error(`STEP 2 FAILED: Checkout did not redirect to Stripe after clicking Select Standard. URL: ${currentUrl}`)
    }

    if (isStripeCheckout) {
      // Complete Stripe test checkout
      await page.fill('input[data-test="cardNumber"]', '4242 4242 4242 4242')
      await page.fill('input[data-test="cardExpiry"]', '12/34')
      await page.fill('input[data-test="cardCvc"]', '123')
      await page.fill('input[data-test="billingName"]', TEST_NAME)
      await page.fill('input[data-test="billingEmail"]', TEST_EMAIL)

      const payButton = page.locator('button:has-text("Pay"), button[type="submit"]').first()
      await payButton.click()

      // Wait for redirect back to the app
      await page.waitForURL(/.*\/(billing|projects)/, { timeout: 60_000 })
    } else if (!isBillingPage) {
      // Unexpected redirect
      throw new Error(`STEP 2 FAILED: Unexpected redirect after clicking Select Standard: ${currentUrl}`)
    }

    // ------------------------------------------------------------------
    // STEP 3 — WEBHOOK: confirm billing state updated via real API
    // ------------------------------------------------------------------
    // NOTE: A genuine webhook requires Stripe CLI forwarding or a public endpoint.
    // We verify the subscription state directly; if Stripe is configured and checkout
    // completed, the webhook handler should have updated the DB.
    const subResp = await page.request.get(`${API_URL}/v1/billing/subscription`)
    expect.soft(subResp.status(), `STEP 3 FAILED: /billing/subscription returned HTTP ${subResp.status()}. Expected 200.`).toBe(200)
    const sub = (await subResp.json()) as { plan?: string } | null
    expect.soft(sub, 'STEP 3 FAILED: /billing/subscription returned no data. The checkout step may not have triggered a real payment or webhook.').not.toBeNull()
    expect.soft(sub?.plan, 'STEP 3 FAILED: Subscription exists but plan is not set. Webhook handler may have run but did not update the user plan.').toBeTruthy()

    const usageResp = await page.request.get(`${API_URL}/v1/billing/usage`)
    expect.soft(usageResp.status(), `STEP 3 FAILED: /billing/usage returned HTTP ${usageResp.status()}. Expected 200.`).toBe(200)
    const usage = (await usageResp.json()) as { credits_remaining?: number } | null
    expect.soft(usage, 'STEP 3 FAILED: /billing/usage returned no data — usage tracking may not be initialised for this plan.').not.toBeNull()

    // ------------------------------------------------------------------
    // STEP 4 — GENERATE APP: create project and trigger build
    // ------------------------------------------------------------------
    const authHeaders = await authenticatedHeaders(page)

    const listResp = await page.request.get(`${API_URL}/v1/projects/`, { headers: authHeaders })
    let projectId: string | null = null
    if (listResp.status() === 200) {
      const data = (await listResp.json()) as { projects?: Array<{ id: string }> }
      if (data.projects?.length) projectId = data.projects[0].id
    }

    if (!projectId) {
      const createResp = await page.request.post(
        `${API_URL}/v1/projects/`,
        { data: { name: `Smoke Project ${Date.now()}`, description: 'smoke test' }, headers: authHeaders },
      )
      expect.soft(createResp.status(), `STEP 4 FAILED: POST /v1/projects/ returned HTTP ${createResp.status()}. Expected 200.`).toBe(200)
      const createData = (await createResp.json()) as { id?: string }
      projectId = createData.id || null
    }

    expect.soft(projectId, 'STEP 4 FAILED: Could not create or discover a project. The ProjectsPage create-project flow or /v1/projects/ API may be broken. Check the backend logs for 500 errors on POST /v1/projects/.').toBeTruthy()

    const buildResp = await page.request.post(
      `${API_URL}/v1/builds/`,
      { data: { project_id: projectId!, prompt: 'A simple todo app with local storage', interactive: false }, headers: authHeaders },
    )
    expect.soft(buildResp.status(), `STEP 4 FAILED: Build creation returned HTTP ${buildResp.status()}. Expected 200. If 404, the backend still has the deleted_at query bug in backend/api/builds.py:72.`).toBe(200)

    const buildData = (await buildResp.json()) as { build_id: string; status?: string }
    const buildId = buildData.build_id
    expect.soft(buildId, 'STEP 4 FAILED: Build request returned 200 but no build_id was present in the response. Check the CreateBuildRequest response schema.').toBeTruthy()

    const deadline = Date.now() + 180_000
    let buildStatus = 'timeout'
    while (Date.now() < deadline) {
      const loginResp2 = await page.request.post(`${API_URL}/v1/auth/login`, {
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
      })
      if (loginResp2.status() !== 200) break
      const csrfResp2 = await page.request.get(`${API_URL}/v1/auth/csrf-token`)
      const csrfToken2 = csrfResp2.status() === 200 ? (await csrfResp2.json()).csrf_token : ''
      const authHeaders2 = csrfToken2 ? { 'X-CSRF-Token': csrfToken2 } : {}

      const statusResp = await page.request.get(`${API_URL}/v1/builds/${buildId}`, { headers: authHeaders2 })
      if (statusResp.status() === 200) {
        const statusData = (await statusResp.json()) as { status?: string }
        if (statusData.status && ['completed', 'failed', 'cancelled'].includes(statusData.status)) {
          buildStatus = statusData.status
          break
        }
      }
      await new Promise((r) => setTimeout(r, 5_000))
    }

    expect.soft(buildStatus, `STEP 4 FAILED: Build ${buildId} ended with status "${buildStatus}" instead of "completed". Check the orchestrator logs and WebSocket events at ws://${API_URL.replace(/^http/, 'ws')}/builds/ws/${buildId}.`).toBe('completed')

    // ------------------------------------------------------------------
    // STEP 5 — USAGE TRACKED: confirm build cost was recorded
    // ------------------------------------------------------------------
    const usageResp2 = await page.request.get(`${API_URL}/v1/billing/usage`)
    expect.soft(usageResp2.status(), `STEP 5 FAILED: /billing/usage returned HTTP ${usageResp2.status()}. Expected 200.`).toBe(200)
    const usage2 = (await usageResp2.json()) as { credits_used?: number; builds_count?: number } | null
    expect.soft(usage2, 'STEP 5 FAILED: /billing/usage returned no data — usage tracking may not be recording builds.').not.toBeNull()
    expect.soft(usage2!.builds_count, `STEP 5 FAILED: builds_count is ${usage2!.builds_count}. The generation from step 4 was not tracked. Check credit deduction logic in the build orchestrator.`).toBeGreaterThanOrEqual(1)
  })
})
