import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import CommandCenterPage from "./CommandCenterPage";

// Lets a test replace the fleet hook's result (e.g. to force the error state).
const fleetOverride = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("../hooks/useFleetOverview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useFleetOverview")>();
  return {
    ...actual,
    useFleetOverview: () => fleetOverride.value ?? actual.useFleetOverview(),
  };
});

const RUN_TITLE = "SAML single sign-on for the admin console";
import { useAuthStore } from "../store/authStore";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

describe("CommandCenterPage (demo mode)", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: "u1", email: "maya@forge.ai", name: "Maya Sharma" } as never });
  });
  afterEach(() => cleanup());

  const renderPage = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/command"]}>
          <Routes>
            <Route path="/command" element={<CommandCenterPage />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

  it("greets the user by first name and summarises the fleet", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening), Maya\.$/);
    expect(await screen.findByText(/4 runs in flight across 3 projects/)).toBeInTheDocument();
  });

  it("renders the five stat tiles", async () => {
    renderPage();
    await screen.findByText(RUN_TITLE);
    const metrics = await screen.findByRole("region", { name: "Fleet metrics" });
    for (const label of ["Active runs", "Agents working", "Pending approvals", "Spend today", "Skills invoked (24h)"]) {
      expect(within(metrics).getByText(label)).toBeInTheDocument();
    }
    expect(within(metrics).getByText("$8.17")).toBeInTheDocument();
  });

  it("lists active runs with progress, meta and status, linking to the project run", async () => {
    renderPage();
    await screen.findByText(RUN_TITLE);
    const list = screen.getByRole("region", { name: "Active runs" });
    const link = within(list).getByRole("link", { name: /SAML single sign-on/ });
    expect(link).toHaveAttribute("href", "/p/demo-project/agents?run=run-7f3a");
    expect(within(link).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "72");
    expect(link).toHaveTextContent("18 tasks · 5 agents");
    expect(link).toHaveTextContent("Awaiting approval");
  });

  it("filters runs by status with the segmented control", async () => {
    renderPage();
    await screen.findByText(RUN_TITLE);
    const list = screen.getByRole("region", { name: "Active runs" });
    fireEvent.click(within(list).getByRole("radio", { name: /Planning/ }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("Walk-forward optimisation mode")).toBeInTheDocument();
  });

  it("approves a gate from Needs you and updates the count", async () => {
    renderPage();
    await screen.findByText(RUN_TITLE);
    const needs = screen.getByRole("region", { name: /Needs you/ });
    expect(within(needs).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(within(needs).getByRole("button", { name: /Approve Delivery approval/ }));
    await waitFor(() => expect(within(needs).getAllByRole("listitem")).toHaveLength(1));
    expect(await screen.findByText(/approved delivery approval/)).toBeInTheDocument();
  });

  it("shows recent activity and the model gateway split", async () => {
    renderPage();
    await screen.findByText(RUN_TITLE);
    expect(screen.getByRole("region", { name: "Recent activity" })).toHaveTextContent("QA Engineer");
    const gw = screen.getByRole("region", { name: "Model gateway" });
    expect(within(gw).getByRole("img", { name: /38% of model calls served locally/ })).toBeInTheDocument();
    expect(gw).toHaveTextContent("half-open");
  });

  it("routes the quick launcher prompt into New Build", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Describe what to build"), { target: { value: "A CRM for dentists" } });
    fireEvent.click(screen.getByRole("button", { name: "Start build" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/launch?prompt=A%20CRM%20for%20dentists");
  });

  it("has no axe violations", async () => {
    const { container } = renderPage();
    await screen.findByText(RUN_TITLE);
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});

describe("CommandCenterPage error state", () => {
  afterEach(() => {
    cleanup();
    fleetOverride.value = null;
  });

  it("shows a retryable error when the fleet can't be loaded", async () => {
    const refetch = vi.fn();
    fleetOverride.value = { data: undefined, isLoading: false, isError: true, isFetching: false, refetch };
    const Page = CommandCenterPage;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t load your fleet");
    fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(refetch).toHaveBeenCalled();
  });
});
