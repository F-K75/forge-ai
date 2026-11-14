import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReviewsListPage from "./ReviewsListPage";

describe("ReviewsListPage - Demo Mode (LIVE_MODE=false)", () => {
  afterEach(() => {
    cleanup();
  });

  it("displays sample reviews when in demo mode", async () => {
    render(
      <MemoryRouter>
        <ReviewsListPage />
      </MemoryRouter>
    );

    // Verify sample review from SAMPLE_REVIEWS is rendered
    expect(
      await screen.findByText(/ID: run-forge-core-9a/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/ID: run-realtime-ws-8f/i)).toBeInTheDocument();
    expect(screen.getByText(/Production GO/i)).toBeInTheDocument();
  });
});
