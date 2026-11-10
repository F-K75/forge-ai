import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { usePMStore } from "../../store/pmStore";
import IntegrationsTab from "./IntegrationsTab";
import type { PMInitiative } from "../../lib/types/api";

const mockInitiative: PMInitiative = {
  id: "init-test-integrations",
  user_id: "user-1",
  name: "Distributed Event Mesh",
  status: "active",
  version: 1,
  vision: "High-throughput real-time event distribution fabric.",
  estimated_timeline: "3 Sprints",
};

describe("IntegrationsTab Component (Redesigned)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    usePMStore.setState({
      initiative: mockInitiative,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders executive telemetry metrics and live sync engine header", () => {
    render(<IntegrationsTab />);

    expect(screen.getByText("Integrations & Ecosystem Orchestration")).toBeDefined();
    expect(screen.getByText("Live Sync Engine")).toBeDefined();

    // Check metric headers
    expect(screen.getByText("Connected Connectors")).toBeDefined();
    expect(screen.getByText("Sync Health")).toBeDefined();
    expect(screen.getByText("Agent PR Pipeline")).toBeDefined();
    expect(screen.getByText("API Quota Safety")).toBeDefined();
  });

  it("renders integration cards from the catalog", () => {
    render(<IntegrationsTab />);

    expect(screen.getByRole("heading", { name: "GitHub" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Slack" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Linear" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Jira Software" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Datadog" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Sentry" })).toBeDefined();
  });

  it("filters integrations by category tabs", async () => {
    render(<IntegrationsTab />);

    // Click on ChatOps category
    const chatOpsTab = screen.getByRole("button", { name: "ChatOps" });
    fireEvent.click(chatOpsTab);

    // Slack and Discord should be visible
    expect(screen.getByRole("heading", { name: "Slack" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Discord" })).toBeDefined();

    // GitHub should be filtered out
    expect(screen.queryByRole("heading", { name: "GitHub" })).toBeNull();
  });

  it("filters integrations by search query", async () => {
    render(<IntegrationsTab />);

    const searchInput = screen.getByPlaceholderText(
      "Search by provider, capability, or repository..."
    );
    fireEvent.change(searchInput, { target: { value: "Linear" } });

    expect(screen.getByRole("heading", { name: "Linear" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "GitHub" })).toBeNull();
  });

  it("opens the configuration drawer and tests connectivity probe", async () => {
    render(<IntegrationsTab />);

    // Find the Connect button for Linear
    const linearCard = screen.getByRole("heading", { name: "Linear" }).closest("article");
    expect(linearCard).toBeDefined();

    const connectButton = linearCard!.querySelector("button")!;
    fireEvent.click(connectButton);

    // Drawer should open
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Configure Linear")).toBeDefined();
    expect(screen.getByText("Connectivity Probe")).toBeDefined();

    // Click test connection
    const testBtn = screen.getByRole("button", { name: "Test Connection" });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/Connection verified: 200 OK/i)).toBeDefined();
    });
  });

  it("opens custom webhooks modal and displays payload endpoints", () => {
    render(<IntegrationsTab />);

    const webhooksBtn = screen.getByRole("button", { name: /Webhooks/i });
    fireEvent.click(webhooksBtn);

    // Modal should open
    expect(screen.getByText("Initiative Webhook Endpoint")).toBeDefined();
    expect(screen.getByText("HMAC SHA-256 Signing Secret")).toBeDefined();
    expect(screen.getByText("Inbound Payload URL")).toBeDefined();
    expect(screen.getByText("agent.execution.completed")).toBeDefined();
  });

  it("does not expose a shared hardcoded signing secret in the webhooks modal", () => {
    const { container } = render(<IntegrationsTab />);
    fireEvent.click(screen.getByRole("button", { name: /Webhooks/i }));

    // No secret value anywhere in the rendered modal (text or input values),
    // and nothing offering to copy one.
    expect(container.innerHTML).not.toMatch(/whsec_/);
    const inputs = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    expect(inputs.some((i) => i.type === "password" || /whsec_/.test(i.value))).toBe(false);
    expect(screen.queryByText("Signing secret copied")).toBeNull();
    expect(screen.getByText(/shown once when you create it/i)).toBeDefined();
  });
});
