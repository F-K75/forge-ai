import type { IncomingMessage, ServerResponse } from 'http';
import type { GoogleGenAI } from '@google/genai';

export interface LiveUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface LiveCallResult {
  text: string;
  model: string;
  usage: LiveUsage;
  durationMs: number;
}

export interface LiveBuildHelpers {
  parseRequestBody: (req: IncomingMessage) => Promise<any>;
  sendJson: (res: ServerResponse, statusCode: number, data: any) => void;
  cleanAndParseJson: (raw: string) => any;
  callGeminiLive: (
    ai: GoogleGenAI,
    prompt: string,
    config?: { responseMimeType?: string; systemInstruction?: string },
    options?: {
      candidateModels?: string[];
      timeoutMs?: number;
      operation?: string;
      agent?: string;
      projectId?: string;
      initiativeId?: string;
    }
  ) => Promise<LiveCallResult>;
}

export async function handleLiveSynthesizeCode(
  ai: GoogleGenAI,
  req: IncomingMessage,
  res: ServerResponse,
  helpers: LiveBuildHelpers
): Promise<void> {
  const { parseRequestBody, sendJson, cleanAndParseJson, callGeminiLive } = helpers;
  const body = await parseRequestBody(req);
  const userPrompt = String(body.prompt || '').trim();
  const mode = String(body.mode || 'synthesis').trim();
  const projectName = String(body.projectName || 'Forge Project').trim();
  const existingFiles: string[] = Array.isArray(body.existingFiles)
    ? body.existingFiles.slice(0, 20).map(String)
    : [];

  if (!userPrompt) {
    sendJson(res, 400, { error: 'Prompt is required' });
    return;
  }

  const existingFilesContext =
    existingFiles.length > 0
      ? `\nExisting workspace files: ${existingFiles.join(', ')}`
      : '';

  const synthesisPrompt = `
You are Forge AI's Principal Autonomous Software Engineering Swarm (Architect, Builder, QA, DevOps).
Project: "${projectName}"
Mode: "${mode}"
User Request: "${userPrompt}"${existingFilesContext}

Synthesize a complete, production-ready multi-file TypeScript/React implementation for this request.
Generate 3 to 5 cohesive files (e.g., main UI component or core service, API/data module, TypeScript types, and a Vitest unit test file) with real, working, cleanly structured code — never placeholder stubs or TODOs.
Also generate 4 architecture DAG nodes representing the dependency graph (tiers 0, 1, 2, 3) and 4 concise agent execution log lines.

Output strictly valid JSON matching this exact schema:
{
  "primaryFile": "src/components/MainFeature.tsx",
  "summary": "1-2 sentence technical summary of what was synthesized.",
  "files": [
    {
      "path": "src/components/MainFeature.tsx",
      "description": "Concise file purpose",
      "content": "Full valid TypeScript/TSX source code"
    }
  ],
  "dagNodes": [
    {
      "id": "arch",
      "label": "Architecture & Domain Contracts",
      "category": "foundation",
      "status": "done",
      "description": "Short node description",
      "agent": "Architect",
      "files": ["src/types/domain.ts"],
      "metrics": "Strict TypeScript · 0 Cycles",
      "dependencies": [],
      "dependants": ["shell"],
      "tier": 0,
      "details": {
        "specs": ["Concrete spec 1", "Concrete spec 2"],
        "endpoints": ["POST /api/v1/resource"]
      }
    }
  ],
  "logs": [
    { "time": "00:01", "agent": "Architect", "message": "Concrete architectural decision made", "level": "info" },
    { "time": "00:02", "agent": "Builder", "message": "Concrete files implemented", "level": "info" },
    { "time": "00:03", "agent": "QA Engine", "message": "Test cases generated and validated", "level": "success" }
  ]
}
Output ONLY the raw JSON object.
`;

  try {
    const llmResult = await callGeminiLive(
      ai,
      synthesisPrompt,
      { responseMimeType: 'application/json' },
      { operation: 'synthesize_feature', agent: 'feature_builder', timeoutMs: 60000 }
    );

    const parsed = cleanAndParseJson(llmResult.text);
    if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      sendJson(res, 502, {
        error: `Live model (${llmResult.model}) returned malformed JSON without files. Please retry.`,
      });
      return;
    }

    const sanitizedFiles = parsed.files
      .filter((f: any) => f && typeof f.path === 'string' && typeof f.content === 'string')
      .map((f: any) => ({
        path: f.path.trim(),
        description: String(f.description || 'Synthesized module').trim(),
        content: f.content,
      }));

    if (sanitizedFiles.length === 0) {
      sendJson(res, 502, {
        error: `Live model (${llmResult.model}) did not emit valid file objects.`,
      });
      return;
    }

    const validCategories = new Set(['foundation', 'shell', 'core', 'infra']);
    const sanitizedDagNodes = Array.isArray(parsed.dagNodes)
      ? parsed.dagNodes
          .filter((n: any) => n && n.id && n.label)
          .map((n: any, idx: number) => ({
            id: String(n.id),
            label: String(n.label),
            category: validCategories.has(n.category)
              ? n.category
              : idx === 0
              ? 'foundation'
              : idx === 1
              ? 'shell'
              : idx === 2
              ? 'core'
              : 'infra',
            status: 'done',
            description: String(n.description || ''),
            agent: String(n.agent || 'Builder'),
            files: Array.isArray(n.files) ? n.files.map(String) : [sanitizedFiles[0].path],
            metrics: String(n.metrics || `${llmResult.model} · ${llmResult.usage.totalTokens} tokens`),
            dependencies: Array.isArray(n.dependencies) ? n.dependencies.map(String) : [],
            dependants: Array.isArray(n.dependants) ? n.dependants.map(String) : [],
            tier: typeof n.tier === 'number' ? n.tier : Math.min(idx, 3),
            details: {
              specs: Array.isArray(n.details?.specs)
                ? n.details.specs.map(String)
                : [String(n.description || userPrompt)],
              endpoints: Array.isArray(n.details?.endpoints)
                ? n.details.endpoints.map(String)
                : undefined,
            },
          }))
      : [];

    const sanitizedLogs =
      Array.isArray(parsed.logs) && parsed.logs.length > 0
        ? parsed.logs.map((l: any, idx: number) => ({
            time: String(l.time || `00:0${idx + 1}`),
            agent: String(l.agent || 'Builder'),
            message: String(l.message || ''),
            level: ['info', 'success', 'warn', 'error'].includes(l.level) ? l.level : 'info',
          }))
        : [
            {
              time: '00:01',
              agent: 'Architect',
              message: `Analyzed requirements for "${userPrompt}" via ${llmResult.model}`,
              level: 'info',
            },
            {
              time: '00:02',
              agent: 'Builder',
              message: `Synthesized ${sanitizedFiles.length} files (${llmResult.usage.totalTokens} tokens in ${(llmResult.durationMs / 1000).toFixed(1)}s)`,
              level: 'success',
            },
          ];

    sendJson(res, 200, {
      status: 'completed',
      live: true,
      model: llmResult.model,
      usage: llmResult.usage,
      durationMs: llmResult.durationMs,
      prompt: userPrompt,
      primaryFile:
        parsed.primaryFile && sanitizedFiles.some((f: any) => f.path === parsed.primaryFile)
          ? parsed.primaryFile
          : sanitizedFiles[0].path,
      files: sanitizedFiles,
      dagNodes: sanitizedDagNodes,
      logs: sanitizedLogs,
      summary: String(parsed.summary || `Synthesized ${sanitizedFiles.length} files for "${userPrompt}"`),
    });
  } catch (err: any) {
    console.error('[geminiPlugin] /api/gemini/synthesize-code failed:', err);
    sendJson(res, 502, {
      error: err?.message || 'Live Gemini synthesis request failed.',
    });
  }
}

