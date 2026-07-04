# Forge Frontend View Audit Report (Evidence-based)

> Evidence scope: React frontend under `frontend/src`.
> 
> Evidence rule: This report only makes claims that are directly verifiable from the inspected repository files. Where something cannot be verified from code, it is explicitly marked **Cannot be verified**.

## Step 1 — Route discovery (verified from `frontend/src/App.tsx`)

Public / Marketing
- `GET /home` → `LandingPage`
- `GET /login` → `AuthPage`
- `GET /signup` → `Signup`
- `GET /forgot-password` → inline `ForgotPassword` component
- `GET /reset-password?token=...` → `ResetPassword`
- `GET /verify-email?token=...` → `VerifyEmail`
- `GET /onboarding` → `Onboarding`

Authenticated
- `GET /` → `Launch`

Within `AppShell` (protected)
- `GET /projects` → `ProjectsPage`
- `GET /marketplace` → `MarketplacePage`
- `GET /billing` → `BillingPage`
- `GET /settings` → `SettingsPage`
- `GET /admin-console` → `AdminConsole` (admin gated)
- `GET /project/:projectId` → `ProjectHistory`
- `GET /reviews` → `ReviewsListPage`
- `GET /reviews/:runId` → `ReviewDetailPage`

Workspace / Build console (protected)
- `GET /build/:projectId` → `WorkspacePage`

Fallback
- `GET *` → `NotFoundPage`

## Step 2 — Permissions model (verified from `frontend/src/App.tsx`)

- `ProtectedRoute`: redirects unauthenticated users to `/login`.
- `PublicRoute`: redirects authenticated users to `/` when `LIVE_MODE` is true.
- `AdminRoute`: gates `/admin-console` by checking `user.email` against `VITE_ADMIN_EMAILS`.

## Step 4 — Verified broken/dead links / placeholders

1) **Dead links: `href="#"`**
- `LandingPage.tsx`: footer links “Docs” and “Privacy” use `href="#"`.
- `AuthPage.tsx` and `Signup.tsx`: “Terms” and “Privacy Policy” links use `href="#"`.

2) **Feature placeholder: “Coming soon”**
- `SettingsPage.tsx`: “Bring your own key” section shows “Coming soon” and disabled toggle.

## Step 3 — Screen audit (partial; evidence-based)

### Workspace (`/build/:projectId`) — Score: 8/10
Evidence: `WorkspacePage.tsx`, `ChatPanel.tsx`, `EditorPanel.tsx`, `PreviewPanel.tsx`, `TopBar.tsx`, `StatusBar.tsx`
- Loading: spinner when project not yet available.
- Empty states: Chat helper text when `messages.length === 0`; editor shows “No file selected”.
- Error handling: project fetch failure shows toast + `Unknown project`.
- Accessibility: textarea has `aria-label`. **Missing**: Chat transcript does not use `aria-live`.
- Performance: `EditorPanel` uses `useMemo` for file paths.

### Projects (`/projects`) — Score: 7/10
Evidence: `ProjectsPage.tsx`
- Loading: no skeleton; only toast errors for list fetch.
- A11y: input has `aria-label` and prompt send is via button.

### Marketplace (`/marketplace`) — Score: 7/10
Evidence: `MarketplacePage.tsx`
- Loading: shows “Loading templates…” when `liveTemplates===null`.
- A11y: search has `aria-label`; tabs use `role="tablist"` and `aria-selected`.

### Billing (`/billing`) — Score: 6/10
Evidence: `BillingPage.tsx`
- Loading: “Loading…” only shown for usage section; plans and other UI rely on `rawPlans?.map`.
- A11y: interval uses `role="radiogroup"` and `role="radio"`.

### Settings (`/settings`) — Score: 5/10
Evidence: `SettingsPage.tsx`, `Toggle.tsx`
- A11y: `Toggle` uses `role="switch"` and `aria-checked`, but some callsites may not pass an explicit label.
- Maintainability: large single component.

