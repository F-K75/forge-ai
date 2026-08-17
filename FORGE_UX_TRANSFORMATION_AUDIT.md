# Forge UX Transformation Audit

Complete product experience audit executed against the World-Class Product UX
prompt: every page, workflow, component, interaction, and user-facing string.
All changes preserve functionality — no APIs, backend logic, DB models,
features, business rules, or routes were modified.

## 1. Design system decisions

| Decision | Choice | Rationale |
|---|---|---|
| Corner radius | **0px everywhere** (square) | Owner's explicit preference ("i dont like curved corners") overrides the prompt's "rounded corners" line. Applied via `tailwind.config.ts` (all named radii → `0`) + removal of literal `rounded-full` on pills/chips/toggles/badges. `rounded-full` kept **only** for dots: status/signal lights, avatars, spinners, orbit rings, LaunchGlobe. |
| Radius tokens | `layout.radiusXs..radiusXl`, `radius.sm/md/lg` → 0; `radiusFull` stays 9999 | Single source of truth in `designTokens.ts`. |
| Component corners | Toggle tracks square, thumbs round; progress tracks square; segmented controls square; scrollbar square; `.os-window` square | Matches the square language while preserving affordance of circular thumb/dots. |
| Typography | `font-display` headings, sentence case everywhere, no ALL-CAPS marketing | Apple-style editorial hierarchy. |
| Color | Dark-first, teal `#14B8A6` + lime `#84CC16` accents, agent hues | Existing system preserved. |

## 2. UX writing patterns (standardized)

- **Errors**: "Couldn't <do X>. <one-line why, if known>. Please try again." — calm, action-oriented, never raw exception text.
- **Empty states**: What → why → what to do next → one primary action.
- **Toasts**: `Couldn't <verb>…` for failures; short past-tense confirmation for success.
- **Loading**: "…" suffixed gerunds ("Preparing your workspace…", "Generating plan…").
- **No developer strings in UI**: all `VITE_*`/`localhost` references removed from user-facing text (demo-mode notices now read "Demo mode — connect a backend…").
- **Weak verbs eliminated**: bare "Generate"/"Submit"/"Continue" replaced with outcome verbs ("Start building", "Create release", "Generate plan", "Launch to production").

## 3. Per-screen audit

### Landing page (`/home`, `LandingPage.tsx`)
- **Audit**: Marketing copy already Apple/Stripe-grade (SectionHeads: "From prompt to production, one handoff at a time.", "Built for real work.", "Because shipping is the point."). Risk: over-editing would dilute voice.
- **Applied**: surgical only — nav CTA + pill corners squared, punctuation/emphasis fixes, left comparison table intact.
- **Recommendations**: add one product screenshot section between "How it works" and "Features" once the build workspace is visually stable (prompt asks for visuals every 300–500 words); the page already carries the fleet globe, orbit animation, pipeline stages, and pricing cards.

### Launch / Flow (`/launch`, `/flow`)
- **Applied**: "Start a build" (was "Start your first build"); fleet tracks and command bar squared; agent signals kept circular; credit hint preserved.
- **Recommendation**: none blocking — the animated fleet pipeline is the visual storytelling.

### Auth (Signup / AuthPage / ForgotPassword / ResetPassword / VerifyEmail)
- **Applied**: "Welcome back" + "Sign in to pick up where you left off."; signup benefit list ("Six specialist agents, one prompt", "Free tier includes 10 credits", "Cancel or upgrade anytime"); human error strings; "Check your email" states; icon tiles squared; password strength bars squared.
- **Note**: three `Signup.tsx` class tweaks (tiles, strength bars) were reverted because the git-secrets pre-commit scanner false-positives on `validatePassword` function-name assignments; the tiles still render square via the radius config. Optionally add a scanner allowlist entry (mirroring the existing `_ROUTE_NAME_REF` allowance) to re-apply the literal class edits.

### Onboarding (`/onboarding`)
- **Applied**: "Six specialized agents collaborate to plan, build, and ship your app. Setup takes about two minutes."; "You have 10 free credits to start building."; welcome header, workspace-ready state, step circles squared.

### App shell (dock + top bar)
- **Applied**: dock labels standardized (`Projects`, `Flow`, `Initiatives`, `Reviews`, `Marketplace`, `Settings`); account chip + skip-to-content link squared; window/command palette square; notifications bell polish.
- **Recommendation**: dock already ≤ 7 items — do not grow.

### Projects home (`/projects`)
- **Applied**: empty state "No projects yet — describe what you want to build above. Forge plans, codes, and ships it."; search input + filter buttons + segmented control squared; error toasts ("Couldn't load your projects. Check your connection and try again.", "Couldn't start that build. Please try again.").

### Build workspace (`/build/…`)
- **Applied**: TopBar status pill + hamburger squared; ChatPanel gate banner, agent tiles, composer, "Auto-approve all future gates", download/artifact tooltips; EditorPanel ("Preparing your workspace…", empty file pane "Files will appear here as they're generated."); PreviewPanel Live chip + sandbox frame; StatusBar tokens/credits labels; DeployButton toast "Couldn't start the deployment."; StatusBar demo-mode label humanized.
- **Copy already strong**: plan/architecture/design/implementation/integration/review phases left as-is.

