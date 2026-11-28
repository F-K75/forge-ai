/**
 * Deterministic demo planner: maps a prompt to the events WS-C would stream
 * for it (mirrors the owner examples in docs/os/CAPABILITY_MATRIX.md). Every
 * payload is contract-valid (see fakeOsBackend.test.ts). Used only when there
 * is no backend; WS-C's rules planner is the real thing.
 */
import {
  A2UI_VERSION,
  FORGE_CATALOG_ID,
  type A2UIComponent,
  type AttachmentRef,
  type IntentKind,
  type OsEventDataMap,
  type OsEventType,
  type PresentationKind,
  type SurfacePlacement,
} from "../../contracts"

export interface FakeEventSpec<T extends OsEventType = OsEventType> {
  type: T
  data: OsEventDataMap[T]
  /** Delay before this event, ms. */
  delay: number
}

interface PlanCtx {
  prompt: string
  attachments: AttachmentRef[]
  turnId: string
  idSeed: string
}

interface Rule {
  test: RegExp
  intent: IntentKind
  capability: string | null
  presentation: PresentationKind
  build: (ctx: PlanCtx) => { text?: string; surface?: { placement: SurfacePlacement; components?: A2UIComponent[]; dataModel?: Record<string, unknown> } }
}

const ev = <T extends OsEventType>(type: T, data: OsEventDataMap[T], delay = 120): FakeEventSpec<T> => ({
  type,
  data,
  delay,
})

