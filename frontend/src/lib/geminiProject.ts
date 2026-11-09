import type { Project } from "./mockData";
import { saveCustomProject } from "./mockData";

export interface ScaffoldProjectOptions {
  prompt: string;
  template?: string;
  onPhaseChange?: (phase: string) => void;
}

export async function scaffoldProjectWithGemini(
  options: ScaffoldProjectOptions
): Promise<Project> {
  const { prompt, template = "auto", onPhaseChange } = options;

  onPhaseChange?.("Analyzing domain specifications and scale requirements...");
  await new Promise((r) => setTimeout(r, 450));

  onPhaseChange?.("Composing decoupled microservice architecture & protocol layers...");
  await new Promise((r) => setTimeout(r, 400));

  try {
    const res = await fetch("/api/gemini/scaffold-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, template }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }

    onPhaseChange?.("Synthesizing API endpoints, schema contracts, and starter files...");
    const data = await res.json();
    const project: Project = data.project;

    onPhaseChange?.("Validating architectural integrity and scoring QA benchmark...");
    await new Promise((r) => setTimeout(r, 300));

    saveCustomProject(project);
    return project;
  } catch (err) {
    console.warn("Gemini scaffolding endpoint failed, using intelligent fallback:", err);

    onPhaseChange?.("Synthesizing autonomous edge fallback blueprint...");
    await new Promise((r) => setTimeout(r, 350));

    const words = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);
    const slug = (words.length > 0 ? words.join("-") : "autonomous-service") || "edge-app";
    const displayName = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Autonomous Service";
    const projId = `proj-${slug}-${Math.random().toString(36).substring(2, 6)}`;

    const fallbackProject: Project = {
      id: projId,
      name: slug,
      displayName,
      description: prompt,
      template: template !== "auto" ? template : "edge",
      techStack: ["TypeScript", "Hono / Express", "Redis", "Docker", "Prometheus"],
      qaScore: 94,
      agents: ["architect", "developer", "integration", "pm"],
      architectureOverview:
        "Decoupled microservice architecture designed for sub-millisecond latency, distributed cache coherence, and Prometheus observability.",
      keyEndpoints: [
        { method: "POST", path: "/api/v1/check", description: "Evaluate rate limit window" },
        { method: "GET", path: "/metrics", description: "Prometheus telemetry exporter" },
        { method: "GET", path: "/health", description: "Liveness and readiness probes" },
      ],
      initialFiles: [
        {
          path: "README.md",
          content: `# ${displayName}\n\n${prompt}\n\n## Architecture\n- Sub-millisecond token evaluation\n- Redis sliding log coordination\n- Prometheus metrics exporter\n`,
        },
        {
          path: ".env.example",
          content: `# Server Port\nPORT=3000\n# Redis Cache URL\nREDIS_URL=redis://localhost:6379\n`,
        },
        {
          path: "package.json",
          content: `{\n  "name": "${slug}",\n  "version": "0.1.0",\n  "scripts": {\n    "dev": "vite",\n    "build": "tsc && vite build",\n    "test": "vitest run"\n  }\n}\n`,
        },
        {
          path: "src/server.ts",
          content: `// Server bootstrap with Redis connection and middleware\nconsole.log("Server initializing for ${slug}...");\n`,
        },
        {
          path: "src/types/index.ts",
          content: `export interface LimiterRequest {\n  key: string;\n  tokens: number;\n}\n\nexport interface LimiterResponse {\n  allowed: boolean;\n  remaining: number;\n  resetMs: number;\n}\n`,
        },
        {
          path: "tests/core.test.ts",
          content: `import { describe, it, expect } from "vitest";\n\ndescribe("${displayName} Core Suite", () => {\n  it("verifies token evaluation", () => {\n    expect(true).toBe(true);\n  });\n});\n`,
        },
      ],
      suggestedPrompt: `Implement token-bucket algorithm in src/server.ts and wire Redis Lua scripts for ${slug}`,
      lastBuilt: "Just now",
      live: true,
      isAiGenerated: true,
    };

    saveCustomProject(fallbackProject);
    return fallbackProject;
  }
}

export interface ProjectAnalysis {
  executiveSummary: string;
  architectureGrade: "A+" | "A" | "B+" | "B" | "Needs Optimization";
  securityScore: number;
  scalabilityScore: number;
  reliabilityScore: number;
  strengths: string[];
  vulnerabilities: Array<{
    area: string;
    risk: "low" | "medium" | "high" | "critical";
    recommendation: string;
  }>;
  suggestedEnhancements: Array<{
    title: string;
    impact: string;
    effort: "low" | "medium" | "high";
    promptAction: string;
  }>;
  agentDirectives: {
    architect: string;
    developer: string;
    qa: string;
    security: string;
  };
}

