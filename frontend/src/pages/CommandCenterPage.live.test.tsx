/**
 * LIVE_MODE Command Center: stat-tile deltas and the activity feed come from
 * `GET /v1/command-center/summary`. axios is mocked at the transport boundary,
 * so the real `projectsApi` / `kernelApi` / `commandCenterApi` helpers, URLs
 * and params are exercised.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CommandCenterSummary } from "../lib/commandCenterApi";

vi.mock("../lib/env", () => ({ LIVE_MODE: true, PUBLIC_DEMO_APP_URL: "", IS_PUBLIC_DEMO: false }));

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  defaults: { baseURL: "http://localhost:8000", headers: { common: {} } },
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));
vi.mock("axios", () => {
  const axiosMock = { create: () => http, isAxiosError: () => false, ...http };
  return { default: axiosMock, ...axiosMock };
});

import CommandCenterPage from "./CommandCenterPage";
import { useAuthStore } from "../store/authStore";

const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

function summary(overrides: Partial<CommandCenterSummary["stats"]> = {}): CommandCenterSummary {
  return {
    window: "24h",
    generated_at: ago(0),
    scope: { project_count: 1, projects_truncated: false, max_projects: 50, history_truncated: false },
    stats: {
      active_runs: { current: 3, previous: 1, delta: 2, compared_to: "same_time_yesterday", unavailable_reason: null },
      agents_working: { current: 4, previous: 4, delta: 0, compared_to: "1h_ago", unavailable_reason: null },
      pending_approvals: { current: 1, previous: null, delta: null, compared_to: null, unavailable_reason: "not_compared" },
      spend_today: {
        current_usd: 4.5,
        previous_usd: 6,
        delta_pct: -25,
        compared_to: "yesterday_same_time",
        unavailable_reason: null,
        daily_budget_usd: 20,
        active_run_caps_usd: 7.5,
      },
      skills_invoked: { current: 9, previous: null, delta: null, compared_to: "prior_24h", unavailable_reason: "history_truncated" },
      ...overrides,
    },
    activity: [
      {
        id: "r1:g1:decided",
        kind: "gate_approved",
        at: ago(3),
        project_id: "p1",
        project_name: "Alpha",
        run_id: "r1",
        title: "Schema migration",
        actor: "lead@forge.test",
      },
      {
        id: "d1:live",
        kind: "deploy_live",
        at: ago(12),
        project_id: "p1",
        project_name: "Alpha",
        run_id: null,
        deployment_id: "d1",
        title: "https://alpha.example",
        actor: null,
      },
    ],
  };
}

function routeGets(summaryResponse: CommandCenterSummary | Error) {
  http.get.mockImplementation((url: string) => {
    if (url === "/projects/") {
      return Promise.resolve({ data: { projects: [{ id: "p1", name: "Alpha", created_at: ago(600) }] } });
    }
    if (url === "/v1/projects/p1/kernel/runs") return Promise.resolve({ data: { runs: [] } });
    if (url === "/api/llm/health") return Promise.reject(new Error("forbidden"));
    if (url === "/v1/command-center/summary") {
      return summaryResponse instanceof Error
        ? Promise.reject(summaryResponse)
        : Promise.resolve({ data: summaryResponse });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/command"]}>
        <CommandCenterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

function tile(metrics: HTMLElement, label: string): HTMLElement {
  return within(metrics).getByText(label).closest("div.rounded-xl") as HTMLElement;
}

describe("CommandCenterPage (live mode)", () => {
  beforeEach(() => {
    http.get.mockReset();
    useAuthStore.setState({ user: { id: "u1", email: "maya@forge.ai", name: "Maya Sharma" } as never });
  });
  afterEach(() => cleanup());

  it("requests the 24h summary and renders real deltas", async () => {
    routeGets(summary());
    renderPage();
    const metrics = await screen.findByRole("region", { name: "Fleet metrics" });
    await within(metrics).findByText("$4.50");

    expect(http.get).toHaveBeenCalledWith("/v1/command-center/summary", { params: { window: "24h" } });

    const active = tile(metrics, "Active runs");
    expect(active).toHaveTextContent("3");
    expect(active).toHaveTextContent("+2");
    expect(active).toHaveTextContent("vs yesterday");

    // A real zero comparison is shown as "0", flat.
    const agents = tile(metrics, "Agents working");
    expect(agents).toHaveTextContent("0vs 1h ago");

    const spend = tile(metrics, "Spend today");
    expect(spend).toHaveTextContent("/ $20");
    expect(spend).toHaveTextContent("25%");
    expect(spend).toHaveTextContent("vs yesterday");
  });

  it("shows no delta at all for a null comparison", async () => {
    routeGets(
      summary({
        active_runs: { current: 2, previous: null, delta: null, compared_to: "same_time_yesterday", unavailable_reason: "history_truncated" },
      }),
    );
    renderPage();
    const metrics = await screen.findByRole("region", { name: "Fleet metrics" });
    await within(metrics).findByText("$4.50");

    const active = tile(metrics, "Active runs");
    expect(active).not.toHaveTextContent("vs yesterday");
    expect(active).not.toHaveTextContent(/[+−]\d/);
    expect(active.textContent).toBe("Active runs2");

    const skills = tile(metrics, "Skills invoked (24h)");
    expect(skills.textContent).toBe("Skills invoked (24h)9");
  });

  it("renders the summary's activity feed, including deploys", async () => {
    routeGets(summary());
    renderPage();
    const feed = await screen.findByRole("region", { name: "Recent activity" });
    await within(feed).findByText(/approved Schema migration/);
    const items = within(feed).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("lead@forge.test approved Schema migration");
    expect(within(items[0]).getByRole("link")).toHaveAttribute("href", "/p/p1/agents?run=r1");
    expect(items[1]).toHaveTextContent("Deploy went live at https://alpha.example");
  });

  it("falls back to run-derived tiles without deltas when the summary fails", async () => {
    routeGets(new Error("boom"));
    renderPage();
    const metrics = await screen.findByRole("region", { name: "Fleet metrics" });
    await within(metrics).findByText("$0.00");
    for (const label of ["Active runs", "Agents working", "Skills invoked (24h)"]) {
      expect(tile(metrics, label)).not.toHaveTextContent(/vs /);
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