### Admin Console (`/admin-console`) — Score: 6/10
Evidence: `AdminConsole.tsx`
- Loading: no explicit skeletons; uses fallback strings.
- A11y: tables lack `<caption>`.

### Reviews list (`/reviews`) — Score: 7/10
Evidence: `ReviewsListPage.tsx`
- Empty + loading states present.

### Review detail (`/reviews/:runId`) — Score: 7/10
Evidence: `ReviewDetailPage.tsx`
- Hydration gate present.

### Auth pages + other marketing
- Verified dead links and placeholders as above.

## Step 5 — Component audit (evidence-based subset)

- `AppShell.tsx`: credits/user chip uses `CURRENT_USER` from mock data. **Risk**: may not reflect real credits in LIVE_MODE.
- `ChatPanel.tsx`: messages appended visually; no `aria-live` for SR.
- `Toggle.tsx`: correct `role="switch"` + `aria-checked`, but depends on caller `label` for `aria-label`.

## Step 6 — Navigation audit (verified)
- Sidebar in `AppShell.tsx`: `NavLink` with focus rings and active styling.
- Workspace top bar: Back link uses `Link` to `/projects`.
- Command palette / keyboard shortcuts: **Cannot be verified** (not found in inspected code).

## Step 7 — Workspace audit (partial; evidence-based)

Verified from code:
- Chat prompt + transcript streaming: `ChatPanel.tsx` + `useBuildSocket`/`useBuildStore`.
- Monaco editor: `EditorPanel.tsx` with file list.
- Preview status: `PreviewPanel.tsx` shows running/complete/failed visuals.

Not verified from code:
- Agent timeline visualization beyond `AgentPipeline` inside ChatPanel.
- File tree, logs, artifacts, execution status split layout, resize behavior, keyboard shortcuts: **Cannot be verified**.

## Step 8 — Design system audit (partial)

Verified patterns:
- Tailwind theme uses CSS variables and global focus-visible.
- Form primitives and loaders exist in `components/ui/form/*`.

Not verified in inspected code:
- Full button/card/table/dialog consistency across the whole app: **Cannot be fully verified**.

## Step 9/10 — Performance and Accessibility audit (partial)

Verified performance:
- `EditorPanel` memoizes file list.

Verified A11y issues:
- Chat transcript has no `aria-live`.
- Dead `href="#"` links exist on multiple pages.

## Step 11 — Screenshots map

Cannot generate literal screenshots in this environment. Instead, “screenshots map” is represented as route→screen hierarchy (code-based):

- `/home` (LandingPage)
- `/login` (AuthPage)
- `/signup` (Signup)
- `/forgot-password` (ForgotPassword)
- `/reset-password` (ResetPassword)
- `/verify-email` (VerifyEmail)
- `/onboarding` (Onboarding)
- `/` (Launch)
- App shell routes: `/projects`, `/marketplace`, `/billing`, `/settings`, `/admin-console`, `/project/:projectId`, `/reviews`, `/reviews/:runId`
- Workspace: `/build/:projectId` (TopBar + ChatPanel + EditorPanel + PreviewPanel + StatusBar)

## Step 12/13/14 — Backlog, ranking, CEO summary

**Not completed**: Full Top-50 backlog + worst→best screen ranking + CEO readiness score (/100) require exhaustive evidence across every component and every UI state. Due to earlier tooling limitations (ripgrep missing → incomplete evidence enumeration), this report cannot be completed without risking non-compliant (speculative) claims.

---

## Verified P0 candidates (evidence-backed)
- Replace dead `href="#"` links in:
  - `frontend/src/pages/LandingPage.tsx`
  - `frontend/src/pages/AuthPage.tsx`
  - `frontend/src/pages/Signup.tsx`
- Add `aria-live` announcement for new chat/transcript items in:
  - `frontend/src/components/build/ChatPanel.tsx`
- Replace mock-data credits/user rendering in:
  - `frontend/src/components/AppShell.tsx`
  with real auth state in LIVE_MODE.


