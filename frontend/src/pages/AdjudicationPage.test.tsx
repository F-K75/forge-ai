import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

vi.mock("../lib/env", () => ({ LIVE_MODE: true }));

const queue = vi.fn();
const item = vi.fn();
const expand = vi.fn();
const label = vi.fn();
vi.mock("../lib/qualityReview", () => ({
  MIN_EXPAND_PURPOSE_CHARS: 10,
  adjudicationApi: {
    queue: (...a: unknown[]) => queue(...a),
    item: (...a: unknown[]) => item(...a),
    expand: (...a: unknown[]) => expand(...a),
    label: (...a: unknown[]) => label(...a),
  },
}));

vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdjudicationPage from "./AdjudicationPage";

const QUEUE_ITEM = {
  item_id: "item-1",
  finding_id: "f1",
  build_id: "b1",
  file: "app/settings.py",
  line: 31,
  rule_or_category: "secret-aws-access-key-id",
  status: "pending",
  consent_basis: "internal",
  created_at: "2026-11-20T10:00:00",
  expires_at: "2027-02-18T10:00:00",
};

const VIEW = {
  item_id: "item-1",
  finding: {
    finding_id: "f1",
    build_id: "b1",
    file: "app/settings.py",
    line: 31,
    rule_or_category: "secret-aws-access-key-id",
    message: "Hardcoded key [REDACTED:secret-aws-access-key-id] found",
  },
  file: "app/settings.py",
  excerpt_start_line: 11,
  excerpt_end_line: 13,
  redacted_excerpt: 'line_10 = 10\nAWS_KEY = "[REDACTED:secret-aws-access-key-id]"\nline_12 = 12',
  blueprint_fragment: { pages: [{ name: "Settings", route: "/settings" }] },
  redaction_report: { total: 1, counts: { "secret-aws-access-key-id": 1 } },
  consent_basis: "internal",
  status: "pending",
  created_at: "2026-11-20T10:00:00",
  expires_at: "2027-02-18T10:00:00",
  my_label: null,
};

async function openItem() {
  render(<AdjudicationPage />);
  fireEvent.click(await screen.findByRole("button", { name: /secret-aws-access-key-id/i }));
  await screen.findByLabelText("Redacted excerpt");
}

describe("AdjudicationPage", () => {
  beforeEach(() => {
    queue.mockReset().mockResolvedValue({ items: [QUEUE_ITEM], count: 1 });
    item.mockReset().mockResolvedValue(VIEW);
    expand.mockReset();
    label.mockReset();
  });

  afterEach(() => cleanup());

  it("lists the queue and shows only the redacted excerpt by default", async () => {
    await openItem();
    expect(queue).toHaveBeenCalledWith("pending");
    expect(item).toHaveBeenCalledWith("item-1");
    const excerpt = screen.getByLabelText("Redacted excerpt");
    expect(excerpt.textContent).toContain("[REDACTED:secret-aws-access-key-id]");
    expect(excerpt.textContent).toContain("11");
    expect(screen.getByText(/Redacted: secret-aws-access-key-id ×1/)).toBeInTheDocument();
    // No full artifact until an explicit, logged expand.
    expect(document.getElementById("adjudication-expanded-content")).toBeNull();
    expect(expand).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Expand \(logged\)/i })).toBeInTheDocument();
  });

  it("asks for a purpose before expanding and sends it", async () => {
    expand.mockResolvedValue({
      item_id: "item-1",
      target: "artifact",
      artifact_id: "file-1",
      path: "app/settings.py",
      content: "full file, redacted",
      truncated: false,
      redaction_report: { total: 0, counts: {} },
    });
    await openItem();
    fireEvent.click(screen.getByRole("button", { name: /Expand \(logged\)/i }));
    const submit = screen.getByRole("button", { name: /Expand and log/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Purpose \(at least/i), { target: { value: "short" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Purpose \(at least/i), {
      target: { value: "Check whether the key is used at runtime" },
    });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(expand).toHaveBeenCalledWith("item-1", "Check whether the key is used at runtime", "artifact"),
    );
    expect(await screen.findByText("full file, redacted")).toBeInTheDocument();
  });

  it("submits a label with the chosen verdict", async () => {
    label.mockResolvedValue({ id: "l1", verdict: "false_positive" });
    await openItem();
    const submit = screen.getByRole("button", { name: /Submit label/i });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText("False positive"));
    fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: "test fixture only" } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(label).toHaveBeenCalledWith("item-1", {
        verdict: "false_positive",
        corrected_category: undefined,
        notes: "test fixture only",
      }),
    );
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(2));
  });

  it("shows the server's refusal when an item is no longer eligible", async () => {
    item.mockReset().mockRejectedValue({
      response: { data: { detail: "This build is no longer eligible for human adjudication" } },
    });
    render(<AdjudicationPage />);
    fireEvent.click(await screen.findByRole("button", { name: /secret-aws-access-key-id/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer eligible/i);
  });
});
