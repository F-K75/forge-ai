// Vitest exposes its own `expect`; `@testing-library/jest-dom` must be loaded
// via the `/vitest` entry so its matchers register against Vitest's expect
// (the bare import calls `expect.extend` before expect exists and crashes the
// whole suite with "ReferenceError: expect is not defined").
import '@testing-library/jest-dom/vitest'