export async function handleLiveScaffoldProject(
  ai: GoogleGenAI,
  req: IncomingMessage,
  res: ServerResponse,
  helpers: LiveBuildHelpers
): Promise<void> {
  const { parseRequestBody, sendJson, cleanAndParseJson, callGeminiLive } = helpers;
  const body = await parseRequestBody(req);
  const userPrompt = String(body.prompt || '').trim();
  const templatePreference = String(body.template || 'auto').trim();

  if (!userPrompt) {
    sendJson(res, 400, { error: 'Project prompt or description is required' });
    return;
  }

  const promptText = `
You are Forge AI's Principal Autonomous Systems Architect.
Your task is to analyze the following user project request and autonomously scaffold an end-to-end, production-ready software project blueprint with real, non-trivial implementation code in every starter file.

User Request: "${userPrompt}"
Template Preference: "${templatePreference}"

Generate a complete, high-fidelity project specification strictly in JSON with this schema:
{
  "name": "clean-lowercase-slug-3-to-5-words (e.g. distributed-rate-limiter)",
  "displayName": "Display Title of the Project",
  "description": "Crisp 2-3 sentence technical description of the architecture, data layer, and capabilities.",
  "template": "saas" | "edge" | "fintech" | "ai-agent" | "microservice",
  "techStack": ["Framework/Language", "Database", "ORM/API Layer", "Auth/Security", "Infrastructure"],
  "qaScore": 94,
  "architectureOverview": "Technical breakdown of component layers, API contracts, caching, and background workers.",
  "agents": ["architect", "developer", "designer", "pm", "integration", "business_improver"],
  "keyEndpoints": [
    { "method": "POST", "path": "/api/v1/resource", "description": "Purpose of the endpoint" }
  ],
  "initialFiles": [
    { "path": "README.md", "content": "Complete markdown architecture overview and run instructions" },
    { "path": ".env.example", "content": "Environment variable template without secrets" },
    { "path": "package.json", "content": "Valid package.json with scripts and dependencies" },
    { "path": "src/server.ts", "content": "Real working server/API implementation tailored to the user request" },
    { "path": "src/types/index.ts", "content": "Real TypeScript domain entities and request/response contracts" },
    { "path": "tests/core.test.ts", "content": "Real Vitest unit test suite covering core domain logic" }
  ],
  "suggestedPrompt": "Actionable next prompt to run in the workspace terminal"
}
Output ONLY the raw JSON object.
`;

  try {
    const llmResult = await callGeminiLive(
      ai,
      promptText,
      { responseMimeType: 'application/json' },
      { operation: 'scaffold_project', agent: 'systems_architect', timeoutMs: 60000 }
    );

    const parsed = cleanAndParseJson(llmResult.text);
    if (!parsed || typeof parsed !== 'object') {
      sendJson(res, 502, {
        error: `Live model (${llmResult.model}) returned invalid JSON while scaffolding project.`,
      });
      return;
    }

    const rawSlug = String(parsed.name || userPrompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 35));
    const slug = rawSlug.toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '') || 'autonomous-app';
    const projectId = `proj-${slug}-${Math.random().toString(36).substring(2, 6)}`;

    const VALID_AGENTS = ['architect', 'business_improver', 'designer', 'developer', 'integration', 'pm'];
    const assignedAgents = Array.isArray(parsed.agents)
      ? parsed.agents.filter((a: string) => VALID_AGENTS.includes(a))
      : ['architect', 'developer', 'pm'];
    if (assignedAgents.length === 0) {
      assignedAgents.push('architect', 'developer', 'pm');
    }

    const initialFiles: Array<{ path: string; content: string }> =
      Array.isArray(parsed.initialFiles) && parsed.initialFiles.length > 0
        ? parsed.initialFiles
            .filter((f: any) => f && typeof f.path === 'string' && typeof f.content === 'string')
            .map((f: any) => ({ path: f.path.trim(), content: f.content }))
        : [];

    if (initialFiles.length === 0) {
      sendJson(res, 502, {
        error: `Live model (${llmResult.model}) returned no starter files for the project.`,
      });
      return;
    }

    if (!initialFiles.some((f) => f.path === '.env.example')) {
      initialFiles.push({
        path: '.env.example',
        content: `# Environment variables for ${slug}\nPORT=3000\nNODE_ENV=development\n`,
      });
    }

    const project = {
      id: projectId,
      name: slug,
      displayName:
        parsed.displayName ||
        slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      description: parsed.description || userPrompt,
      template: parsed.template || (templatePreference !== 'auto' ? templatePreference : 'saas'),
      techStack:
        Array.isArray(parsed.techStack) && parsed.techStack.length > 0
          ? parsed.techStack
          : ['TypeScript', 'Node.js', 'React', 'Tailwind CSS', 'PostgreSQL'],
      qaScore:
        typeof parsed.qaScore === 'number' && parsed.qaScore >= 50 && parsed.qaScore <= 100
          ? parsed.qaScore
          : 94,
      agents: assignedAgents,
      architectureOverview:
        parsed.architectureOverview ||
        'Modular decoupled architecture optimized for horizontal scaling.',
      keyEndpoints:
        Array.isArray(parsed.keyEndpoints) && parsed.keyEndpoints.length > 0
          ? parsed.keyEndpoints
          : [{ method: 'GET', path: '/health', description: 'Liveness & readiness probe' }],
      initialFiles,
      suggestedPrompt:
        parsed.suggestedPrompt || `Implement core domain workflows and tests for ${slug}`,
      lastBuilt: 'Just now',
      live: true,
      isAiGenerated: true,
      liveModel: llmResult.model,
      buildDurationMs: llmResult.durationMs,
      tokenUsage: llmResult.usage,
    };

    sendJson(res, 200, {
      project,
      live: true,
      model: llmResult.model,
      usage: llmResult.usage,
      durationMs: llmResult.durationMs,
    });
  } catch (err: any) {
    console.error('[geminiPlugin] /api/gemini/scaffold-project failed:', err);
    sendJson(res, 502, {
      error: err?.message || 'Live Gemini project scaffolding failed.',
    });
  }
}
