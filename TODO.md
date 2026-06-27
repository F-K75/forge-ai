# TODO - Forge UI Redesign

## Step 1: Repo understanding
- [x] Read key layout/store components
- [x] Identify UI files to modify (WorkspaceLayout, PromptBox, PreviewPanel, ActivityFeed, AgentPipeline, FileEditor, theme)

## Step 2: Implement premium layout foundations
- [x] Refactor `WorkspaceLayout.tsx` toward a 3-column resizable design (left sidebar, center workspace, right preview)
- [x] Update center workspace to use upgraded `PromptBox` + `ActivityFeed` composition
- [x] Upgrade `PreviewPanel.tsx` with polished header, device selector UI (UI-only if no backend support)

## Step 3: Add premium UI details
- [ ] Replace mock recent activity with a timeline component (UI-only formatting using store when available)
- [ ] Improve agents sidebar to match design language (colors, progress, expandable rows if data exists)
- [ ] Add build progress timeline stage UI (Planning/Backend/Frontend/Testing/Deployment)

## Step 4: Bottom dock & AI Console
- [x] Wire dock tab `Console` to render `<AiConsole />`
- [x] Replace dock placeholders for other tabs (Terminal/Logs/AI Logs/Git/Testing/Build/Network/Search) with premium content
- [x] Implement AI Console search/filter + auto-scroll polish (UI-only)

## Step 5: Polish
- [x] Update `index.css` for glass, focus rings, reduced motion handling
- [x] Ensure responsiveness + keyboard accessibility

## Step 6: Validate
- [x] Run frontend build/dev
- [ ] Verify websocket UI updates still render after full redesign

