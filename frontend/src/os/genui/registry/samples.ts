/**
 * One valid sample per core catalog component (plus the children they
 * reference). Used by the registry tests and handy for a dev gallery.
 * Every sample is checked against the catalog in registry.test.tsx.
 */
import type { A2UIComponent, JsonObject } from "../../contracts"

export interface ComponentSample {
  components: A2UIComponent[]
  dataModel?: JsonObject
}

const t = (id: string, text: string): A2UIComponent => ({ id, component: "Text", text })
const action = (name: string, context?: JsonObject) => ({ event: context ? { name, context } : { name } })

export const CORE_SAMPLES: Record<string, ComponentSample> = {
  Column: { components: [{ id: "root", component: "Column", children: ["a", "b"], gap: "sm" }, t("a", "One"), t("b", "Two")] },
  Row: {
    components: [{ id: "root", component: "Row", children: ["a", "b"], align: "center", wrap: true }, t("a", "Left"), t("b", "Right")],
  },
  Card: { components: [{ id: "root", component: "Card", title: "Summary", children: ["a"] }, t("a", "Inside the card")] },
  Tabs: {
    components: [
      { id: "root", component: "Tabs", tabs: [{ title: "First", child: "a" }, { title: "Second", child: "b" }] },
      t("a", "First panel"),
      t("b", "Second panel"),
    ],
  },
  Divider: { components: [{ id: "root", component: "Divider" }] },
  Text: { components: [{ id: "root", component: "Text", text: { "@path": "/msg" }, variant: "muted" }], dataModel: { msg: "Bound text" } },
  Heading: { components: [{ id: "root", component: "Heading", text: "Sales by region", level: 2 }] },
  Callout: { components: [{ id: "root", component: "Callout", tone: "warning", title: "Heads up", text: "Budget is at 80%" }] },
  Badge: { components: [{ id: "root", component: "Badge", text: "Live", tone: "accent" }] },
  KeyValueList: {
    components: [{ id: "root", component: "KeyValueList", items: [{ key: "Owner", value: "Ada" }, { key: "Plan", value: { "@path": "/plan" } }] }],
    dataModel: { plan: "Pro" },
  },
  MetricRow: {
    components: [
      { id: "root", component: "MetricRow", items: [{ label: "Revenue", value: "$2.1k", delta: "+12%" }, { label: "Churn", value: "3%", delta: "-1%" }] },
    ],
  },
  ProgressBar: { components: [{ id: "root", component: "ProgressBar", label: "Build", value: { "@path": "/done" }, max: 10, tone: "success" }], dataModel: { done: 4 } },
  LinkList: {
    components: [{ id: "root", component: "LinkList", links: [{ label: "Docs", url: "https://example.com/docs" }] }],
  },
  CodeView: { components: [{ id: "root", component: "CodeView", code: "+added\n-removed\n same", language: "diff", filePath: "src/app.ts", diff: true }] },
  DataTable: {
    components: [
      {
        id: "root",
        component: "DataTable",
        columns: [
          { key: "region", label: "Region" },
          { key: "revenue", label: "Revenue", type: "currency" },
          { key: "state", label: "State", type: "status" },
        ],
        rows: { "@path": "/rows" },
        sortable: true,
        pageSize: 5,
        rowAction: action("open_region"),
      },
    ],
    dataModel: {
      rows: [
        { region: "EMEA", revenue: 1200, state: "completed" },
        { region: "APAC", revenue: 900, state: "running" },
        { region: "AMER", revenue: 1500, state: "failed" },
      ],
    },
  },
  Chart: {
    components: [
      { id: "root", component: "Chart", kind: "bar", title: "Revenue", data: { "@path": "/rows" }, x: "region", series: [{ key: "revenue", label: "Revenue" }] },
    ],
    dataModel: { rows: [{ region: "EMEA", revenue: 1200 }, { region: "APAC", revenue: 900 }] },
  },
  FilterBar: {
    components: [
      {
        id: "root",
        component: "FilterBar",
        filters: [
          { id: "region", label: "Region", kind: "select", value: { "@path": "/f/region" }, options: [{ value: "emea", label: "EMEA" }] },
          { id: "q", label: "Search", kind: "search", value: { "@path": "/f/q" } },
          { id: "rev", label: "Revenue", kind: "range", value: { "@path": "/f/rev" } },
          { id: "active", label: "Active only", kind: "toggle", value: { "@path": "/f/active" } },
        ],
      },
    ],
    dataModel: { f: {} },
  },
  ComparisonTable: {
    components: [
      {
        id: "root",
        component: "ComparisonTable",
        subjects: [{ id: "a", label: "Model A" }, { id: "b", label: "Model B" }],
        rows: [
          { label: "Price per 1M tokens", values: [3, 15], better: "lower" },
          { label: "Vision", values: [true, false] },
        ],
      },
    ],
  },
  Checklist: { components: [{ id: "root", component: "Checklist", items: [{ label: "Plan", checked: true }, { label: "Ship" }] }] },
  StatusList: {
    components: [{ id: "root", component: "StatusList", items: [{ id: "t1", title: "Build API", status: "running", owner: "Developer" }] }],
  },
  Timeline: {
    components: [{ id: "root", component: "Timeline", events: [{ label: "Wave 1 started", timestamp: "10:00", actor: "Kernel", status: "running" }] }],
  },
  AgentRoster: {
    components: [{ id: "root", component: "AgentRoster", agents: [{ role: "architect", status: "active", department: "engineering", taskCount: 3, model: "claude-sonnet" }] }],
  },
  ApprovalCard: {
    components: [
      { id: "root", component: "ApprovalCard", gateId: "g1", gateName: "Deploy to production", reason: "Touches billing", riskLevel: "high", approve: action("approve_gate"), reject: action("reject_gate") },
    ],
  },
  ConflictList: { components: [{ id: "root", component: "ConflictList", items: [{ filePath: "src/a.ts", waveIndex: 1, roles: ["developer", "designer"], status: "open" }] }] },
  EvalTable: { components: [{ id: "root", component: "EvalTable", rows: [{ role: "developer", artifactType: "code", score: 0.92, passed: true }] }] },
  CostBreakdown: {
    components: [{ id: "root", component: "CostBreakdown", currency: "USD", total: 4.2, budget: 5, items: [{ label: "LLM", amount: 4 }, { label: "Compute", amount: 0.2 }] }],
  },
  Button: { components: [{ id: "root", component: "Button", label: "Run again", action: action("rerun", { runId: "r1" }), variant: "tonal" }] },
  TextField: {
    components: [{ id: "root", component: "TextField", label: "Agent name", value: { "@path": "/form/name" }, placeholder: "e.g. Scout" }],
    dataModel: { form: { name: "" } },
  },
  Select: {
    components: [
      { id: "root", component: "Select", label: "Model tier", value: { "@path": "/form/tier" }, options: [{ value: "fast", label: "Fast" }, { value: "best", label: "Best" }] },
    ],
    dataModel: { form: { tier: "fast" } },
  },
  Toggle: { components: [{ id: "root", component: "Toggle", label: "Notify me", value: { "@path": "/form/notify" } }], dataModel: { form: { notify: false } } },
  Form: {
    components: [
      { id: "root", component: "Form", children: ["name"], submit: action("create_agent", { name: { "@path": "/form/name" } }), submitLabel: "Create" },
      { id: "name", component: "TextField", label: "Name", value: { "@path": "/form/name" } },
    ],
    dataModel: { form: { name: "Scout" } },
  },
}
