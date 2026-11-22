import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// Browser specs against the production bundle (`vite build`) with the backend
// mocked by route interception (tests/mocked/mockBackend.ts): no API, database
// or WebSocket server is needed. The bundle is built in live mode, pointing
// its API and WebSocket at paths on the preview origin that the specs
// intercept.
//
//   npm run test:e2e:mocked
//
// If the installed @playwright/test can't find its own Chromium build, point
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH at an installed Chromium/headless shell.
const PORT = Number(process.env.FORGE_E2E_PORT || 4173)
const ORIGIN = `http://127.0.0.1:${PORT}`

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
)

export default defineConfig({
  ...base,
  testDir: './tests/mocked',
  testIgnore: undefined,
  timeout: 60_000,
  reporter: 'list',
  use: {
    ...base.use,
    baseURL: ORIGIN,
    trace: 'off',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    // Always rebuild: a server left running from another build would test stale code.
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      ...inheritedEnv,
      VITE_API_URL: `${ORIGIN}/api-mock`,
      VITE_WS_URL: `ws://127.0.0.1:${PORT}/ws-mock`,
    },
  },
})
