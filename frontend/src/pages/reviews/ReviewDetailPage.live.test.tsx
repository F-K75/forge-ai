import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ReviewDetailPage from "./ReviewDetailPage";
import { reviewsApi } from "../../lib/orchestratorApi";

vi.mock("../../lib/env", () => ({ LIVE_MODE: true }));

describe("ReviewDetailPage - Live Mode Unconfigured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("displays Review Board service not configured state and does not call reviewsApi", async () => {
    const getSpy = vi.spyOn(reviewsApi, "get");
    const backlogSpy = vi.spyOn(reviewsApi, "backlog");

    render(
      <MemoryRouter initialEntries={["/reviews/run-forge-core-9a"]}>
        <Routes>
          <Route path="/reviews/:runId" element={<ReviewDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("heading", { name: /Review Board service not configured/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/missing VITE_ORCHESTRATOR_URL/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Back to reviews/i })
    ).toBeInTheDocument();

    expect(getSpy).not.toHaveBeenCalled();
    expect(backlogSpy).not.toHaveBeenCalled();
  });
});
