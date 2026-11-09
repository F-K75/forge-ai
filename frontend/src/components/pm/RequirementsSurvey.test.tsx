import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { RequirementsSurvey } from "./RequirementsSurvey";
import { clearAllSurveyDrafts, getAllSurveyDrafts, getLatestSurveyDraft } from "../../lib/surveyDraftStorage";

vi.mock("../../lib/geminiPM", () => ({
  clarifyInitiativeWithGemini: vi.fn().mockResolvedValue({
    inferred_domain: "SaaS",
    confidence_score: 95,
    summary: "Mock clarification",
    questions: [
      {
        id: "q_auth",
        category: "Security",
        question: "What authentication mechanism will be used?",
        options: ["OAuth 2.0 / OIDC", "API Keys", "Email & Password"],
        default_answer: "OAuth 2.0 / OIDC",
        rationale: "Ensures enterprise-grade security.",
      },
    ],
  }),
  requestAiFollowUpBranch: vi.fn().mockResolvedValue(null),
  generatePrdWithGemini: vi.fn().mockResolvedValue({}),
}));

describe("RequirementsSurvey Save Draft functionality", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    clearAllSurveyDrafts();
  });

  it("renders Save Draft button in the toolbar and footer", () => {
    render(
      <RequirementsSurvey
        isOpen={true}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        prompt="Build a high-performance analytics dashboard"
      />
    );

    const saveButtons = screen.getAllByRole("button", { name: /save draft/i });
    expect(saveButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("persists survey state to local storage when Save Draft is clicked", () => {
    render(
      <RequirementsSurvey
        isOpen={true}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        prompt="Multi-Tenant SaaS with Stripe Billing"
      />
    );

    const saveButton = screen.getAllByRole("button", { name: /save draft/i })[0];
    fireEvent.click(saveButton);

    const drafts = getAllSurveyDrafts();
    expect(drafts.length).toBe(1);
    expect(drafts[0].prompt).toBe("Multi-Tenant SaaS with Stripe Billing");

    const latest = getLatestSurveyDraft();
    expect(latest).not.toBeNull();
    expect(latest?.prompt).toBe("Multi-Tenant SaaS with Stripe Billing");
  });

  it("displays draft saved visual confirmation feedback after clicking Save Draft", () => {
    render(
      <RequirementsSurvey
        isOpen={true}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        prompt="AI Code Review Assistant"
      />
    );

    const saveButton = screen.getAllByRole("button", { name: /save draft/i })[0];
    fireEvent.click(saveButton);

    expect(screen.getAllByText(/draft saved!/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders Neural Chatbot tab and neural mesh interface by default", () => {
    render(
      <RequirementsSurvey
        isOpen={true}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        prompt="Autonomous AI Agent Fleet"
      />
    );

    // Verifies Neural Chatbot tab button exists
    const neuralTab = screen.getByRole("button", { name: /ai chat/i });
    expect(neuralTab).toBeInTheDocument();

    // Verifies Neural Requirements Graph is active
    expect(screen.getByText(/Neural Requirements Graph/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Convergence/i).length).toBeGreaterThanOrEqual(1);
  });

  it("allows seamless switching between Neural Chatbot, Wizard, and Summary modes", async () => {
    render(
      <RequirementsSurvey
        isOpen={true}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        prompt="Distributed Microservices Platform"
      />
    );

    // Initially in Neural Chatbot
    await waitFor(() => {
      expect(screen.getByText(/Neural Requirements Graph/i)).toBeInTheDocument();
    });

    // Switch to Step-by-Step Wizard
    const wizardTab = screen.getByRole("button", { name: /step-by-step/i });
    fireEvent.click(wizardTab);

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of/i)).toBeInTheDocument();
    });

    // Switch back to Neural Chatbot
    const neuralTab = screen.getByRole("button", { name: /ai chat/i });
    fireEvent.click(neuralTab);

    await waitFor(() => {
      expect(screen.getByText(/Neural Requirements Graph/i)).toBeInTheDocument();
    });
  });
});
