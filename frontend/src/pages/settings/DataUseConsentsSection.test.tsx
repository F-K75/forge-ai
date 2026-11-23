import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

vi.mock("../../lib/env", () => ({ LIVE_MODE: true }));

const getConsents = vi.fn();
const grant = vi.fn();
const revoke = vi.fn();
vi.mock("../../lib/qualityReview", () => ({
  dataUseConsentsApi: {
    get: (...a: unknown[]) => getConsents(...a),
    grant: (...a: unknown[]) => grant(...a),
    revoke: (...a: unknown[]) => revoke(...a),
  },
}));

const toastError = vi.fn();
vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) } }));

import { DataUseConsentsSection } from "./DataUseConsentsSection";

function state(overrides: Record<string, unknown> = {}) {
  return {
    policy_version: "2026-11",
    policy_versions: { ai_quality_review: "ai-v1", human_quality_review: "human-v1" },
    grantable: { ai_quality_review: true, human_quality_review: false },
    active: ["platform_model_processing"],
    byok_auto_retry_max: 0,
    quality_review: { is_internal: false, external_adjudication_available: false },
    consents: [],
    ...overrides,
  };
}

const aiToggle = () => screen.getByLabelText(/AI quality review/i) as HTMLInputElement;
const humanToggle = () => screen.getByLabelText(/Human quality review/i) as HTMLInputElement;

describe("DataUseConsentsSection", () => {
  beforeEach(() => {
    getConsents.mockReset();
    grant.mockReset();
    revoke.mockReset();
    toastError.mockReset();
  });

  afterEach(() => cleanup());

  it("shows human review as unavailable while external adjudication is off", async () => {
    getConsents.mockResolvedValue(state());
    render(<DataUseConsentsSection />);
    await waitFor(() => expect(aiToggle().disabled).toBe(false));
    expect(humanToggle().disabled).toBe(true);
    expect(humanToggle().checked).toBe(false);
    expect(screen.getByText(/Not available yet/i)).toBeInTheDocument();
    expect(document.getElementById("consent-status-platform-model-processing")).toHaveTextContent("Allowed");
    expect(document.getElementById("consent-status-byok-auto-retry")).toHaveTextContent("Off");
  });

  it("grants AI quality review against the scope's policy version", async () => {
    getConsents
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(state({ active: ["platform_model_processing", "ai_quality_review"] }));
    grant.mockResolvedValue({ granted: true });
    render(<DataUseConsentsSection />);
    await waitFor(() => expect(aiToggle().disabled).toBe(false));
    fireEvent.click(aiToggle());
    await waitFor(() => expect(grant).toHaveBeenCalledWith("ai_quality_review", "ai-v1"));
    await waitFor(() => expect(aiToggle().checked).toBe(true));
  });

  it("enables human review when available, and reverts a failed save", async () => {
    getConsents.mockResolvedValue(
      state({ quality_review: { is_internal: false, external_adjudication_available: true } }),
    );
    grant.mockRejectedValue({ response: { data: { detail: "cannot be granted" } } });
    render(<DataUseConsentsSection />);
    await waitFor(() => expect(humanToggle().disabled).toBe(false));
    expect(screen.queryByText(/Not available yet/i)).toBeNull();
    fireEvent.click(humanToggle());
    await waitFor(() => expect(grant).toHaveBeenCalledWith("human_quality_review", "human-v1"));
    await waitFor(() => expect(humanToggle().checked).toBe(false));
    expect(toastError).toHaveBeenCalledWith("cannot be granted");
  });

  it("revokes AI quality review", async () => {
    getConsents
      .mockResolvedValueOnce(state({ active: ["ai_quality_review"] }))
      .mockResolvedValueOnce(state({ active: [] }));
    revoke.mockResolvedValue({ revoked: true });
    render(<DataUseConsentsSection />);
    await waitFor(() => expect(aiToggle().checked).toBe(true));
    fireEvent.click(aiToggle());
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("ai_quality_review"));
    await waitFor(() => expect(aiToggle().checked).toBe(false));
  });
});
