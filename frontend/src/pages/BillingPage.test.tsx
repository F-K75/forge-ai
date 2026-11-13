import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/env", () => ({ LIVE_MODE: true }));

const checkout = vi.fn();
const plans = vi.fn();
vi.mock("../lib/api", () => ({
  billingApi: {
    plans: (...a: unknown[]) => plans(...a),
    usage: () => Promise.resolve({ credits_used: 0, credits_remaining: 10 }),
    subscription: () => Promise.resolve(null),
    provider: () => Promise.resolve({ provider: "stripe" }),
    invoices: () => Promise.resolve([]),
    checkout: (...a: unknown[]) => checkout(...a),
    downgrade: vi.fn(),
    cancel: vi.fn(),
    reactivate: vi.fn(),
    portal: vi.fn(),
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("react-hot-toast", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  }),
  default: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  }),
}));

import BillingPage from "./BillingPage";

// Mirrors GET /billing/plans after this change (backend/api/billing.py).
const SERVER_PLANS = [
  { tier: "free", name: "Free", price_id: "price_free", price_monthly: 0, price_annual: 0, credits: 10, max_projects: 1, custom_pricing: false, features: ["10 credits at signup", "First build free", "1 project", "Community support"] },
  { tier: "standard", name: "Standard", price_id: "s", price_monthly: 20, price_annual: 200, credits: 100, max_projects: -1, custom_pricing: false, features: ["100 credits/month", "Unlimited projects", "All agents", "Email support"] },
  { tier: "pro", name: "Pro", price_id: "p", price_monthly: 50, price_annual: 500, credits: 750, max_projects: -1, custom_pricing: false, features: ["750 credits/month", "Unlimited projects", "All agents", "Bring your own LLM key (BYOK)", "Priority support"] },
  { tier: "enterprise", name: "Enterprise", price_id: "e", price_monthly: 0, price_annual: 0, credits: 5000, max_projects: -1, custom_pricing: true, features: ["Custom pricing and credit volume", "Unlimited projects", "All agents", "Bring your own LLM key (BYOK)", "Dedicated support"] },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <BillingPage />
    </MemoryRouter>,
  );

const card = (tier: string) => document.getElementById(`plan-card-${tier}`) as HTMLElement;

describe("BillingPage plans", () => {
  beforeEach(() => {
    checkout.mockReset();
    plans.mockReset().mockResolvedValue(SERVER_PLANS);
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  afterEach(() => cleanup());

  it("shows the published prices and credits", async () => {
    renderPage();
    await waitFor(() => expect(within(card("pro")).getByText("$50")).toBeDefined());
    expect(within(card("standard")).getByText("$20")).toBeDefined();
    expect(within(card("pro")).getByText("750 CR / MO")).toBeDefined();
    expect(within(card("free")).getByText("10 CR AT SIGNUP")).toBeDefined();
  });

  it("shows Enterprise as custom with a contact link instead of checkout", async () => {
    renderPage();
    await waitFor(() => expect(within(card("enterprise")).getByText("Custom")).toBeDefined());
    expect(within(card("enterprise")).queryByText(/\$\d/)).toBeNull();
    const contact = within(card("enterprise")).getByText("Contact us");
    expect(contact.tagName).toBe("A");
    expect(contact.getAttribute("href")).toBe("/settings#support");
    // No checkout button for a custom-priced plan.
    expect(within(card("enterprise")).queryByRole("button")).toBeNull();
  });

  it("reports a failed checkout as an error, never as success", async () => {
    checkout.mockRejectedValue(new Error("network"));
    renderPage();
    await waitFor(() => expect(within(card("pro")).getByText("$50")).toBeDefined());

    fireEvent.click(document.getElementById("btn-select-plan-pro")!);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
