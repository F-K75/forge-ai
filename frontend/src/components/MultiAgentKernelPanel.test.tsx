import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MultiAgentKernelPanel } from "./MultiAgentKernelPanel";
import { planObjectiveLocally } from "../lib/kernelApi";

afterEach(cleanup);

describe("MultiAgentKernelPanel", () => {
  it("renders all 9 autonomous engineering departments and initial DAG waves", () => {
    render(<MultiAgentKernelPanel projectId="proj-test" />);

    expect(screen.getByText("Autonomous Engineering Organisation")).toBeInTheDocument();
    expect(screen.getByText("Leadership")).toBeInTheDocument();
    expect(screen.getByText("Business")).toBeInTheDocument();
    expect(screen.getByText("Architecture")).toBeInTheDocument();
    expect(screen.getByText("Design")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Quality")).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.getByText("WAVE 0")).toBeInTheDocument();
  });

  it("plans a new objective into multi-wave parallel tasks", async () => {
    render(<MultiAgentKernelPanel projectId="proj-test" />);

    const textarea = screen.getByLabelText("Engineering Objective");
    fireEvent.change(textarea, {
      target: {
        value:
          "Design architecture, build FastAPI backend and React dashboard, audit security, and release.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Plan DAG Waves/i }));

    await waitFor(() => {
      expect(screen.getByText("WAVE 0")).toBeInTheDocument();
      expect(screen.getByText("WAVE 1")).toBeInTheDocument();
    });
  });

  it("answers Persistent Product Lead queries with citations", async () => {
    render(<MultiAgentKernelPanel projectId="proj-test" />);

    fireEvent.click(screen.getByRole("button", { name: /Ask Why/i }));

    await waitFor(() => {
      expect(screen.getByText(/Architecture and Design/i)).toBeInTheDocument();
    });
  });

  it("browses the 9-domain Skill Engine catalog and runs MCP static security scan", async () => {
    render(<MultiAgentKernelPanel projectId="proj-test" />);

    // Skills tab
    fireEvent.click(screen.getByRole("tab", { name: /Skills/i }));
    expect(screen.getByText("security-threat-audit")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search skills"), { target: { value: "rag" } });
    expect(screen.getByText("rag-context-engineering")).toBeInTheDocument();

    // Protocols tab -> MCP Apps, A2A Agent Card, AI SDK UI Stream, External MCP URL guard, and MCP scan
    fireEvent.click(screen.getByRole("tab", { name: /Protocols/i }));
    expect(screen.getByText(/MCP Governed Tools/i)).toBeInTheDocument();
    expect(screen.getByText("Security Hygiene Inspector")).toBeInTheDocument();
    expect(screen.getByText("a2a/0.2")).toBeInTheDocument();
    expect(screen.getByText(/ai-sdk-ui-stream\/v1/i)).toBeInTheDocument();
    expect(screen.getByText(/x-vercel-ai-ui-message-stream: v1/i)).toBeInTheDocument();

    // Reject non-HTTPS/private external MCP server URL
    fireEvent.change(screen.getByLabelText("External MCP endpoint URL"), {
      target: { value: "http://127.0.0.1:9000/rpc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Register MCP/i }));
    await waitFor(() => {
      expect(screen.getByText(/must use a public https:\/\/ endpoint/i)).toBeInTheDocument();
    });

    // Accept valid HTTPS external MCP server URL
    fireEvent.change(screen.getByLabelText("External MCP endpoint URL"), {
      target: { value: "https://mcp.example.com/rpc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Register MCP/i }));
    await waitFor(() => {
      expect(screen.getByText(/Registered external HTTPS MCP server/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("MCP static security scan snippet"), {
      target: { value: "el.innerHTML = userInput;" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Run MCP Scan/i }));

    await waitFor(() => {
      expect(screen.getByText(/flagged 1 blocking security hygiene pattern/i)).toBeInTheDocument();
    });
  });

  it("pauses at Pre-Delivery Approval Gate, resumes on Approve, and records Blackboard, Repair Cycles, Worktrees & Evals", async () => {
    render(<MultiAgentKernelPanel projectId="proj-test" />);

    fireEvent.click(screen.getByLabelText("Pre-Delivery Approval Gate"));
    fireEvent.click(screen.getByRole("button", { name: /Execute Parallel Waves/i }));

    const approveBtn = await screen.findByRole(
      "button",
      { name: /Approve & Resume/i },
      { timeout: 5000 },
    );
    expect(screen.getByText(/Governance Approval Required/i)).toBeInTheDocument();

    fireEvent.click(approveBtn);

    await waitFor(
      () => {
        expect(screen.getByText("Governance Gate History")).toBeInTheDocument();
        expect(screen.getByText(/Repair Loops \(1\)/i)).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Check Repair Loops tab
    fireEvent.click(screen.getByRole("tab", { name: /Repair Loops \(1\)/i }));
    expect(screen.getByText("resolved")).toBeInTheDocument();

    // Check Worktrees & Evals tab (await final wave completion, lease release & patch reconciliation)
    fireEvent.click(screen.getByRole("tab", { name: /Worktrees & Evals/i }));
    expect(screen.getByText("Run Cost Budget Guard")).toBeInTheDocument();
    expect(screen.getByText(/Isolated Worktree Leases/i)).toBeInTheDocument();
    expect(screen.getByText(/Wave Patch Reconciliations/i)).toBeInTheDocument();
    await waitFor(
      () => {
        expect(screen.getAllByText(/released/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Wave Patch Reconciliations \(1\)/i)).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it("offline: A2UI approval card resolves the local gate, and local surfaces use the typed components", async () => {
    render(<MultiAgentKernelPanel projectId="proj-test" />);

    fireEvent.click(screen.getByLabelText("Pre-Delivery Approval Gate"));
    fireEvent.click(screen.getByRole("button", { name: /Execute Parallel Waves/i }));
    await screen.findByText(/Governance Approval Required/i, undefined, { timeout: 5000 });

    fireEvent.click(screen.getByRole("tab", { name: /Protocols/i }));
    expect(screen.getByText("Agent Activity")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /Tasks completed/i })).toBeInTheDocument();

    // Reject needs confirmation; cancel it, then approve instead.
    fireEvent.click(screen.getByRole("button", { name: /^Reject pre_delivery_approval/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Approve pre_delivery_approval/i }));

    await waitFor(
      () => {
        expect(screen.queryByText(/Governance Approval Required/i)).toBeNull();
        expect(screen.getByText("Governance Gate History")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it("computes valid topological waves and budget defaults in planObjectiveLocally", () => {
    const plan = planObjectiveLocally(
      "proj-1",
      "Build React dashboard, FastAPI endpoint, database schema, security audit, and release rollout",
      { maxBudgetUsd: 5.0, isolateWorktrees: true },
    );
    expect(plan.waves.length).toBeGreaterThanOrEqual(3);
    expect(plan.metrics.total_tasks).toBeGreaterThanOrEqual(4);
    expect(plan.config.max_budget_usd).toBe(5.0);
    expect(plan.config.isolate_worktrees).toBe(true);
    expect(plan.tasks.filter((t) => t.wave_index === 0).every((t) => t.depends_on.length === 0)).toBe(true);
  });

  it("queries Knowledge Fabric, runs Multi-Agent Benchmarks, and installs a Skill Marketplace package", async () => {
    render(<MultiAgentKernelPanel projectId="proj-test" />);

    // Milestone #2: Memory & Bench tab
    fireEvent.click(screen.getByRole("tab", { name: /Memory & Bench/i }));
    expect(screen.getByText("Cross-Run Knowledge Fabric")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Query Memory/i }));
    await waitFor(() => {
      expect(screen.getByText(/Architecture Contract Gate/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Run Benchmark Suite/i }));
    await waitFor(() => {
      expect(screen.getByText(/Pass rate: 100%/i)).toBeInTheDocument();
      expect(screen.getByText(/Gate: passed/i)).toBeInTheDocument();
    });

    // Milestone #3: Traces & Market tab
    fireEvent.click(screen.getByRole("tab", { name: /Traces & Market/i }));
    expect(screen.getByText("OpenTelemetry W3C Run Trace")).toBeInTheDocument();
    expect(screen.getByText("Tenant Governance Policy")).toBeInTheDocument();
    expect(screen.getByText("OpenTelemetry Distributed Tracing & SLOs")).toBeInTheDocument();

    const installBtns = screen.getAllByRole("button", { name: /Install Skill/i });
    fireEvent.click(installBtns[0]);
    await waitFor(() => {
      expect(screen.getByText(/Installed "OpenTelemetry Distributed Tracing & SLOs"/i)).toBeInTheDocument();
    });

    // Verify installed marketplace skill is now visible in the Skills catalog tab
    fireEvent.click(screen.getByRole("tab", { name: /Skills/i }));
    expect(screen.getByText("otel-distributed-tracing")).toBeInTheDocument();
  });
});
