/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Tests must be hermetic: never read the developer's .env.local (it may
  // point at a live tunnel or backend). envDir points at a directory with no
  // .env files so import.meta.env.VITE_* stays unset (LIVE_MODE stays off,
  // WS_URL falls back to localhost), and test.env pins process.env for the
  // few values tests depend on.
  envDir: './src/test',
  test: {
    // jsdom so component tests (React Testing Library) have a DOM, and it
    // also works fine for the store/api unit tests.
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    env: {
      VITE_API_URL: 'http://localhost:8000',
      VITE_WS_URL: '',
      VITE_LIVE_MODE: 'false',
    },
  },
})