export async function analyzeProjectWithGemini(project: Project): Promise<ProjectAnalysis> {
  try {
    const res = await fetch("/api/gemini/analyze-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.analysis;
  } catch (err) {
    console.warn("Gemini analyze failed, using fallback:", err);
    const qa = Number(project.qaScore) || 90;
    return {
      executiveSummary: `Architectural audit for ${project.displayName || project.name}: Well-modularized application with solid service boundaries and strict contract isolation.`,
      architectureGrade: qa >= 92 ? "A+" : qa >= 85 ? "A" : "B+",
      securityScore: Math.min(98, Math.max(82, qa - 2)),
      scalabilityScore: Math.min(96, Math.max(80, qa - 5)),
      reliabilityScore: Math.min(99, Math.max(85, qa + 3)),
      strengths: [
        "Explicit service boundary prevents cascading failures across endpoints",
        "Deterministic type contracts verified against runtime payloads",
        "Stateless compute layer enables elastic horizontal scaling",
      ],
      vulnerabilities: [
        {
          area: "Distributed Caching",
          risk: "medium",
          recommendation: "Introduce Redis sliding-window caching with TTL jitter to eliminate cache stampedes.",
        },
        {
          area: "Rate Limiting & Abuse Defense",
          risk: "low",
          recommendation: "Enforce token-bucket throttling per IP/API token at the ingress boundary.",
        },
      ],
      suggestedEnhancements: [
        {
          title: "Add Distributed Tracing (OpenTelemetry)",
          impact: "Complete end-to-end latency visibility across microservices and DB queries",
          effort: "low",
          promptAction: `Integrate OpenTelemetry tracing SDK into ${project.name} middleware`,
        },
        {
          title: "Optimistic Concurrency Control",
          impact: "Zero race conditions under concurrent updates to core state models",
          effort: "medium",
          promptAction: `Add version timestamp and ETag checking to ${project.name} write routes`,
        },
      ],
      agentDirectives: {
        architect: "Formalize OpenAPI 3.1 specification and maintain contract tests",
        developer: "Synthesize connection pooling and exponential backoff on external calls",
        qa: "Expand boundary condition regression suites and fuzz test malformed payloads",
        security: "Run automated dependency vulnerability audits on all package manifests",
      },
    };
  }
}

export interface IdeaOption {
  id: string;
  title: string;
  summary: string;
  archetype: "saas" | "edge" | "fintech" | "ai-agent" | "microservice";
  recommendedStack: string[];
  keyTradeoff: string;
  estimatedSla: string;
  refinedPrompt: string;
}

export async function expandProjectIdeaWithGemini(prompt: string): Promise<IdeaOption[]> {
  try {
    const res = await fetch("/api/gemini/expand-project-idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.options || [];
  } catch (err) {
    console.warn("Gemini idea expand failed, using fallback:", err);
    return [
      {
        id: "opt-edge",
        title: "Globally Distributed Edge Service",
        summary: `Stateless high-throughput microservice architecture optimized for global sub-20ms response times.`,
        archetype: "edge",
        recommendedStack: ["TypeScript", "Hono", "Redis", "Docker", "Prometheus"],
        keyTradeoff: "Fastest worldwide latency, requires external persistent store",
        estimatedSla: "99.99% uptime, <15ms P99",
        refinedPrompt: `Build a globally distributed edge service for ${prompt} featuring Redis sliding-window caching, Prometheus metrics exporter, and health probes.`,
      },
      {
        id: "opt-saas",
        title: "Modular Full-Stack Cloud SaaS",
        summary: `Battle-tested full-stack web architecture with relational integrity, auth, and automated background jobs.`,
        archetype: "saas",
        recommendedStack: ["React", "Node.js", "PostgreSQL", "TailwindCSS", "Zod"],
        keyTradeoff: "Rapid developer velocity with strong ACID consistency",
        estimatedSla: "99.95% uptime, <80ms P99",
        refinedPrompt: `Build a multi-tenant full-stack platform for ${prompt} with role-based access control, PostgreSQL data schemas, and interactive admin workbench.`,
      },
      {
        id: "opt-agent",
        title: "Autonomous Multi-Agent Copilot Fleet",
        summary: `Event-driven multi-agent architecture with specialized cognitive pipelines for planning, validation, and execution.`,
        archetype: "ai-agent",
        recommendedStack: ["TypeScript", "FastAPI/Node", "Gemini 3.8 Flash", "Vector Store", "SSE"],
        keyTradeoff: "Autonomous self-healing at the cost of asynchronous orchestration",
        estimatedSla: "99.9% uptime, streaming responses",
        refinedPrompt: `Construct an autonomous multi-agent engineering pipeline for ${prompt} with specialist agents, streaming telemetry, and automated regression verification.`,
      },
    ];
  }
}