const RULES: Rule[] = [
  {
    test: /\b(chart|revenue|analy[sz]e|dataset|csv|spreadsheet|by region)\b/i,
    intent: "analyze_data",
    capability: "data.analyze",
    presentation: "window",
    build: ({ idSeed }) => ({
      text: "Here's revenue by region from your dataset. EMEA leads this quarter; APAC grew fastest.",
      surface: {
        placement: {
          surface_id: `srf_rev_${idSeed}`,
          presentation: "window",
          title: "Revenue by region",
          capability_id: "data.analyze",
          size_hint: "large",
          focus: true,
        },
        components: [
          { id: "root", component: "Column", children: ["metrics", "chart", "table"], gap: "md" },
          {
            id: "metrics",
            component: "MetricRow",
            items: [
              { label: "Total revenue", value: "$4.21M", delta: "+12.4%" },
              { label: "Regions", value: "4" },
              { label: "Fastest growth", value: "APAC", delta: "+31%" },
            ],
          },
          {
            id: "chart",
            component: "Chart",
            kind: "bar",
            title: "Revenue by region",
            data: { "@path": "/rows" },
            x: "region",
            series: [{ key: "revenue", label: "Revenue" }],
          },
          {
            id: "table",
            component: "DataTable",
            columns: [
              { key: "region", label: "Region" },
              { key: "revenue", label: "Revenue", type: "currency" },
              { key: "growth", label: "Growth" },
            ],
            rows: { "@path": "/rows" },
            sortable: true,
          },
        ],
        dataModel: {
          rows: [
            { region: "EMEA", revenue: 1520000, growth: "+9%" },
            { region: "North America", revenue: 1310000, growth: "+6%" },
            { region: "APAC", revenue: 980000, growth: "+31%" },
            { region: "LATAM", revenue: 400000, growth: "+14%" },
          ],
        },
      },
    }),
  },
  {
    test: /\bcompare\b.*\b(model|claude|gpt|gemini|llm)s?\b|\b(model|llm)s? (comparison|compare)\b/i,
    intent: "compare_models",
    capability: "models.compare",
    presentation: "window",
    build: ({ idSeed }) => ({
      text: "Side by side for coding work. Prices are public list prices per million tokens.",
      surface: {
        placement: {
          surface_id: `srf_cmp_${idSeed}`,
          presentation: "window",
          title: "Compare models for coding",
          capability_id: "models.compare",
          size_hint: "regular",
          focus: true,
        },
        components: [
          { id: "root", component: "Column", children: ["table", "note"], gap: "md" },
          {
            id: "table",
            component: "ComparisonTable",
            subjects: [
              { id: "fast", label: "Fast tier" },
              { id: "balanced", label: "Balanced tier" },
              { id: "best", label: "Best tier" },
            ],
            rows: [
              { label: "Coding benchmark", values: ["71%", "83%", "89%"], better: "higher" },
              { label: "Input $/M tokens", values: [0.8, 3, 15], better: "lower" },
              { label: "Output $/M tokens", values: [4, 15, 75], better: "lower" },
              { label: "Median latency", values: ["0.6 s", "1.4 s", "2.9 s"], better: "lower" },
              { label: "Tool use", values: [true, true, true], better: "none" },
            ],
          },
          { id: "note", component: "Text", text: "Auto routes each turn to the cheapest tier that meets the task.", variant: "muted" },
        ],
      },
    }),
  },
  {
    test: /\b(approve|approval|gate|sign off)\b/i,
    intent: "approve_gate",
    capability: "governance.approvals",
    presentation: "inline",
    build: ({ idSeed }) => ({
      text: "One gate is waiting on you.",
      surface: {
        placement: {
          surface_id: `srf_gate_${idSeed}`,
          presentation: "inline",
          title: "Production deploy gate",
          capability_id: "governance.approvals",
          size_hint: "compact",
        },
        components: [
          {
            id: "root",
            component: "ApprovalCard",
            gateId: "gate_prod_deploy",
            gateName: "Deploy storefront v2.4 to production",
            reason: "All 214 checks passed. 3 files changed in checkout since the last release.",
            riskLevel: "medium",
            approve: { event: { name: "gate.approve", context: { gate_id: "gate_prod_deploy" } } },
            reject: { event: { name: "gate.reject", context: { gate_id: "gate_prod_deploy" } } },
          },
        ],
      },
    }),
  },
  {
    test: /\b(run|runs|progress|how'?s|status)\b/i,
    intent: "monitor_run",
    capability: "agents.kernel_run",
    presentation: "panel",
    build: ({ idSeed }) => ({
      text: "Run 42 is on step 4 of 6. Nothing is blocked.",
      surface: {
        placement: {
          surface_id: `srf_run_${idSeed}`,
          presentation: "panel",
          title: "Run 42",
          capability_id: "agents.kernel_run",
          size_hint: "regular",
        },
        components: [
          { id: "root", component: "Column", children: ["progress", "steps"], gap: "md" },
          { id: "progress", component: "ProgressBar", label: "Overall", value: 4, max: 6, tone: "info" },
          {
            id: "steps",
            component: "StatusList",
            items: [
              { title: "Plan the change", status: "completed", owner: "Architect" },
              { title: "Write the checkout tests", status: "completed", owner: "QA" },
              { title: "Implement the payment retry", status: "completed", owner: "Developer" },
              { title: "Review the diff", status: "running", owner: "Reviewer", detail: "2 of 3 files reviewed" },
              { title: "Deploy to staging", status: "pending", owner: "Release" },
              { title: "Production gate", status: "pending", owner: "You" },
            ],
          },
        ],
      },
    }),
  },
  {
    test: /\b(projects?|repos?|repositories)\b/i,
    intent: "manage_projects",
    capability: "projects.manage",
    presentation: "window",
    build: ({ idSeed }) => ({
      text: "Opening your projects.",
      surface: {
        placement: {
          surface_id: `cap_projects_${idSeed}`,
          presentation: "window",
          title: "Projects",
          capability_id: "projects.manage",
          size_hint: "large",
          focus: true,
        },
      },
    }),
  },
  {
    test: /\b(command center|fleet|dashboard|agents doing)\b/i,
    intent: "open_capability",
    capability: "fleet.overview",
    presentation: "window",
    build: ({ idSeed }) => ({
      text: "Here's the fleet overview.",
      surface: {
        placement: {
          surface_id: `cap_fleet_${idSeed}`,
          presentation: "window",
          title: "Fleet overview",
          capability_id: "fleet.overview",
          size_hint: "large",
          focus: true,
        },
      },
    }),
  },
  {
    test: /\b(build|make|create)\b.*\b(site|website|app|landing page|store)\b/i,
    intent: "build_website",
    capability: "build.new",
    presentation: "window",
    build: ({ idSeed }) => ({
      text: "Let's start a new build. Describe the details in the build window and I'll plan it.",
      surface: {
        placement: {
          surface_id: `cap_build_${idSeed}`,
          presentation: "window",
          title: "New build",
          capability_id: "build.new",
          size_hint: "large",
          focus: true,
        },
      },
    }),
  },
  {
    test: /\b(billing|credits|invoice|plan|subscription)\b/i,
    intent: "account",
    capability: "account.billing",
    presentation: "window",
    build: ({ idSeed }) => ({
      text: "Opening billing.",
      surface: {
        placement: {
          surface_id: `cap_billing_${idSeed}`,
          presentation: "window",
          title: "Billing and credits",
          capability_id: "account.billing",
          focus: true,
        },
      },
    }),
  },
  {
    test: /\b(what can you do|capabilit|everything|library)\b/i,
    intent: "open_capability",
    capability: "system.capability_library",
    presentation: "panel",
    build: ({ idSeed }) => ({
      text: "Everything Forge can do is in the library. Ask for any of it, or open it from here.",
      surface: {
        placement: {
          surface_id: `cap_library_${idSeed}`,
          presentation: "panel",
          title: "Capability library",
          capability_id: "system.capability_library",
        },
      },
    }),
  },
]

const JOKE = "Why do programmers prefer dark mode? Because light attracts bugs."

function chatAnswer(prompt: string): string {
  if (/\bjoke\b/i.test(prompt)) return JOKE
  if (/^\s*(hi|hello|hey)\b/i.test(prompt)) return "Hi. Tell me what you want to build, analyse or check on, and I'll bring up what you need."
  return (
    "This is the demo workspace, so I answer from a short script instead of a model. " +
    "Try \"show my projects\", \"chart revenue by region\", \"compare models for coding\", " +
    "\"how's run 42 going?\" or \"approve the prod deploy\"."
  )
}

/** Split text into small streamed chunks (2-3 words). */
export function chunkText(text: string): string[] {
  const words = text.split(/(\s+)/)
  const out: string[] = []
  for (let i = 0; i < words.length; i += 6) out.push(words.slice(i, i + 6).join(""))
  return out.filter(Boolean)
}

export function planFakeTurn(ctx: PlanCtx & { assistantMessageId: string; userMessageId: string }): FakeEventSpec[] {
  const hasDataset = ctx.attachments.some((a) => a.kind === "dataset")
  const rule = RULES.find((r) => r.test.test(ctx.prompt)) ?? (hasDataset ? RULES[0] : undefined)
  const intent = {
    kind: rule?.intent ?? ("chat" as IntentKind),
    confidence: rule ? 0.86 : 0.95,
    capability_ids: rule?.capability ? [rule.capability] : [],
    entities: {},
    source: "rules" as const,
    rationale: rule ? "Demo rules matched the prompt" : null,
  }
  const out: FakeEventSpec[] = [
    ev("turn.started", { message_id: ctx.userMessageId, prompt_preview: ctx.prompt.slice(0, 200) }, 0),
    ev("intent.resolved", { intent }, 220),
  ]
  const built = rule?.build(ctx) ?? { text: chatAnswer(ctx.prompt) }
  out.push(
    ev(
      "plan.ready",
      {
        plan: {
          plan_id: `plan_${ctx.idSeed}`,
          intent,
          presentation: rule?.presentation ?? "text",
          steps: [
            ...(built.text
              ? [{ id: "s1", kind: "respond_text" as const, title: "Answer", capability_id: null, requires_approval: false }]
              : []),
            ...(built.surface
              ? [
                  {
                    id: "s2",
                    kind: built.surface.components ? ("render_surface" as const) : ("open_capability" as const),
                    title: built.surface.placement.title,
                    capability_id: built.surface.placement.capability_id ?? null,
                    requires_approval: false,
                  },
                ]
              : []),
          ],
          model: null,
          fallback: true,
        },
      },
      160,
    ),
  )
  if (built.text) {
    let acc = ""
    for (const chunk of chunkText(built.text)) {
      acc += chunk
      out.push(ev("text.delta", { message_id: ctx.assistantMessageId, delta: chunk }, 45))
    }
    out.push(ev("text.completed", { message_id: ctx.assistantMessageId, text: acc, format: "plain" }, 40))
  }
  if (built.surface) {
    if (built.surface.components) {
      out.push(
        ev(
          "a2ui.message",
          {
            message: {
              version: A2UI_VERSION,
              createSurface: {
                surfaceId: built.surface.placement.surface_id,
                catalogId: FORGE_CATALOG_ID,
                components: built.surface.components,
                dataModel: built.surface.dataModel ?? {},
              },
            },
          },
          140,
        ),
      )
    }
    out.push(ev("surface.placed", { placement: built.surface.placement }, 60))
  }
  out.push(ev("turn.completed", { status: "completed", usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 } }, 60))
  return out
}

/** Events answering a user action on a generated surface (demo: approval gates). */
export function planFakeAction(
  name: string,
  surfaceId: string,
  actionId: string,
): FakeEventSpec[] {
  const approved = name === "gate.approve"
  const rejected = name === "gate.reject"
  if (!approved && !rejected) {
    return [ev("action.result", { action_id: actionId, status: "rejected", message: "Not available in the demo." }, 200)]
  }
  return [
    ev("action.result", { action_id: actionId, status: "accepted", message: null }, 150),
    ev(
      "a2ui.message",
      {
        message: {
          version: A2UI_VERSION,
          updateComponents: {
            surfaceId,
            components: [
              {
                id: "root",
                component: "Callout",
                tone: approved ? "success" : "warning",
                title: approved ? "Deploy approved" : "Deploy rejected",
                text: approved
                  ? "Storefront v2.4 is rolling out to production."
                  : "The release is on hold. The team has been told why.",
              },
            ],
          },
        },
      },
      350,
    ),
    ev("action.result", { action_id: actionId, status: "completed", message: approved ? "Approved" : "Rejected" }, 50),
  ]
}
