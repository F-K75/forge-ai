import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { vi } from "vitest";

// Demo mode (no backend): the tab renders DEMO_WEBHOOKS from the fixture.
vi.mock("../../lib/env", () => ({ LIVE_MODE: false }));

import { IntegrationsTab } from "./IntegrationsTab";

describe("Settings IntegrationsTab demo fixture", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("still renders the demo webhook, with a visibly fake placeholder secret", async () => {
    render(<IntegrationsTab />);

    await waitFor(() =>
      expect(screen.getByText("https://api.example.com/webhooks/forge-production")).toBeDefined()
    );
    // The list masks secrets after 10 chars; the visible prefix is the
    // placeholder marker, not anything resembling a real key.
    expect(screen.getByText(/whsec_demo/)).toBeDefined();
    expect(document.body.innerHTML).not.toMatch(/whsec_[0-9a-f]{12,}/);
  });
});
