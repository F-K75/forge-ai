import type { AnyWSEvent } from './wsContract'

// Sample per-agent documents matching the real backend schemas exactly
// (backend/prompt_builder/templates/*_v1.py, backend/agents/business_model.py)
// so the demo build exercises the same AgentDocumentView code path a real
// build does — not a simplified stand-in.
const ARCHITECT_BLUEPRINT = {
  app_name: 'habit-tracker',
  description: 'Daily habit tracking with streaks, heatmaps, and reminders.',
  pages: [
    { name: 'Dashboard', route: '/', description: 'Today\'s habits and streak overview', components: ['HabitList', 'StreakHeatmap'] },
    { name: 'Habit detail', route: '/habits/:id', description: 'History and reminder settings for one habit', components: ['Counter', 'HistoryChart'] },
  ],
  data_models: [
    { name: 'Habit', fields: [{ name: 'id', type: 'string', required: true }, { name: 'name', type: 'string', required: true }, { name: 'streak', type: 'number', required: true }] },
    { name: 'Entry', fields: [{ name: 'habit_id', type: 'string', required: true }, { name: 'date', type: 'date', required: true }] },
  ],
  api_endpoints: [
    { method: 'GET', path: '/api/habits', description: 'List habits', auth_required: true },
    { method: 'POST', path: '/api/habits/:id/check-in', description: 'Log today\'s entry', auth_required: true },
  ],
  features: ['Streak tracking', 'Daily reminders', 'Progress heatmap'],
  integrations: ['sendgrid'],
  auth_required: true,
  clarifications: [],
}

const BUSINESS_MODEL_PLAN = {
  executive_summary: 'A habit tracker aimed at people who\'ve churned off harsher, guilt-driven apps — visual streaks and heatmaps without punishing language.',
  target_customers: [
    { segment: 'Self-improvement enthusiasts', jobs_to_be_done: ['Build a daily habit', 'See visible progress'], pain_points: ['Existing apps feel punishing', 'Lose motivation after breaking a streak'], why_now: 'New Year resolution season', success_metrics: ['7-day retention', 'Streak length'] },
  ],
  value_proposition: {
    current: 'Generic habit tracker',
    improved: 'Streaks that forgive a missed day instead of resetting to zero',
    differentiators: ['Forgiving streak mechanic', 'Heatmap-first UI'],
    positioning_statement: 'The habit tracker that doesn\'t guilt-trip you for missing a day.',
  },
  revenue_model_options: [
    { option: 'Freemium', how_it_works: '3 habits free, unlimited on Pro', pros: ['Low barrier to entry'], cons: ['Longer path to revenue'], best_for_segments: ['Self-improvement enthusiasts'] },
  ],
  recommended_pricing: {
    recommended_model: 'Freemium',
    tiers: [
      { name: 'Free', price: { amount: 0, currency: 'USD', billing_period: 'monthly' }, ideal_for: 'Trying it out', included: ['3 habits', 'Basic heatmap'], limits: ['No reminders'] },
      { name: 'Pro', price: { amount: 6, currency: 'USD', billing_period: 'monthly' }, ideal_for: 'Daily users', included: ['Unlimited habits', 'Reminders', 'Export data'], limits: [] },
    ],
    assumptions: ['Users convert after a 2-week streak'],
    risks_and_mitigations: [{ risk: 'Low conversion', mitigation: 'Prompt upgrade at streak milestones' }],
  },
  packaging_and_offer_design: {
    free_or_trial_strategy: 'Freemium, no time limit on free tier',
    add_ons_and_upsells: [],
    retention_levers: ['Streak-saving grace period', 'Weekly recap email'],
  },
  go_to_market: {
    initial_focus: ['Product Hunt launch'],
    channels: ['Product Hunt', 'r/productivity', 'TikTok habit-building creators'],
    launch_experiments: [
      { experiment: 'Landing page waitlist', hypothesis: 'Forgiving-streak framing converts better than generic', success_criteria: ['>15% signup rate'], timebox: '2 weeks' },
    ],
  },
  mvp_validation_plan: {
    what_to_test: ['Does the forgiving-streak mechanic actually improve retention?'],
    landing_page_questions: [],
    metrics_to_track: ['Day-7 retention', 'Streak length distribution'],
    decision_rules: [{ condition: 'Day-7 retention < 20%', next_step: 'Revisit onboarding' }],
  },
}

