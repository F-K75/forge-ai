import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// Live mode: talk to the (mocked) backend API rather than demo localStorage.
vi.mock("../../lib/env", () => ({ LIVE_MODE: true }));

const list = vi.fn();
const create = vi.fn();
vi.mock("../../lib/api", () => ({
  authApi: { updateProfile: vi.fn() },
  webhooksApi: {
    list: (...a: unknown[]) => list(...a),
    create: (...a: unknown[]) => create(...a),
    delete: vi.fn(),
  },
}));

import { IntegrationsTab } from "./IntegrationsTab";

const SERVER_SECRET = "server-generated-test-value-0123456789abcdefghij";

const stored = {
  id: "wh_1",
  url: "https://hooks.example.com/forge",
  events: ["build.completed"],
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  last_triggered: null,
};

describe("Settings IntegrationsTab webhook signing secrets", () => {
  beforeEach(() => {
    list.mockReset();
    create.mockReset();
  });

  afterEach(() => cleanup());

  it("shows the secret returned at creation once, and not after dismissal", async () => {
    list.mockResolvedValueOnce([]).mockResolvedValue([stored]); // list never carries a secret
    create.mockResolvedValue({ ...stored, secret: SERVER_SECRET });

    render(<IntegrationsTab />);
    await waitFor(() => expect(screen.getByText("No webhooks registered")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: /Add Webhook/i }));
    fireEvent.change(screen.getByPlaceholderText(/api\.yourdomain\.com/i), {
      target: { value: stored.url },
    });
    fireEvent.submit(screen.getByPlaceholderText(/api\.yourdomain\.com/i).closest("form")!);

    await waitFor(() => expect(screen.getByTestId("revealed-webhook-secret").textContent).toBe(SERVER_SECRET));
    expect(screen.getByText(/won't be shown again/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("revealed-webhook-secret")).toBeNull();
    expect(document.body.innerHTML).not.toContain(SERVER_SECRET);
  });

  it("does not fall back to demo webhooks (with fake secrets) when the live API fails", async () => {
    list.mockRejectedValue(new Error("network down"));

    render(<IntegrationsTab />);
    await waitFor(() => expect(screen.getByText("No webhooks registered")).toBeDefined());
    expect(document.body.innerHTML).not.toMatch(/whsec_/);
    expect(screen.queryByText(/forge-production/)).toBeNull();
  });
});
