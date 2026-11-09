import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ForgeBuildCanvas } from "./ForgeBuildCanvas";

describe("ForgeBuildCanvas (Redesigned Interactive Architecture DAG)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the canvas header with mode switcher and verification chip", () => {
    render(<ForgeBuildCanvas buildPrompt="Build SaaS landing page" />);

    expect(screen.getByText(/TOPOLOGY_DAG/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /DAG Graph/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pipeline/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Matrix/i })).toBeInTheDocument();
    expect(screen.getByText(/\d+\/\d+ VERIFIED/i)).toBeInTheDocument();
  });

  it("switches to Pipeline view and renders columns", () => {
    render(<ForgeBuildCanvas />);

    const pipelineBtn = screen.getByRole("button", { name: /Pipeline/i });
    fireEvent.click(pipelineBtn);

    expect(screen.getByText(/CORE SERVICES/i)).toBeInTheDocument();
    expect(screen.getByText(/EDGE INFRA/i)).toBeInTheDocument();
  });

  it("switches to Matrix view and displays DAG resolution table", () => {
    render(<ForgeBuildCanvas />);

    const matrixBtn = screen.getByRole("button", { name: /Matrix/i });
    fireEvent.click(matrixBtn);

    expect(screen.getByText(/DIRECTED ACYCLIC GRAPH \(DAG\) RESOLUTION MATRIX/i)).toBeInTheDocument();
    expect(screen.getByText(/CYCLE_ANALYSIS: 0 CYCLES/i)).toBeInTheDocument();
  });

  it("selects a node and displays the node inspector drawer with tabs", async () => {
    render(<ForgeBuildCanvas />);

    // Node: Architecture Topology
    const archNode = screen.getByText(/Architecture Topology/i);
    fireEvent.click(archNode);

    // Inspector should show architecture details
    await waitFor(() => {
      expect(screen.getByText(/Architecture Specs/i)).toBeInTheDocument();
    });

    // Switch inspector tab to code
    const codeTab = screen.getByRole("button", { name: /code/i });
    fireEvent.click(codeTab);

    expect(screen.getByText(/Contract Implementation/i)).toBeInTheDocument();

    // Switch inspector tab to endpoints
    const endpointsTab = screen.getByRole("button", { name: /endpoints/i });
    fireEvent.click(endpointsTab);

    expect(screen.getByText(/Route Handlers & Edge Sockets/i)).toBeInTheDocument();
  });

  it("calls onSelectNodeFile when clicking on a file link in the node", () => {
    const onSelectNodeFile = vi.fn();
    render(<ForgeBuildCanvas onSelectNodeFile={onSelectNodeFile} />);

    const fileBtn = screen.getAllByRole("button", { name: /api\.ts/i })[0];
    fireEvent.click(fileBtn);

    expect(onSelectNodeFile).toHaveBeenCalledWith("src/types/api.ts");
  });
});