const DESIGNER_SYSTEM = {
  theme: {
    primary: '#7C5CFF',
    secondary: '#22222E',
    accent: '#E8823C',
    background: '#0A0A0F',
    surface: '#13131B',
    text_primary: '#E8E8F0',
    text_secondary: '#8B8B9E',
    border_radius: 'md',
    font_family: 'Inter',
    style: 'minimal',
  },
  layout: { sidebar: false, topbar: true, sidebar_width: '0px', content_max_width: '640px' },
  components: {
    Dashboard: { layout: 'Centered column, habit cards stacked', key_elements: ['HabitList', 'StreakHeatmap', 'AddHabitButton'], tailwind_classes: {} },
  },
  design_notes: 'Keep it calm — no red/error colors on missed days, use muted gray instead to avoid guilt-tripping the user.',
}

const PM_VALIDATION = {
  passed: true,
  score: 93,
  missing_features: ['Reminder scheduling UI'],
  issues: [
    { severity: 'low', description: 'Counter uses local state only, no persistence yet', file: 'src/components/Counter.tsx', suggestion: 'Wire to /api/habits/:id/check-in' },
  ],
  summary: 'Core habit-tracking flow works end to end. Reminders are stubbed but not yet user-configurable.',
}

const INTEGRATION_MANIFEST = {
  env_vars_needed: ['SENDGRID_API_KEY', 'FROM_EMAIL'],
  instructions: 'Add SENDGRID_API_KEY and FROM_EMAIL to your environment to enable daily reminder emails.',
}

const COUNTER_FILE_V1 = `import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count.value + 1)}>
      Count: {count}
    </button>
  );
}
`

const COUNTER_FILE_V2 = `import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
`

const APP_FILE = `import { Counter } from "./components/Counter";

export default function App() {
  return (
    <main>
      <h1>Habit Tracker</h1>
      <Counter />
    </main>
  );
}
`

const MAIN_FILE = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`

const STYLES_FILE = `body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0a0a0f;
  color: #e8e8f0;
}
`

const API_FILE = `export async function fetchHabits() {
  const res = await fetch("/api/habits");
  return res.json();
}
`

const README_FILE = `# habit-tracker

