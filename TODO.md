# AI IDE UI Redesign (Forge) - TODO

## Status
0. Not started

## Approved plan (confirmed)
Premium redesign: keep all backend/APIs/business logic intact. Focus on UI/UX, responsiveness, animations, component organization, and performance.
Three-column resizable layout (Sidebar | Main Workspace | Live Preview) replacing the current activePanel-switch UX, while preserving ChatPanel/FileEditor/PreviewPanel functionality.

## Steps
1. ✅ Update TODO baseline to match confirmed scope
2. ⏳ Refactor layout skeleton: `frontend/src/components/layout/WorkspaceLayout.tsx` into three-column resizable panes
3. ⏳ Add premium left sidebar:
   - new components under `frontend/src/components/ide/sidebar/*` (workspace, agents, activity timeline)
   - wire data from `frontend/src/store/buildStore.ts`
4. ⏳ Upgrade middle workspace:
   - Prompt hero + templates + autocomplete (frontend-only)
   - AI Activity panel + Build progress timeline driven by agent/store state
   - File changes panel (“Created/Modified/Deleted”) wired from `agents[].filesChanged` + file snapshot
   - Keep ChatPanel available inside middle as a section/tab (no behavior changes)
5. ⏳ Upgrade right preview panel UI + toolbar enhancements in `frontend/src/components/preview/PreviewPanel.tsx` (UI-only)
6. ⏳ Add bottom dock scaffold (Terminal/Logs/AI Logs/Git/Testing/Build/Network/Console/Search) without breaking existing functionality
7. ⏳ Refactor styling/polish across:
   - `frontend/src/components/chat/ChatPanel.tsx`, `ChatInput.tsx`, `MessageList.tsx`, `ChatMessage.tsx` (premium cards + accessibility)
   - `frontend/src/components/chat/AgentPipeline.tsx` (agent row hierarchy)
   - `frontend/src/components/editor/FileEditor.tsx` (empty state + tree button polish)
   - `frontend/src/index.css` (tokens + missing bb-* helpers + animations)
8. ✅ Run frontend build/lint + fix TS/format issues
9. ✅ Manual verification: responsiveness, keyboard focus, hover/disabled/empty/loading states, reduced motion

## Notes / Constraints
- DO NOT change backend behavior or API contracts.
- Preserve existing logic inside ChatPanel/FileEditor/PreviewPanel; only reorganize/move them visually.


