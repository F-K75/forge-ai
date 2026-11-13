import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { LiveQaSurface } from "./LiveQaSurface";
import { LivePreviewSurface } from "./LivePreviewSurface";
import { LiveDeploySurface } from "./LiveDeploySurface";

const { mockDeployments } = vi.hoisted(() => ({
  mockDeployments: { list: vi.fn(), create: vi.fn() },
}));
vi.mock("../../../lib/api", () => ({ deploymentsApi: mockDeployments }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => cleanup());

describe("LiveQaSurface", () => {
  it("asks for a build when there is none", () => {
    render(
      <LiveQaSurface buildStatus="idle" hasBuild={false} validation={null} debugIterations={0} debugErrors={[]} />
    );
    expect(screen.getByText(/no qa results yet/i)).toBeInTheDocument();
  });

  it("says the build failed before QA instead of showing fake results", () => {
    render(
      <LiveQaSurface buildStatus="failed" hasBuild validation={null} debugIterations={0} debugErrors={[]} />
    );
    expect(screen.getByText(/build failed before qa ran/i)).toBeInTheDocument();
  });

  it("renders the PM agent's real score, issues and missing features", () => {
    render(
      <LiveQaSurface
        buildStatus="complete"
        hasBuild
        validation={{
          passed: false,
          score: 62,
          missing_features: ["Password reset"],
          issues: [{ severity: "high", file: "src/api/auth.ts", description: "Token never expires", suggestion: "Add exp claim" }],
          summary: "Core flows work but auth is incomplete.",
        }}
        debugIterations={2}
        debugErrors={[]}
      />
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Score 62")).toBeInTheDocument();
    expect(screen.getByText("Password reset")).toBeInTheDocument();
    expect(screen.getByText("Token never expires")).toBeInTheDocument();
    expect(screen.getByText("src/api/auth.ts")).toBeInTheDocument();
    expect(screen.getByText(/2 debug passes/i)).toBeInTheDocument();
  });
});

describe("LivePreviewSurface", () => {
  it("explains there is nothing to preview for a backend-only build", async () => {
    render(
      <LivePreviewSurface files={{ "app/main.py": "print('hi')" }} hasBuild buildInProgress={false} />
    );
    expect(await screen.findByText(/no browser entry point/i)).toBeInTheDocument();
  });

  it("renders a plain index.html build in a sandboxed iframe", async () => {
    render(
      <LivePreviewSurface files={{ "index.html": "<h1>Hello</h1>" }} hasBuild buildInProgress={false} />
    );
    const frame = await screen.findByTitle("Build preview");
    expect(frame.getAttribute("srcdoc")).toBe("<h1>Hello</h1>");
    // Never same-origin: generated code must not reach the app's cookies.
    expect(frame.getAttribute("sandbox")).not.toMatch(/allow-same-origin/);
  });
});

describe("LiveDeploySurface", () => {
  beforeEach(() => {
    mockDeployments.list.mockReset();
    mockDeployments.create.mockReset();
  });

  it("disables deploy until the latest build is complete", async () => {
    mockDeployments.list.mockResolvedValue({ deployments: [] });
    render(<LiveDeploySurface projectId="p1" buildId="b1" buildStatus="failed" />);
    expect(await screen.findByText(/hasn't been deployed yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deploy build/i })).toBeDisabled();
  });

  it("shows the backend's reason when deployments are disabled", async () => {
    mockDeployments.list.mockResolvedValue({ deployments: [] });
    mockDeployments.create.mockRejectedValue({
      response: { status: 503, data: { detail: "Deployments are not enabled on this instance." } },
    });
    render(<LiveDeploySurface projectId="p1" buildId="b1" buildStatus="complete" />);
    const button = await screen.findByRole("button", { name: /deploy build/i });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByText("Deployments are not enabled on this instance.")).toBeInTheDocument()
    );
    expect(mockDeployments.create).toHaveBeenCalledWith({ build_id: "b1", project_id: "p1" });
  });

  it("lists real deployments with their live URL", async () => {
    mockDeployments.list.mockResolvedValue({
      deployments: [{ id: "d1", status: "live", url: "https://app.example.test", build_id: "b1234567xyz", created_at: "2026-11-13T08:00:00" }],
    });
    render(<LiveDeploySurface projectId="p1" buildId="b1" buildStatus="complete" />);
    expect(await screen.findByText("https://app.example.test")).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument();
  });
});