Daily habit tracking with streaks, heatmaps, and reminders.
`

function chunkTokens(text: string): string[] {
  // Split into small chunks (~3-6 chars) to simulate token streaming.
  const tokens: string[] = []
  let i = 0
  while (i < text.length) {
    const size = 3 + Math.floor(Math.random() * 4)
    tokens.push(text.slice(i, i + size))
    i += size
  }
  return tokens
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

// --- Gate simulation (interactive builds) --------------------------------
// Demo-mode stand-in for POST /builds/{id}/gate. ChatPanel's GateApprovalCard
// and its auto-approve effect call resolveMockGate() instead of
// buildsApi.respondToGate() when !LIVE_MODE, keyed by gate_id exactly like
// the real backend's pending_gate document.
type MockGateAction = { action: 'approve' | 'answers'; answers?: string[] }
type MockGateResponse = MockGateAction & { auto: boolean }

const pendingMockGates = new Map<string, (response: MockGateAction) => void>()

export function resolveMockGate(gateId: string, response: MockGateAction): void {
  const resolve = pendingMockGates.get(gateId)
  if (!resolve) return
  pendingMockGates.delete(gateId)
  resolve(response)
}

// Mirrors backend/core/config.py's gate_timeout default — auto-approves if
// nobody responds (and auto-approve isn't already on) before this elapses.
const MOCK_GATE_TIMEOUT_MS = 180_000

function waitForMockGate(gateId: string): { promise: Promise<MockGateResponse>; cancel: () => void } {
  let timeoutId = 0
  const promise = new Promise<MockGateResponse>(resolve => {
    timeoutId = window.setTimeout(() => {
      pendingMockGates.delete(gateId)
      resolve({ action: 'approve', auto: true })
    }, MOCK_GATE_TIMEOUT_MS)
    pendingMockGates.set(gateId, response => {
      window.clearTimeout(timeoutId)
      resolve({ ...response, auto: false })
    })
  })
  return {
    promise,
    cancel: () => {
      window.clearTimeout(timeoutId)
      pendingMockGates.delete(gateId)
    },
  }
}

/**
 * Drives a build's event sequence into `dispatch` (the store's handleEvent)
 * on realistic timers, pausing at interactive gates (clarify + one approval
 * gate each after architect/business_improver/designer, mirroring
 * backend/core/orchestrator.py) until resolveMockGate() is called or the
 * mock timeout elapses. Returns a cancel function for unmount/buildId change.
 */
export function runMockBuild(buildId: string, dispatch: (event: AnyWSEvent) => void): () => void {
  let cancelled = false
  let activeGateCancel: (() => void) | null = null
  let gateCounter = 0
  const base = { build_id: buildId }

  const emit = (event: AnyWSEvent) => {
    if (!cancelled) dispatch(event)
  }

  const gate = async (stage: string, agent: string, kind: 'approval' | 'questions', questions: string[] = []) => {
    const gateId = `mock-gate-${buildId}-${++gateCounter}`
    emit({
      ...base,
      type: 'gate_request',
      data: {
        gate_id: gateId,
        stage,
        agent,
        kind,
        questions,
        timeout_seconds: MOCK_GATE_TIMEOUT_MS / 1000,
        requested_at: new Date().toISOString(),
      },
    })
    const { promise, cancel } = waitForMockGate(gateId)
    activeGateCancel = cancel
    const response = await promise
    activeGateCancel = null
    if (cancelled) return
    emit({
      ...base,
      type: 'gate_resolved',
      data: { gate_id: gateId, stage, agent, action: response.action, auto: response.auto },
    })
    if (response.auto) {
      emit({ ...base, type: 'agent_update', data: { agent, message: 'No response — continuing automatically' } })
    }
  }

  const run = async () => {
    await gate('clarify', 'architect', 'questions', [
      'Should habit check-ins support multiple times per day, or just once?',
      'Any preferred color palette, or should the Designer agent decide?',
    ])
    if (cancelled) return

    await sleep(300)
    emit({ ...base, type: 'agent_start', data: { agent: 'architect' } })
    await sleep(900)
    emit({ ...base, type: 'agent_complete', data: { agent: 'architect', files_changed: ['src/App.tsx', 'src/main.tsx'] } })
    await sleep(50)
    emit({ ...base, type: 'agent_output', data: { agent: 'architect', output: ARCHITECT_BLUEPRINT } })

    await gate('architect', 'architect', 'approval')
    if (cancelled) return

    await sleep(200)
    emit({ ...base, type: 'agent_start', data: { agent: 'business_improver' } })
    await sleep(700)
    emit({ ...base, type: 'agent_complete', data: { agent: 'business_improver', files_changed: [] } })
    await sleep(50)
    emit({ ...base, type: 'agent_output', data: { agent: 'business_improver', output: BUSINESS_MODEL_PLAN } })

    await gate('business_improver', 'business_improver', 'approval')
    if (cancelled) return

    await sleep(200)
    emit({ ...base, type: 'agent_start', data: { agent: 'designer' } })
    await sleep(800)
    emit({ ...base, type: 'agent_complete', data: { agent: 'designer', files_changed: ['src/styles.css'] } })
    await sleep(50)
    emit({ ...base, type: 'agent_output', data: { agent: 'designer', output: DESIGNER_SYSTEM } })

    await gate('designer', 'designer', 'approval')
    if (cancelled) return

    await sleep(200)
    emit({ ...base, type: 'agent_start', data: { agent: 'developer' } })
    for (const token of chunkTokens(COUNTER_FILE_V1)) {
      await sleep(35)
      emit({ ...base, type: 'stream_token', data: { agent: 'developer', token } })
    }
    await sleep(150)
    emit({
      ...base,
      type: 'file_update',
      data: {
        delta: {
          changed: {
            'src/App.tsx': APP_FILE,
            'src/main.tsx': MAIN_FILE,
            'src/styles.css': STYLES_FILE,
            'src/components/Counter.tsx': COUNTER_FILE_V1,
          },
          deleted: [],
        },
      },
    })

    await sleep(400)
    emit({ ...base, type: 'debug_start', data: { iteration: 1, errors: ["TypeError: Cannot read properties of undefined (reading 'value')"] } })
    for (const token of chunkTokens(COUNTER_FILE_V2)) {
      await sleep(30)
      emit({ ...base, type: 'stream_token', data: { agent: 'developer', token } })
    }
    await sleep(150)
    emit({
      ...base,
      type: 'file_update',
      data: { delta: { changed: { 'src/components/Counter.tsx': COUNTER_FILE_V2 }, deleted: [] } },
    })
    await sleep(300)
    emit({ ...base, type: 'agent_complete', data: { agent: 'developer', files_changed: ['src/components/Counter.tsx'] } })

    await sleep(200)
    emit({ ...base, type: 'agent_start', data: { agent: 'integration' } })
    await sleep(700)
    emit({
      ...base,
      type: 'file_update',
      data: { delta: { changed: { 'src/lib/api.ts': API_FILE }, deleted: [] } },
    })
    await sleep(200)
    emit({ ...base, type: 'agent_complete', data: { agent: 'integration', files_changed: ['src/lib/api.ts'] } })
    await sleep(50)
    emit({ ...base, type: 'agent_output', data: { agent: 'integration', output: INTEGRATION_MANIFEST } })

    await sleep(200)
    emit({ ...base, type: 'agent_start', data: { agent: 'pm' } })
    await sleep(600)
    emit({
      ...base,
      type: 'file_update',
      data: { delta: { changed: { 'README.md': README_FILE }, deleted: [] } },
    })
    await sleep(200)
    emit({ ...base, type: 'agent_complete', data: { agent: 'pm', files_changed: ['README.md'] } })
    await sleep(50)
    emit({ ...base, type: 'agent_output', data: { agent: 'pm', output: PM_VALIDATION } })

    await sleep(400)
    emit({
      ...base,
      type: 'build_complete',
      data: {
        files: {
          'src/App.tsx': APP_FILE,
          'src/main.tsx': MAIN_FILE,
          'src/styles.css': STYLES_FILE,
          'src/components/Counter.tsx': COUNTER_FILE_V2,
          'src/lib/api.ts': API_FILE,
          'README.md': README_FILE,
        },
        validation: { score: 93 },
        credits_used: 13,
      },
    })
  }

  run()

  return () => {
    cancelled = true
    activeGateCancel?.()
  }
}

/**
 * Demo-mode stand-in for a real Docker deployment (backend/api/deployments.py) —
 * drives the same pending -> building -> deploying -> live sequence through
 * deploymentStore.handleEvent so the Deploy button behaves identically
 * whether or not a backend is configured.
 */
export function runMockDeployment(
  deploymentId: string,
  dispatch: (type: string, data: { deployment_id: string; status?: string; url?: string; error?: string }) => void
): () => void {
  const steps: Array<{ delay: number; status: string; url?: string }> = [
    { delay: 400, status: 'building' },
    { delay: 1200, status: 'deploying' },
    { delay: 1200, status: 'live', url: `https://${deploymentId}.preview.forge.dev` },
  ]
  let t = 0
  const timeoutIds = steps.map(({ delay, status, url }) => {
    t += delay
    return window.setTimeout(() => dispatch('build_complete', { deployment_id: deploymentId, status, url }), t)
  })
  return () => {
    timeoutIds.forEach(id => window.clearTimeout(id))
  }
}