### Initiatives & PM (`/initiatives`, tabs)
- **Applied**: page headline, "Describe a product to plan end-to-end…" input, CTA "Generate plan", credit preview; empty states ("No initiatives yet — describe an idea above to generate your first plan." + "Create your first initiative"); Kanban/Sprints/Releases/AgentRuns/Integrations/Overview/Analytics/Roadmap/Graph/Activity tabs — all toasts and empty panes rewritten ("No brief generated yet.", "PRD hasn't been generated yet.", "No epics/stories/tasks generated yet.", "Nothing generated yet."); Releases: "Create release" + "No releases yet. Create your first release above."; demo-mode notices humanized; InitiativeLayout: project selection, credits header, "Open build workspace", status pill, back navigation.

### Reviews (`/reviews`, detail)
- **Applied**: all 7 toasts polished; mode buttons now "Full review" / "Diff" (was raw `full`/`diff`); empty state "No review runs yet"; run-id title kept mono; status badges squared.

### Marketplace (`/marketplace`)
- **Applied**: subtitle "Pre-built starters from Forge and the community. Install one to open it as a project."; empty search "No templates match your search. Try a different term."; toasts ("Couldn't load the marketplace…", "Couldn't install that template…"); chips squared.

### Billing (`/billing`)
- **Applied**: 3 toasts rewritten; badges squared; plan/credit summary headings consistent; "demo mode" no-op note kept internal (comment).

### Settings (`/settings`)
- **Applied**: 12 toasts rewritten (profile, password, API keys, appearance, notifications, danger zone); form labels consistent.

### Admin surfaces (Admin, LLM management, Prompt Studio, AI optimization, Engineering health)
- **Applied**: "Couldn't export users."; badge/table polish; headings standardized ("Admin", "LLM management", "Prompt Studio", "AI optimization", "Engineering organization"); demo-mode banners humanized.
- **Note**: these are power-user surfaces — terse table-first copy is intentional (matches Linear/GitHub admin density).

### History & shared components
- **Applied**: ProjectHistory 4 toasts; EmptyState skeleton pills squared; StatusPill squared; Toggle squared; charts tooltip glass squared; NotFoundPage copy ("This page doesn't exist or was moved.") + square icon tile.

## 4. Terminology standard (app-wide)

| Term | Use for |
|---|---|
| Project | A product build owned by the user (home page cards) |
| Build | A run of the six-agent pipeline inside a project |
| Agent | One of the six specialists (architect, business_improver, designer, developer, integration, pm) |
| Initiative | A plan produced by the PM agents |
| Review | A review run of a build's output |
| Template | Marketplace installable starter |
| Credits | Metered agent-work currency |
| Workspace | Only the IDE panel in the build view ("Preparing your workspace…") |

Removed: `workspace` as a product noun, `repo`/`repository` in user copy, bare `Generate`, `localhost`/`VITE_*` references in UI strings.

## 5. Visual storytelling

Present today: LaunchGlobe orbit, AgentFleetStrip animated fleet, agent pipeline stages (AgentPipeline, ReviewAgentPipeline), graphs (GraphTab), charts (OptimizationDashboard, AnalyticsTab), Launch cover art, Landing hero pipeline + comparison section, marketplace template art.

Deferred (needs stable product visuals): in-product screenshots between Landing "How it works" → "Features"; docs/help illustrations. Not added — no new assets were generated and the app's live animated UI already carries the storytelling load.

## 5b. Theme support pass (Apple × Google prompt)

Audit found the app already shipped the full design system (8pt spacing scale, type scale, motion tokens, elevation, glass surfaces, M3 components, focus rings, reduced-motion, 1440px max width, three themes). One real gap: **light/high-contrast modes were user-reachable but broken** — ~180 hardcoded `bg-white/[0.02-0.08]` / `border-white/[0.06-0.2]` alpha surfaces across 16 app pages were invisible on light backgrounds.

Fixed with an adaptive inlay token system:

- `tailwind.config.ts`: new `inlay` color family (`subtle`/`DEFAULT`/`hover`/`strong`).
- `index.css`: `--inlay-*` CSS vars — white-alpha in dark, black-alpha in light, stronger in both high-contrast variants.
- Swept 16 files (Projects, Initiatives, Flow, all PM tabs, AgentFleetGraph/Strip, Launch, AppShell): `bg-white/x` → `bg-inlay*`, `border-white/x` → `border-inlay*`, launch globe toggle `text-white` → `text-ink`.
- Intentional keeps: fake-browser URL pill (`PreviewPanel`), ember progress fill (`DeployButton`), accent/error button text, color swatches (`SettingsPage`).
- Verified: build passes, lint 0 errors, 45/45 tests pass.

## 6. Verification

- `npm run lint` — 0 errors (only pre-existing unused-import warnings).
- `npm run build` — passes.
- `npm test` — 45/45 pass **with** `VITE_WS_URL=` (a set `VITE_WS_URL` in `frontend/.env.local` flips `LIVE_MODE` and makes tests hit the real backend — plain `npm test` fails 6 environment-dependent tests, unrelated to this work).
- Committed: `2bcc4a6d` (43 files, square corners + copy pass). Follow-up small fixes (demo-mode strings, ReleasesTab CTA, `Generate plan` CTA) land with this audit in the next commit.

## 7. Known caveats

- git-secrets pre-commit scanner (`[Pp]assword = <ident>` pattern) false-positives on `Signup.tsx` identifiers — do not touch that file without a scanner allowlist (`_ROUTE_NAME_REF`-style entry in `scripts/git-hooks/pre-commit` **and** `.github/workflows/secret-scanning.yml`).
- Demo mode (`LIVE_MODE=false`) shows mock data; production behavior is identical except real backend/websocket wiring.