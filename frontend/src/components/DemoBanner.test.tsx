import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const env = { LIVE_MODE: false, PUBLIC_DEMO_APP_URL: "" };
vi.mock("../lib/env", () => ({
  get LIVE_MODE() {
    return env.LIVE_MODE;
  },
  get PUBLIC_DEMO_APP_URL() {
    return env.PUBLIC_DEMO_APP_URL;
  },
}));

import { DemoBanner } from "./DemoBanner";

describe("DemoBanner", () => {
  afterEach(() => {
    cleanup();
    env.LIVE_MODE = false;
    env.PUBLIC_DEMO_APP_URL = "";
  });

  it("labels sample data in demo mode", () => {
    render(<DemoBanner />);
    expect(screen.getByRole("status").textContent).toMatch(/Demo with sample data: nothing here is real/);
  });

  it("links to the real app's sign-up on the public demo", () => {
    env.PUBLIC_DEMO_APP_URL = "https://app.example.dev";
    render(<DemoBanner />);
    const link = screen.getByRole("link", { name: /Sign up free/ });
    expect(link.getAttribute("href")).toBe("https://app.example.dev/signup");
  });

  it("has no sign-up link when there's no real app to send people to", () => {
    render(<DemoBanner />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing in the live app", () => {
    env.LIVE_MODE = true;
    const { container } = render(<DemoBanner />);
    expect(container.innerHTML).toBe("");
  });
});
