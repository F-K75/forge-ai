import { test, expect, type Page } from '@playwright/test'

// Forge OS shell (WS-A). Runs against the demo build (no backend: the shell's
// in-browser fake streams contract-valid events) or a live stack in no-key
// mode. FORGE_BASE_URL points at the frontend.

async function freshHome(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('os-spec-seeded')) {
      localStorage.clear()
      sessionStorage.setItem('os-spec-seeded', '1')
    }
  })
  await page.goto('/os')
  await expect(page.getByLabel('Message Forge')).toBeVisible()
}

async function ask(page: Page, prompt: string) {
  const box = page.getByLabel('Message Forge')
  await box.fill(prompt)
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled()
  await box.press('Enter')
}

test.describe('Forge OS shell', () => {
  test('minimal home: branding, centred composer, nav, account; no dashboards', async ({ page }) => {
    await freshHome(page)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('What should we make?')
    await expect(page.getByTestId('os-composer')).toHaveAttribute('data-variant', 'center')
    await expect(page.getByTestId('os-nav-panel')).toBeVisible()
    await expect(page.getByTestId('os-account-button')).toBeVisible()
    await expect(page.locator('[data-os-window]')).toHaveCount(0)
    await expect(page.locator('#os-menubar')).toHaveCount(0) // the classic top bar is gone
  })

  test('first prompt docks the composer, creates a session and opens a window', async ({ page }) => {
    await freshHome(page)
    await ask(page, 'Chart revenue by region')
    await expect(page.getByTestId('os-composer')).toHaveAttribute('data-variant', 'docked')
    await expect(page).toHaveURL(/\/os\/s\/[A-Za-z0-9_.:-]+$/)
    const win = page.locator('[data-window-kind="surface"]')
    await expect(win).toBeVisible()
    await expect(win.getByRole('heading', { name: 'Revenue by region' })).toBeVisible()
    await expect(page.getByTestId('os-nav-panel').getByRole('button', { name: 'Chart revenue by region' })).toBeVisible()
  })

  test('window manager: minimise, restore, maximise, tile, close', async ({ page }) => {
    await freshHome(page)
    await ask(page, 'Chart revenue by region')
    await expect(page.locator('[data-window-kind="surface"]')).toHaveCount(1)
    await ask(page, 'Compare models for coding')
    await expect(page.locator('[data-window-kind="surface"]')).toHaveCount(2)

    await page.keyboard.press('Alt+KeyT')
    const boxes = await page.locator('[data-os-window]').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, w: r.width, y: r.y })),
    )
    expect(boxes).toHaveLength(2)
    const [a, b] = boxes.sort((p, q) => p.x - q.x)
    expect(a!.x + a!.w).toBeLessThanOrEqual(b!.x)

    await page.getByRole('button', { name: 'Minimize Compare models for coding' }).click()
    const shelf = page.getByRole('list', { name: 'Minimized windows' })
    await expect(shelf.getByRole('button', { name: /Compare models/ })).toBeVisible()
    await shelf.getByRole('button', { name: /Compare models/ }).click()
    await page.getByRole('button', { name: 'Maximize Compare models for coding' }).click()
    await expect(page.getByRole('button', { name: 'Restore Compare models for coding size' })).toBeVisible()
    await page.getByRole('button', { name: 'Close Compare models for coding' }).click()
    await expect(page.locator('[data-os-window]')).toHaveCount(1)
  })

  test('session and windows survive a reload', async ({ page }) => {
    await freshHome(page)
    await ask(page, 'Chart revenue by region')
    await expect(page.locator('[data-window-kind="surface"]')).toBeVisible()
    const url = page.url()
    await page.reload()
    await expect(page).toHaveURL(url)
    await expect(page.getByTestId('os-thread')).toContainText('Chart revenue by region')
    await expect(page.locator('[data-window-kind="surface"]').getByRole('heading', { name: 'Revenue by region' })).toBeVisible()
  })

  test('command palette lists capabilities, sessions and actions', async ({ page }) => {
    await freshHome(page)
    await page.keyboard.press('Control+KeyK')
    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    await expect(dialog.getByRole('group', { name: 'Capabilities' })).toBeVisible()
    await expect(dialog.getByRole('group', { name: 'Sessions' })).toBeVisible()
    await expect(dialog.getByRole('group', { name: 'Actions' })).toBeVisible()
    await page.getByLabel('Search commands').fill('command center')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-window-kind="legacy_route"]').getByRole('heading', { name: /Command Center/ })).toBeVisible()
    await expect(page).toHaveURL(/\/command$/)
  })

  for (const path of ['/projects', '/approvals', '/settings', '/command']) {
    test(`legacy deep link ${path} still works (opens in a window)`, async ({ page }) => {
      await page.goto(path)
      const win = page.locator(`[data-window-kind="legacy_route"]`)
      await expect(win).toBeVisible()
      await expect(win.locator(`[data-legacy-route="${path}"]`)).toBeAttached()
      await expect(page).toHaveURL(new RegExp(`${path}$`))
    })
  }

  test('mobile: windows become full-screen sheets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await freshHome(page)
    await expect(page.getByTestId('os-nav-panel')).toHaveCount(0)
    await ask(page, 'Chart revenue by region')
    const win = page.locator('[data-window-kind="surface"]')
    await expect(win).toBeVisible()
    const box = await win.boundingBox()
    expect(box!.width).toBeGreaterThan(370)
  })
})
