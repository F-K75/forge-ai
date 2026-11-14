import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ReviewDetailPage from "./ReviewDetailPage";
import { reviewsApi } from "../../lib/orchestratorApi";

describe("ReviewDetailPage - Demo Mode (LIVE_MODE=false)", () => {
  afterEach(() => {
    cleanup();
  });

  it("loads and displays sample review details and backlog without calling API", async () => {
    const getSpy = vi.spyOn(reviewsApi, "get");
    const backlogSpy = vi.spyOn(reviewsApi, "backlog");

    render(
      <MemoryRouter initialEntries={["/reviews/run-forge-core-9a"]}>
        <Routes>
          <Route path="/reviews/:runId" element={<ReviewDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify header repo path from sample review
    expect(await screen.findByText(/\/workspaces\/forge-ai/i)).toBeInTheDocument();
    expect(screen.getByText(/run-forge-core-9a/i)).toBeInTheDocument();

    // Verify recommendation badge and score
    expect(screen.getByText(/GO/i)).toBeInTheDocument();
    expect(screen.getByText(/Prioritized Remediation Backlog/i)).toBeInTheDocument();
    expect(screen.getByText(/Backlog Items/i)).toBeInTheDocument();

    // API should not have been called
    expect(getSpy).not.toHaveBeenCalled();
    expect(backlogSpy).not.toHaveBeenCalled();
  });
});
