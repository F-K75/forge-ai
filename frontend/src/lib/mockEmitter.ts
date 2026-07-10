import type { AnyWSEvent } from './wsContract'
import { useBuildStore } from '../store/buildStore'

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

// Structured outputs matching what the live pipeline's agent_output events
// carry (architect blueprint shape from agents/architect.py, etc.).
const BLUEPRINT = {
  app_name: 'Habit Tracker',
  description: 'Daily habit tracking with streaks, heatmaps, and reminders.',
  pages: [
    { name: 'Dashboard', route: '/', description: 'Today’s habits with streaks', components: ['HabitList', 'StreakBadge'] },
    { name: 'History', route: '/history', description: 'Completion heatmap', components: ['Heatmap'] },
    { name: 'Settings', route: '/settings', description: 'Reminders and account', components: ['ReminderForm'] },
  ],
  data_models: [
    { name: 'Habit', fields: [{ name: 'title', type: 'string', required: true }, { name: 'cadence', type: 'string', required: true }] },
    { name: 'Completion', fields: [{ name: 'habit_id', type: 'string', required: true }, { name: 'date', type: 'date', required: true }] },
  ],
  api_endpoints: [
    { method: 'GET', path: '/api/habits', description: 'List habits', auth_required: true },
    { method: 'POST', path: '/api/habits', description: 'Create habit', auth_required: true },
    { method: 'POST', path: '/api/habits/:id/complete', description: 'Mark complete', auth_required: true },
  ],
  features: ['Streak tracking', 'Daily reminders', 'Completion heatmap'],
  integrations: [],
  auth_required: true,
}

const BUSINESS_MODEL = {
  target_user: 'People building routines who abandon generic todo apps',
  pricing: 'Freemium — unlimited habits on the paid tier',
  retention_lever: 'Streaks and a daily reminder loop',
  risks: ['Crowded market; differentiation must come from simplicity'],
}

const DESIGN = {
  direction: 'Calm, dark, single-accent interface centered on today',
  theme: { mode: 'dark', accent: '#7C5CFF', font: 'Inter' },
  components: ['HabitList', 'StreakBadge', 'Heatmap', 'ReminderForm'],
}

const CLARIFY_QUESTIONS = [
  'Is this just for you, or will other people sign up too?',
  'Should reminders arrive by email, push notification, or both?',
]

/**
 * Drives a build's event sequence into `dispatch` (the store's handleEvent)
 * on realistic timers — including the interactive gates the live pipeline
 * emits: it pauses at each gate_request until the store's pendingGate clears
 * (the user clicking Approve/Send answers in the demo just clears it — see
 * buildStore.respondGate). Returns a cancel function.
 */
export function runMockBuild(buildId: string, dispatch: (event: AnyWSEvent) => void): () => void {
  let cancelled = false
  let timer: number | undefined

  const sleep = (ms: number) =>
    new Promise<void>(resolve => {
      timer = window.setTimeout(resolve, ms)
    })

  const base = { build_id: buildId }
  const send = (event: AnyWSEvent) => {
    if (!cancelled) dispatch(event)
  }

  const gate = async (agent: string, stage: string, kind: 'approval' | 'questions', questions: string[] = []) => {
    send({
      ...base,
      type: 'gate_request',
      data: { gate_id: `mock-${stage}`, stage, agent, kind, questions, timeout_seconds: 180 },
    })
    while (!cancelled && useBuildStore.getState().pendingGate) {
      await sleep(150)
    }
    // Cancelled via the gate's "Cancel build" button ends the run.
    return !cancelled && useBuildStore.getState().status !== 'failed'
  }

  ;(async () => {
    await sleep(300)
    send({ ...base, type: 'agent_start', data: { agent: 'architect' } })
    await sleep(700)

    if (!(await gate('architect', 'clarify', 'questions', CLARIFY_QUESTIONS))) return
    await sleep(600)
    send({ ...base, type: 'agent_update', data: { agent: 'architect', message: 'Architecture blueprint created' } })
    send({ ...base, type: 'agent_output', data: { agent: 'architect', output: BLUEPRINT } })
    send({ ...base, type: 'agent_complete', data: { agent: 'architect', files_changed: [] } })
    if (!(await gate('architect', 'architect', 'approval'))) return

    send({ ...base, type: 'agent_start', data: { agent: 'business_improver' } })
    await sleep(800)
    send({ ...base, type: 'agent_output', data: { agent: 'business_improver', output: BUSINESS_MODEL } })
    send({ ...base, type: 'agent_complete', data: { agent: 'business_improver', files_changed: [] } })
    if (!(await gate('business_improver', 'business_improver', 'approval'))) return

    send({ ...base, type: 'agent_start', data: { agent: 'designer' } })
    await sleep(800)
    send({ ...base, type: 'agent_output', data: { agent: 'designer', output: DESIGN } })
    send({ ...base, type: 'agent_complete', data: { agent: 'designer', files_changed: ['src/styles.css'] } })
    if (!(await gate('designer', 'designer', 'approval'))) return

    send({ ...base, type: 'agent_start', data: { agent: 'developer' } })
    for (const token of chunkTokens(COUNTER_FILE_V1)) {
      await sleep(35)
      send({ ...base, type: 'stream_token', data: { agent: 'developer', token } })
    }
    await sleep(150)
    send({
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
    send({ ...base, type: 'debug_start', data: { iteration: 1, errors: ["TypeError: Cannot read properties of undefined (reading 'value')"] } })
    for (const token of chunkTokens(COUNTER_FILE_V2)) {
      await sleep(30)
      send({ ...base, type: 'stream_token', data: { agent: 'developer', token } })
    }
    await sleep(150)
    send({
      ...base,
      type: 'file_update',
      data: { delta: { changed: { 'src/components/Counter.tsx': COUNTER_FILE_V2 }, deleted: [] } },
    })
    await sleep(300)
    send({ ...base, type: 'agent_complete', data: { agent: 'developer', files_changed: ['src/components/Counter.tsx'] } })

    await sleep(200)
    send({ ...base, type: 'agent_start', data: { agent: 'integration' } })
    await sleep(700)
    send({
      ...base,
      type: 'file_update',
      data: { delta: { changed: { 'src/lib/api.ts': API_FILE }, deleted: [] } },
    })
    send({ ...base, type: 'agent_output', data: { agent: 'integration', output: { instructions: 'Wired the habits API client. No external service keys needed.' } } })
    await sleep(200)
    send({ ...base, type: 'agent_complete', data: { agent: 'integration', files_changed: ['src/lib/api.ts'] } })

    await sleep(200)
    send({ ...base, type: 'agent_start', data: { agent: 'pm' } })
    await sleep(600)
    send({
      ...base,
      type: 'file_update',
      data: { delta: { changed: { 'README.md': README_FILE }, deleted: [] } },
    })
    send({ ...base, type: 'agent_output', data: { agent: 'pm', output: { score: 93, passed: true, missing_features: [] } } })
    await sleep(200)
    send({ ...base, type: 'agent_complete', data: { agent: 'pm', files_changed: ['README.md'] } })

    await sleep(400)
    send({
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
  })()

  return () => {
    cancelled = true
    if (timer !== undefined) window.clearTimeout(timer)
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
