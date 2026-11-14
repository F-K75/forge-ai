import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReviewsListPage from "./ReviewsListPage";
import { reviewsApi } from "../../lib/orchestratorApi";
import toast from "react-hot-toast";

vi.mock("../../lib/env", () => ({ LIVE_MODE: true }));

vi.mock("react-hot-toast", () => {
  const t = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "t"),
  });
  return { default: t, toast: t };
});

describe("ReviewsListPage - Live Mode Unconfigured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Review Board service not configured state and does not call list API", async () => {
    const listSpy = vi.spyOn(reviewsApi, "list");

    render(
      <MemoryRouter>
        <ReviewsListPage />
      </MemoryRouter>
    );

    // Assert empty state heading and microcopy
    expect(
      await screen.findByRole("heading", { name: /Review Board service not configured/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Autonomous multi-agent code reviews, architectural analyses, and security gate audits belong here/i)
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/VITE_ORCHESTRATOR_URL/i).length
    ).toBeGreaterThanOrEqual(1);

    // Initiator service notice
    expect(
      screen.getByText(/Review Board orchestrator is not connected/i)
    ).toBeInTheDocument();

    // Verify reviewsApi.list was not called
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("prevents starting an audit and shows guidance when unconfigured in live mode", async () => {
    const createSpy = vi.spyOn(reviewsApi, "create");

    render(
      <MemoryRouter>
        <ReviewsListPage />
      </MemoryRouter>
    );

    const startBtn = screen.getByRole("button", { name: /Start Review/i });
    fireEvent.click(startBtn);

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/Review Board service is not configured/i)
    );
    expect(createSpy).not.toHaveBeenCalled();
  });
});
