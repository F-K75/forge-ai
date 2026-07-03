import type { AnyWSEvent } from './wsContract'

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

interface ScheduledEvent {
  delay: number
  event: AnyWSEvent
}

/**
 * Builds the full mocked event timeline for a build run. Every event here
 * is a real, typed AnyWSEvent dispatched through the same handler the live
 * socket uses — swapping this for useBuildSocket requires no UI changes.
 */
function buildTimeline(buildId: string): ScheduledEvent[] {
  const events: ScheduledEvent[] = []
  let t = 0
  const at = (delay: number, event: AnyWSEvent) => {
    t += delay
    events.push({ delay: t, event })
  }
  const base = { build_id: buildId }

  at(300, { ...base, type: 'agent_start', data: { agent: 'architect' } })
  at(900, { ...base, type: 'agent_complete', data: { agent: 'architect', files_changed: ['src/App.tsx', 'src/main.tsx'] } })

  at(200, { ...base, type: 'agent_start', data: { agent: 'designer' } })
  at(800, { ...base, type: 'agent_complete', data: { agent: 'designer', files_changed: ['src/styles.css'] } })

  at(200, { ...base, type: 'agent_start', data: { agent: 'developer' } })
  for (const token of chunkTokens(COUNTER_FILE_V1)) {
    at(35, { ...base, type: 'stream_token', data: { agent: 'developer', token } })
  }
  at(150, {
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

  at(400, { ...base, type: 'debug_start', data: { iteration: 1, errors: ["TypeError: Cannot read properties of undefined (reading 'value')"] } })
  for (const token of chunkTokens(COUNTER_FILE_V2)) {
    at(30, { ...base, type: 'stream_token', data: { agent: 'developer', token } })
  }
  at(150, {
    ...base,
    type: 'file_update',
    data: { delta: { changed: { 'src/components/Counter.tsx': COUNTER_FILE_V2 }, deleted: [] } },
  })
  at(300, { ...base, type: 'agent_complete', data: { agent: 'developer', files_changed: ['src/components/Counter.tsx'] } })

  at(200, { ...base, type: 'agent_start', data: { agent: 'integration' } })
  at(700, {
    ...base,
    type: 'file_update',
    data: { delta: { changed: { 'src/lib/api.ts': API_FILE }, deleted: [] } },
  })
  at(200, { ...base, type: 'agent_complete', data: { agent: 'integration', files_changed: ['src/lib/api.ts'] } })

  at(200, { ...base, type: 'agent_start', data: { agent: 'pm' } })
  at(600, {
    ...base,
    type: 'file_update',
    data: { delta: { changed: { 'README.md': README_FILE }, deleted: [] } },
  })
  at(200, { ...base, type: 'agent_complete', data: { agent: 'pm', files_changed: ['README.md'] } })

  at(400, {
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

  return events
}

/**
 * Drives a build's event sequence into `dispatch` (the store's handleEvent)
 * on realistic timers. Returns a cancel function to clear pending timers
 * on unmount or buildId change.
 */
export function runMockBuild(buildId: string, dispatch: (event: AnyWSEvent) => void): () => void {
  const timeline = buildTimeline(buildId)
  const timeoutIds = timeline.map(({ delay, event }) =>
    window.setTimeout(() => dispatch(event), delay)
  )
  return () => {
    timeoutIds.forEach(id => window.clearTimeout(id))
  }
}
