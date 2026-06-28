# TODO - Production Readiness Sprint (Fix All QA Findings)

## Phase 1: Fix Every Reported Issue
- [x] 0. Kickoff
- [ ] 1. WebSocket Event Contract (Critical)
  - [ ] Create/centralize shared event contract (single source of truth)
  - [ ] Align event names/payload schema between frontend and backend
  - [ ] Ensure handlers for required events: agent_start, agent_update, agent_complete, build_start, build_complete, file_update, preview_update, error
  - [ ] Ensure enum serialization/field names/nullability/timestamps/IDs are consistent
  - [ ] Remove/avoid duplicate event definitions in code paths
- [ ] 2. Project Routing (High)
  - [ ] Replace hardcoded/implicit project ID with router `projectId`
  - [ ] Update store so builds/files/agents are scoped to selected project
  - [ ] Preserve UI state while switching projects
  - [ ] Reload correct project builds/files on navigation
  - [ ] Ensure WS subscription uses the correct build for the active project
- [ ] 3. WebSocket Reliability (High)
  - [ ] Reconnect automatically with exponential backoff + retry limits
  - [ ] Heartbeat with correct interval cleanup
  - [ ] Graceful disconnect + cleanup
  - [ ] Prevent duplicate subscriptions/races
  - [ ] Offline handling + recovery after backend restart
  - [ ] Malformed payload handling (never crash)
  - [ ] Connection status indicator wired to UI
  - [ ] Ensure no memory leaks / duplicate listeners
- [ ] 4. FileEditor State Management (Medium)
  - [x] Ensure no state updates during render (current: uses useEffect)
  - [ ] Ensure React StrictMode produces zero warnings (Monaco + state)
- [ ] 5. Resizable Panels (Medium)
  - [ ] Upgrade to pointer events (mouse/touch/trackpad)
  - [ ] Keyboard accessibility + ARIA
  - [ ] Smooth collapse animations
  - [ ] Panel persistence (localStorage)
  - [ ] Min/max width enforcement

## Phase 3: React Cleanup
- [ ] Remove unused imports/dead code
- [ ] Fix TS/ESLint/React warnings (including StrictMode)
- [ ] Ensure clean browser console

## Phase 4: Performance
- [ ] Memoize expensive computations/selectors
- [ ] Reduce unnecessary store updates/re-renders
- [ ] Optimize Monaco/editor/file rendering paths
- [ ] Ensure WebSocket updates don’t trigger full rerenders

## Phase 5-7: UI Polish, Error Handling, Production Hardening
- [ ] UI spacing/hover/focus/loading/empty states
- [ ] Network/backend unavailable recovery
- [ ] Environment variable & security hardening
- [ ] Error boundaries + graceful fallbacks

## Phase 8: Testing
- [ ] Run app and validate scenarios (multi builds/sessions, refresh, route changes, cancel/restart)
- [ ] Run another QA audit until every feature verified

