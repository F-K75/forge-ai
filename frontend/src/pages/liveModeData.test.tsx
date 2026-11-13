// Live mode (real backend) must never fill gaps with demo/sample data: when a
// request fails or there is nothing yet, pages show an error or empty state.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

vi.mock("../lib/env", () => ({ LIVE_MODE: true }))

const { mocks } = vi.hoisted(() => ({
  mocks: {
    apiKeysList: vi.fn(),
    sessionsList: vi.fn(),
    billing: {
      plans: vi.fn(),
      usage: vi.fn(),
      subscription: vi.fn(),
      provider: vi.fn(),
      invoices: vi.fn(),
    },
    marketplace: { list: vi.fn(), download: vi.fn(), create: vi.fn() },
    reviewsGet: vi.fn(),
    navigate: vi.fn(),
  },
}))

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    apiKeysApi: { list: mocks.apiKeysList, create: vi.fn(), delete: vi.fn() },
    authApi: {
      ...(actual.authApi as object),
      sessions: { list: mocks.sessionsList, revoke: vi.fn(), revokeOthers: vi.fn() },
      updateProfile: vi.fn(),
    },
    billingApi: { ...(actual.billingApi as object), ...mocks.billing },
    marketplaceApi: mocks.marketplace,
  }
})
vi.mock("../lib/orchestratorApi", () => ({
  reviewsApi: { get: mocks.reviewsGet, backlog: vi.fn(), list: vi.fn(), create: vi.fn() },
}))
vi.mock("../hooks/useReviewSocket", () => ({ useReviewSocket: vi.fn() }))
vi.mock("react-hot-toast", () => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") })
  return { default: t, toast: t }
})
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => mocks.navigate }
})
vi.mock("../store/authStore", () => {
  const state = {
    user: { id: "u1", email: "a@b.c", name: "A", plan: "free", credits: 7, mfa_enabled: false, preferences: {} },
    fetchMe: vi.fn(),
    setUser: vi.fn(),
  }
  return { useAuthStore: (sel?: (s: typeof state) => unknown) => (typeof sel === "function" ? sel(state) : state) }
})

import { ApiKeysTab } from "./settings/ApiKeysTab"
import { SecurityTab } from "./settings/SecurityTab"
import { ModelsTab } from "./settings/ModelsTab"
import BillingPage from "./BillingPage"
import MarketplacePage from "./MarketplacePage"
import ReviewDetailPage from "./reviews/ReviewDetailPage"

const fail = () => Promise.reject(new Error("network down"))

beforeEach(() => {
  vi.clearAllMocks()
  Object.values(mocks.billing).forEach((fn) => fn.mockImplementation(fail))
})
afterEach(() => cleanup())

describe("Settings", () => {
  it("API keys: a failed load shows no demo keys", async () => {
    mocks.apiKeysList.mockImplementation(fail)
    render(<ApiKeysTab />)
    await waitFor(() => expect(mocks.apiKeysList).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText("github-actions-production")).not.toBeInTheDocument())
  })

  it("Security: a failed load shows no made-up sessions", async () => {
    mocks.sessionsList.mockImplementation(fail)
    render(<SecurityTab />)
    await waitFor(() => expect(mocks.sessionsList).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText(/192\.168\.1\.42/)).not.toBeInTheDocument())
  })

  it("Models: no fake 'Test Connection' that always succeeds", () => {
    render(<ModelsTab />)
    expect(screen.queryByRole("button", { name: /test connection/i })).not.toBeInTheDocument()
  })
})

describe("Billing", () => {
  it("shows the account's real balance and no sample invoices when the API fails", async () => {
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    )
    // Real balance (7) instead of the demo 612.
    expect(screen.getAllByText(/7 CR/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/612/)).not.toBeInTheDocument()
    // A free account is marked as being on Free, not Pro.
    expect(document.getElementById("btn-select-plan-free")?.textContent).toMatch(/current tier/i)
    expect(document.getElementById("btn-select-plan-pro")?.textContent).not.toMatch(/current tier/i)

    fireEvent.click(document.getElementById("tab-btn-invoices")!)
    expect(await screen.findByText(/no invoices yet/i)).toBeInTheDocument()
    expect(screen.queryByText("INV-2026-0801")).not.toBeInTheDocument()
  })
})

describe("Marketplace", () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <MarketplacePage />
      </MemoryRouter>
    )

  it("lists only official starters, not sample community entries", async () => {
    mocks.marketplace.list.mockResolvedValue([])
    renderPage()
    expect((await screen.findAllByText("Stripe SaaS Subscription Engine")).length).toBeGreaterThan(0)
    expect(screen.queryByText("Realtime Collaborative Canvas")).not.toBeInTheDocument()
  })

  it("installs a built-in starter from its prompt without calling the API", async () => {
    mocks.marketplace.list.mockResolvedValue([])
    renderPage()
    await screen.findAllByText("Stripe SaaS Subscription Engine")
    fireEvent.click(screen.getAllByRole("button", { name: /^deploy/i })[0])
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/build/new", expect.anything()))
    expect(mocks.marketplace.download).not.toHaveBeenCalled()
  })
})

describe("Review detail", () => {
  it("shows an error instead of sample audit data when the review can't be loaded", async () => {
    mocks.reviewsGet.mockRejectedValue({ response: { status: 404 } })
    render(
      <MemoryRouter initialEntries={["/reviews/run-forge-core-9a"]}>
        <Routes>
          <Route path="/reviews/:runId" element={<ReviewDetailPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText(/review unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/doesn't exist/i)).toBeInTheDocument()
  })
})
