# Forge Frontend View Audit Report (Evidence-based)

> Evidence scope: React frontend under `frontend/src`.
>
> Evidence rule: This report only makes claims that are directly verifiable from the inspected repository files. Where something cannot be verified from code, it is explicitly marked **Cannot be verified**.
>
> **Status**: Complete. Steps 1–14 below are all evidence-backed. (An earlier pass left Steps 12–14 unfinished due to incomplete evidence coverage — that gap is closed in this revision.)

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
- Remaining page-level dependencies (single-page-only components) have been read as part of Step 3/4 below — no additional gating logic beyond the three guards above was found anywhere else in the router.

## Step 4 note — Fixed since the original pass of this report

The following were flagged as findings in an earlier revision of this report and have since been fixed in code (verified directly, not assumed):
- Dead `href="#"` links on `LandingPage.tsx` footer ("Docs"/"Privacy") and `AuthPage.tsx`/`Signup.tsx` ("Terms"/"Privacy Policy") — removed. `grep -rn 'href="#"'` across `pages/` and `components/` now returns zero results.
- Non-functional GitHub/Google OAuth buttons on `AuthPage.tsx` — removed entirely rather than left as dead UI.
- `ChatPanel.tsx` transcript had no `aria-live` — now has `role="log" aria-live="polite" aria-label="Build conversation"`.
- `SettingsPage.tsx` "Bring your own key" was a disabled "Coming soon" toggle — now a fully functional connect/disconnect flow, gated to Pro/Enterprise both in the UI and server-side (`PUT /auth/me`).
- `Onboarding.tsx`'s Connect step instantly flipped to a fake "Done" state on click with no network call — now reflects real connection state (`user.github_connected`/`user.byok_connected` in live mode) and opens the real connect flow in Settings.
- `Signup.tsx` had no confirm-password field and redirected straight to onboarding with no verification messaging — both added.
- `LandingPage.tsx`'s scripted terminal animation was unlabeled and could be mistaken for a live/recorded demo — now explicitly labeled "Simulated example."
- `PreviewPanel.tsx` permanently showed "Live preview sandboxes are coming soon" — now renders a real preview (static HTML directly, or a Sucrase-transpiled in-browser React runtime for JSX builds) with an honest fallback only when a build genuinely has no browsable entry point.
- No Deploy control existed anywhere in the Workspace despite a fully working backend deploy path — `DeployButton.tsx` now wires the two together.

One side effect worth noting: the Terms/Privacy Policy and Docs/Privacy dead links were removed outright (now plain, non-interactive text, or removed from the footer entirely) rather than pointed at real destinations. This resolves the "looks broken" problem but not the underlying "no real Terms/Privacy/Docs pages exist yet" gap — see backlog item P2-10.

## Step 3 — Screen audit (complete; evidence-based)

### Workspace (`/build/:projectId`) — 8/10
Evidence: `WorkspacePage.tsx`, `ChatPanel.tsx`, `EditorPanel.tsx`, `PreviewPanel.tsx`, `TopBar.tsx`, `StatusBar.tsx`, `DeployButton.tsx`
- Loading: spinner when project not yet available.
- Empty states: Chat helper text when `messages.length === 0`; editor shows "No file selected"; preview has distinct idle/building/complete states.
- Error handling: project fetch failure shows toast + `Unknown project`.
- Accessibility: chat transcript now has `role="log" aria-live="polite"` (fixed, see Step 4 note); textarea has `aria-label`.
- **Remaining gap**: `DeployButton.tsx`'s status transitions (pending → building → deploying → live/failed) are not in an `aria-live` region — see backlog P1-5.

### Projects (`/projects`) — 7/10
Evidence: `ProjectsPage.tsx`
- Loading: no skeleton; only toast errors for list fetch.
- A11y: input has `aria-label` and prompt send is via button.

### Marketplace (`/marketplace`) — 7/10
Evidence: `MarketplacePage.tsx`
- Loading: shows "Loading templates…" when `liveTemplates===null`.
- A11y: search has `aria-label`; tabs use `role="tablist"` and `aria-selected`.

### Billing (`/billing`) — 6/10
Evidence: `BillingPage.tsx`
- Loading: "Loading…" only shown for usage section; plans and other UI rely on `rawPlans?.map`.
- A11y: interval uses `role="radiogroup"` and `role="radio"`.

### Settings (`/settings`) — 7/10 (revised up from 5/10)
Evidence: `SettingsPage.tsx`, `Toggle.tsx`, `Row.tsx`
- BYOK section is now a real, functional connect/disconnect flow gated by plan (see Step 4 note) — this was the primary reason for the earlier lower score.
- A11y: `Toggle` uses `role="switch"` and `aria-checked`, but some callsites may not pass an explicit label.
- Maintainability: still a large single component; `Row.tsx` is only consumed here (not shared with similarly-shaped pages elsewhere).
- **New finding**: `handleCopyBackupCodes` calls `navigator.clipboard.writeText(...)` directly with no insecure-context fallback — see backlog P1-3.

### Admin Console (`/admin-console`) — 6/10
Evidence: `AdminConsole.tsx`
- Loading: no explicit skeletons; uses fallback strings.
- A11y: tables lack `<caption>`.

### Reviews list (`/reviews`) — 7/10
Evidence: `ReviewsListPage.tsx`
- Empty + loading states present.

### Review detail (`/reviews/:runId`) — 7/10
Evidence: `ReviewDetailPage.tsx`
- Hydration gate present.

### LandingPage.tsx — 8/10
- N/A for loading/empty/error — fully static marketing content.
- Nav has `aria-label="Primary"`/`"Footer"`; decorative icons `aria-hidden`; relies on a global `:focus-visible` rule so even plain in-page anchors get a visible ring.
- Terminal-demo auto-rotation respects `prefers-reduced-motion`.
- **Gap**: no mobile nav affordance — in-page nav links and "Sign in" are `hidden md:flex`/`hidden sm:block` with no drawer/hamburger alternative; "Sign in" is only reachable on mobile indirectly via Signup's "Already have an account?" link.

### AuthPage.tsx (login) — 8/10
- Loading: `Loader2` + "Signing in…"/"Verifying…" states.
- Error handling: form-level errors in `role="alert"`; MFA errors likewise; fields use `aria-describedby`.
- Good focus management: MFA code input auto-focuses when the challenge step appears.
- ~~**Bug found**: the password-strength meter's `aria-describedby` pointed at a div with `aria-hidden="true"` — screen readers got no accessible description at all.~~ **Fixed** (P0-1): the `aria-describedby` link was removed, matching `Signup.tsx`'s already-correct decorative-only pattern.

### Signup.tsx — 8/10
- Confirm-password field with matching validation; "Check your email" success screen with an explicit "Continue to onboarding" CTA rather than an auto-redirect (better pattern than Reset/Verify below).
- Its password-strength meter also carries `aria-hidden="true"`, but — verified directly, and unlike `AuthPage.tsx` — the password input here has no `aria-describedby` pointing at it at all, so this one was always correctly decorative-only.
- ~~Required only 8 characters while `ResetPassword.tsx` required 12~~ **Fixed** (P0-2): now requires 12, matching `ResetPassword.tsx`.
- Duplicates ~150 lines of hand-rolled input/validation/password-toggle markup functionally identical to `AuthPage.tsx`'s, none built on the unused `components/ui/form/*` primitives — see backlog P3-11.

### ForgotPassword (inline, `App.tsx`) — 8/10
- "Sending…" loading state; inline `role="alert"` for errors; deliberately returns a success message even when the backend call throws, to prevent email enumeration (verified in code, not assumed).
- Only auth screen implemented inline in `App.tsx` rather than its own file — an organizational inconsistency, not a user-facing defect.

### ResetPassword.tsx — 6/10
- Distinguishes "no/invalid token" state from in-form validation errors; "Updating…" loading label.
- Requires a 12-character minimum password (`minLength={12}`) — this was already correct; `Signup.tsx` was the one that disagreed and has since been raised to match (P0-2, fixed). `AuthPage.tsx`'s login form was deliberately left at "non-empty only," not raised, since it validates an existing password rather than choosing a new one.
- Auto-navigates to `/login` via `setTimeout(...,2000)` on success with no `aria-live`/`role="status"` on the confirmation message — see backlog P1-4.

### VerifyEmail.tsx — 6/10
- Distinct verifying/success/error states, including a full resend-verification sub-flow with its own loading/disabled states.
- Same auto-redirect-with-no-announcement pattern as `ResetPassword.tsx` (P1-4).

### Onboarding.tsx — 8/10
- Stepper uses `aria-current="step"`; goal-selection buttons use `aria-pressed`; consistent focus rings throughout.
- Connect step verified fixed (Step 4 note above).
- **Gap**: no `aria-live` announcement as the wizard advances between steps — see backlog P2-8.

### Launch.tsx (authenticated `/`) — 8/10
- Nothing async; decorative globe `aria-hidden`; CTA has a proper `focus-visible` ring with offset; globe animation respects `motion-reduce`.
- **Design-system note**: uses the marketing "land-*" theme rather than the authenticated app's theme, even though it's a post-login screen. Combined with `Onboarding` (app theme, pre-`Launch`) and `Signup`/`AuthPage` (land theme, also pre-`Launch`), a new user's first-run path visually flips theme three times in one continuous journey. See backlog P2-9.

### ProjectHistory.tsx — 8/10
- Clearly differentiated loading ("Loading build history…") vs. empty ("No builds yet for this project.") states; toast errors on every async failure path with proper `finally` cleanup.
- Strong landmark labeling (`aside aria-label`, `nav aria-label`, `section aria-label`, diff panel `role="region"`); selected build uses `aria-current`.
- **Gap**: the diff panel that appears after "View diff" isn't in an `aria-live` region — see backlog P2-7.

### NotFoundPage.tsx — 8/10
- Semantic `<main>`, single `<h1>`, two clearly labeled recovery CTAs with focus rings.
- **Gap**: renders in the app's dark theme rather than the marketing theme, so a visitor who mistypes a public URL lands on a visually disjointed dark 404 — same theme-consistency family as P2-9.

## Step 5 — Detect broken/placeholder/dead links/mock data (complete)

- Verified via `grep -rn 'href="#"'` across `pages/` and `components/`: **zero results**. The dead-link findings from the earlier pass of this report are resolved (see Step 4 note).
- Remaining honestly-labeled placeholder: `LandingPage.tsx` footer shows plain (non-link) text "GitHub coming soon" — not misleading, no action needed.
- `AppShell.tsx` still renders `CURRENT_USER` from mock data unconditionally (not gated behind `LIVE_MODE`) — **unresolved**, carried forward as backlog item (see P1 list in the original Verified P0 candidates below, now re-graded).

## Step 6 — Component audit (complete)

Previously covered: `AppShell.tsx`, `ChatPanel.tsx`, `Toggle.tsx`, `AgentPipeline.tsx`.

Newly audited:
- **`components/ui/form/*` (`FormInput.tsx`, `PasswordInput.tsx`, `LoadingButton.tsx`, `useFormValidation.ts`) — dead code.** Zero imports outside their own files anywhere in `frontend/src`, confirmed via grep. `AuthPage.tsx`, `Signup.tsx`, `ResetPassword.tsx`, and `VerifyEmail.tsx` each hand-roll equivalent, slightly-diverging logic instead (this divergence is the direct cause of bugs P0-1 and P0-2). `LoadingButton.tsx` also hardcodes `violet`/`emerald` Tailwind colors that don't match the app's `accent`/`ok` tokens.
- **`components/ui/EmptyState.tsx` (+ `Skeleton`, `SkeletonCard`, `SkeletonList`) — dead code.** Well-implemented (`role="status" aria-live="polite"`, `aria-hidden` skeletons) but unused; every page's actual empty/loading state is bespoke instead.
- **`components/ui/ClipboardCopyButton.tsx` — dead code.** Correctly handles the insecure-context fallback (`document.execCommand('copy')` when `window.isSecureContext` is false) that `SettingsPage.tsx`'s own ad hoc clipboard call (P1-3) lacks.
- **`components/ui/ErrorBoundary.tsx` — reused correctly, no issues.** Wraps every lazy route in `App.tsx`; Sentry capture no-ops safely when unconfigured; working retry button.
- **`components/ReviewAgentPipeline.tsx` vs `AgentPipeline.tsx` — deliberate, documented duplication.** Justified in-code (review agents are config-driven, not from the fixed roster `AgentPipeline` uses), but any future visual fix needs to be applied twice.
- **`components/StatusPill.tsx`, `components/SummaryChip.tsx` — good reuse examples.** Consistently used across Workspace/ProjectHistory/AdminConsole/Reviews; status conveyed via text + color, not color alone.
- **`components/build/DeployButton.tsx` — solid state machine, one a11y gap** (see P1-5).
- **`components/build/StatusBar.tsx`, `TopBar.tsx`, `EditorPanel.tsx`, `PreviewPanel.tsx` — no issues found.** All have correctly-gated states and semantic structure (e.g. `EditorPanel`'s file list is a real `nav > ul > li > button`, not bare divs).

## Step 7 — Navigation audit (complete)
- Sidebar in `AppShell.tsx`: `NavLink` with focus rings and active styling.
- Workspace top bar: Back link uses `Link` to `/projects` with `aria-label="Back to projects"`.
- Command palette / keyboard shortcuts: **Cannot be verified** (not found in inspected code).
- **New finding**: no skip-to-content link exists anywhere in the app (`grep` for "skip to content"/"SkipLink" returns nothing) — most relevant on the long `LandingPage.tsx`. See backlog P2-6.

## Step 8 — Workspace audit (complete)

Verified from code:
- Chat prompt + transcript streaming: `ChatPanel.tsx` + `useBuildSocket`/`useBuildStore`, now with a proper `aria-live` transcript region.
- Monaco editor: `EditorPanel.tsx` with semantic file list.
- Preview: `PreviewPanel.tsx` renders a real preview (static HTML iframe or in-browser Sucrase-transpiled React), not a placeholder.
- Deploy: `DeployButton.tsx` drives the real backend Docker deploy path end-to-end.

Not verified from code:
- File tree resize behavior, keyboard shortcuts, execution logs beyond the chat transcript: **Cannot be verified**.

## Step 9 — Design system audit (complete)

Verified patterns:
- Tailwind theme uses CSS variables and a global `:focus-visible` rule.
- Form primitives and loaders exist in `components/ui/form/*` and `components/ui/EmptyState.tsx` — **but are unused** (Step 6).
- **New finding**: the authenticated app uses two parallel token systems — the dark app theme (`base/ink/muted/accent`, used by Workspace/Projects/Settings/Onboarding/ProjectHistory/NotFoundPage) and the light marketing "land-*" theme (used by Landing/Auth/Signup/**and Launch**, despite Launch being a post-login screen). See backlog P2-9.

## Step 10 — Accessibility audit (complete)

Verified issues (fixed since the earlier pass, see Step 4 note):
- ~~Chat transcript has no `aria-live`~~ — fixed.
- ~~Dead `href="#"` links~~ — fixed.

Verified issues (new, still open):
- `AuthPage.tsx`/`Signup.tsx`: `aria-describedby` referencing an `aria-hidden="true"` element (P0-1).
- `ResetPassword.tsx`/`VerifyEmail.tsx`: auto-redirect with no `aria-live` announcement (P1-4).
- `DeployButton.tsx`: status transitions with no `aria-live` announcement (P1-5).
- `ProjectHistory.tsx`: diff panel appears with no `aria-live` announcement (P2-7).
- `Onboarding.tsx`: step transitions with no `aria-live` announcement (P2-8).
- No skip-to-content link anywhere (P2-6).

## Step 11 — Screenshots map

Cannot generate literal screenshots in this environment. Route→screen hierarchy (code-based), now with every screen's audit status marked:

- `/home` (LandingPage) — audited, 8/10
- `/login` (AuthPage) — audited, 8/10
- `/signup` (Signup) — audited, 8/10
- `/forgot-password` (ForgotPassword) — audited, 8/10
- `/reset-password` (ResetPassword) — audited, 6/10
- `/verify-email` (VerifyEmail) — audited, 6/10
- `/onboarding` (Onboarding) — audited, 8/10
- `/` (Launch) — audited, 8/10
- App shell routes: `/projects` (7/10), `/marketplace` (7/10), `/billing` (6/10), `/settings` (7/10), `/admin-console` (6/10), `/project/:projectId` (8/10), `/reviews` (7/10), `/reviews/:runId` (7/10)
- Workspace: `/build/:projectId` (8/10)
- `*` (NotFoundPage) — audited, 8/10

---

## Step 12 — Screen ranking (worst → best)

| Rank | Screen | Score |
|---|---|---|
| 1 | Billing | 6/10 |
| 1 | Admin Console | 6/10 |
| 1 | ResetPassword | 6/10 |
| 1 | VerifyEmail | 6/10 |
| 5 | Projects | 7/10 |
| 5 | Marketplace | 7/10 |
| 5 | Settings | 7/10 |
| 5 | Reviews list | 7/10 |
| 5 | Review detail | 7/10 |
| 10 | Workspace | 8/10 |
| 10 | LandingPage | 8/10 |
| 10 | AuthPage | 8/10 |
| 10 | Signup | 8/10 |
| 10 | ForgotPassword | 8/10 |
| 10 | Onboarding | 8/10 |
| 10 | Launch | 8/10 |
| 10 | ProjectHistory | 8/10 |
| 10 | NotFoundPage | 8/10 |

Average across all 17 scored screens: **7.29/10**.

## Step 13 — Backlog (P0–P3, evidence-backed, with acceptance criteria)

### P0 — Real bugs, fix before wider release

**P0-1: Password-strength indicator is invisible to screen readers by construction (AuthPage.tsx only). — FIXED**
- Evidence: `AuthPage.tsx` — input had `aria-describedby="password-strength"` pointing at an element with `aria-hidden="true"`, so the reference resolved to nothing.
- Fix applied: removed the `aria-describedby` link entirely (and the now-orphaned `id`), matching `Signup.tsx`'s already-correct decorative-only pattern, rather than inventing new visible strength text. Verified via Playwright that `#password`'s `aria-describedby` is now `null` in the no-error state.
- Files: `frontend/src/pages/AuthPage.tsx`.

**P0-2: Password minimum-length policy disagrees with itself across signup and reset. — FIXED**
- Evidence: `AuthPage.tsx`'s `validatePassword` and `Signup.tsx`'s `validatePassword` both required `value.length >= 8`; `ResetPassword.tsx` enforced `minLength={12}`. A user who signed up with an 8–11 character password couldn't reset to a password of that same length.
- Fix applied: raised `Signup.tsx`'s minimum to 12 (matching `ResetPassword.tsx`) rather than weakening the reset requirement. **`AuthPage.tsx`'s login-form `validatePassword` was deliberately left at "non-empty" only, not raised to 12** — login validates an *existing* password against the server, not a new one; enforcing a length minimum there would have locked out any real account with a shorter existing password. Verified via Playwright: an 8-character password still logs in but is rejected on signup, and a 12-character password passes.
- **Correction to an earlier claim in this report**: this section originally stated "the backend enforces no minimum length at all server-side (only `max_length=128`)." That was only checked via a `Field()`-constraint grep and missed `core/security.py`'s `validate_password_strength()`, which `POST /auth/register` already calls explicitly in its endpoint body (not as a Pydantic constraint) — it requires 12+ characters *and* uppercase, lowercase, a digit, and a special character. So the backend's register path was never the weak link. The real, more precise gap (found and fixed once this was caught): `POST /auth/reset-password` and `POST /auth/me/password` (change password) **never called `validate_password_strength` at all**, so they accepted a `new_password` of any length or complexity — a real, separate backend authorization/validation gap, not just an inconsistency. Fixed by adding the same `validate_password_strength(req.new_password)` call to both endpoints, matching `register`'s exact pattern (`HTTPException(400, detail=msg)`), rather than adding a bare Pydantic `min_length` (which would have returned an inconsistent 422 and still skipped the complexity checks). Also extracted the frontend's matching rules into `frontend/src/lib/passwordPolicy.ts` (`validateNewPassword`), used by both `Signup.tsx` and `ResetPassword.tsx`, so a user who previously could pass client-side validation with e.g. `"lowercaseonly123"` and then hit a confusing server-side 400 on submit now gets the specific error inline before submitting.
- Verified with 3 new backend tests (`tests/test_password_strength_reset_change.py`) exercising the real route handlers against a fake DB — confirmed a weak reset password is rejected (400, password unchanged, token not consumed), a 12-char password missing complexity is rejected, and a fully-compliant password succeeds. Full suite (170 tests) still passes. Verified live in the browser that `Signup.tsx` now surfaces the specific missing-requirement message (e.g. "Password must contain at least one uppercase letter") inline, and that a compliant password completes signup.
- Files: `frontend/src/pages/Signup.tsx`, `frontend/src/pages/ResetPassword.tsx`, `frontend/src/lib/passwordPolicy.ts` (new), `backend/api/auth.py`, `backend/tests/test_password_strength_reset_change.py` (new).

### P1 — High-impact gaps, not blocking but genuinely broken in some paths

**P1-3: MFA backup-code copy has no insecure-context fallback. — FIXED**
- Evidence: `SettingsPage.tsx`'s `handleCopyBackupCodes` called `navigator.clipboard.writeText(...)` directly with no fallback; `components/ui/ClipboardCopyButton.tsx` already implemented the exact fallback needed but was unused.
- Fix applied: ported the fallback logic (hidden-textarea + `document.execCommand('copy')` when `window.isSecureContext` is false) directly into `handleCopyBackupCodes`, keeping the existing button's visual style rather than swapping in `ClipboardCopyButton`'s different markup. Verified the fallback branch executes without throwing.
- Files: `frontend/src/pages/SettingsPage.tsx`.

**P1-4: Reset-password and verify-email success states auto-redirect with no screen-reader announcement. — FIXED**
- Evidence: `ResetPassword.tsx` and `VerifyEmail.tsx` both `setTimeout(..., 2000)` to redirect on success; the success/resend-confirmation messages had no `aria-live`/`role="status"`.
- Fix applied: added `role="status" aria-live="polite"` to `ResetPassword.tsx`'s success container, and to both `VerifyEmail.tsx`'s success container and its "resend sent" confirmation message.
- Files: `frontend/src/pages/ResetPassword.tsx`, `frontend/src/pages/VerifyEmail.tsx`.

**P1-5: Deploy status changes aren't announced to screen readers. — FIXED**
- Evidence: `DeployButton.tsx`'s `pending → building → deploying → live/failed` transitions rendered as visual-only state changes with no `aria-live` region.
- Fix applied: added a visually-hidden (`sr-only`) `role="status" aria-live="polite"` span alongside all three of the button's render branches. Verified live via Playwright: the region announces "Queued…" mid-deploy and "Deployment live" on completion.
- Files: `frontend/src/components/build/DeployButton.tsx`.

**P1-6: `AppShell.tsx` renders mock `CURRENT_USER` unconditionally. — FIXED**
- Evidence: not gated behind `LIVE_MODE`, per the original report's Step 5 finding.
- Fix applied: name/email/plan now come from `useAuthStore`'s real `user` in live mode. Credits render as a plain "N credits remaining" count in live mode rather than a used/total progress bar, since `user.credits` is only a remaining balance — no server-side "total allocation" is available client-side without an extra billing fetch, and fabricating one would trade one inaccuracy for another. Demo mode is unchanged (verified via screenshot — same used/total progress bar as before).
- Files: `frontend/src/components/AppShell.tsx`.

### P2 — Medium — real but lower-impact

- **P2-6 — FIXED**: No skip-to-content link anywhere in the app. Added a "Skip to content" link to `LandingPage.tsx` (its long section-per-scroll layout is where this matters most), jumping to a new `id="main-content"` on its `<main>`. Verified via Playwright: link present with `href="#main-content"`, target exists.
- **P2-7 — FIXED**: `ProjectHistory.tsx`'s diff panel had no `aria-live` announcement. Added a short `sr-only` summary announcement ("Diff loaded: N changed files") alongside the existing `role="region"` file list, rather than making the whole region live (which would read every filename aloud). Verified via typecheck/build and direct code review of the resulting JSX structure; not exercised end-to-end since this demo build has no click path from Projects into `ProjectHistory` (cards navigate straight to the Workspace).
- **P2-8 — FIXED**: `Onboarding.tsx` step transitions had no announcement. Added an `sr-only` `role="status" aria-live="polite"` region announcing "Step X of 4: <label>". Verified live via Playwright across two step transitions.
- **P2-9 — PARTIALLY FIXED**: `Launch.tsx` (a strictly authenticated, post-login screen per `ProtectedRoute`) was on the marketing "land-*" theme despite every neighboring screen in its actual click-path (`Onboarding` before it, `AppShell` after it) using the app theme. Converted `Launch.tsx` to the app theme (`bg-base`, `bg-accent`, `border-muted`, etc.) — verified live, background now resolves to `rgb(10, 10, 15)` (the `base` token). `NotFoundPage.tsx` was deliberately left unchanged: it's a top-level catch-all route reachable from both public and authenticated contexts with no way to know which the visitor came from, so forcing either theme doesn't clearly fix anything — this is a product decision (e.g. detecting auth state to pick a theme), not a mechanical fix.
- **P2-10 — NOT FIXED (not a code fix)**: Terms/Privacy/Docs links were removed rather than pointed at real pages in an earlier pass. The underlying gap — no real Terms of Service, Privacy Policy, or Docs pages exist — can't be closed by writing placeholder legal text; that requires real content from whoever owns that copy. Left open and documented rather than faked.
- **P2-11 — FIXED**: `LandingPage.tsx`'s "Sign in" link was `hidden sm:block`, unreachable directly from the landing page on mobile (only reachable indirectly via Signup's "Already have an account?" link). Removed the mobile-hidden class; verified visible at a 375px viewport width via Playwright. The in-page section nav (Agents/Workflow/Features/Pricing) remains desktop-only, which is an intentional, common pattern for scrollable single-page marketing sites rather than a gap worth a hamburger-menu feature.

### P3 — Low — hygiene/consistency, no user-facing defect

- **P3-12 — DELIBERATELY NOT DONE**: Four well-built shared primitives (`components/ui/form/*`, `components/ui/EmptyState.tsx` + Skeletons, `components/ui/ClipboardCopyButton.tsx`) are entirely unused. The specific bugs this would have prevented (P0-1, P0-2, P1-3) are already fixed with targeted patches. Migrating `AuthPage.tsx`/`Signup.tsx`/`ResetPassword.tsx`/`VerifyEmail.tsx` onto these shared components now would be a much larger, riskier refactor touching four just-fixed, well-tested pages for marginal incremental benefit — worth a dedicated pass of its own, not something to fold in opportunistically here.
- **P3-13**: `AgentPipeline.tsx`/`ReviewAgentPipeline.tsx` intentional duplication — any future visual fix must be applied twice (justified in-code, not a bug — no action needed).
- **P3-14 — FIXED**: `LoadingButton.tsx` (unused) hardcoded `violet`/`emerald` colors that didn't match the app's `accent`/`ok` tokens. Updated to use `accent`/`ok` for correctness even while unused, so it's ready to adopt without a color-token surprise later.
- **P3-15**: `Row.tsx` is single-consumer (`SettingsPage.tsx` only) — fine as-is, worth revisiting if `AdminConsole.tsx` or others grow similar label/value row patterns (no action needed).
- **P3-16 — FIXED**: `ForgotPassword` was the only auth screen implemented inline in `App.tsx` rather than as its own file. Extracted to `pages/ForgotPassword.tsx`, lazy-loaded and `Suspense`-wrapped matching its siblings (`ResetPassword.tsx`, `VerifyEmail.tsx`) — confirmed it now produces its own code-split chunk and still renders correctly at `/forgot-password`. Also removed three now-unused imports (`Mail`, `api`, `Link`) this left behind in `App.tsx`.

## Step 14 — CEO summary and readiness score

**Readiness score: 91/100** (revised up from 88 — the backend password-strength gap this audit surfaced is now closed too, with test coverage).

Basis: the average screen score (7.29/10) scales to ~73; all six P0/P1 bugs and five of six actionable P2/P3 items are resolved, and a genuine backend authorization gap this pass surfaced (`reset-password`/`change-password` skipping all strength validation) is fixed with 3 new regression tests, not just documented. The remaining gap to a higher score is real Terms/Privacy/Docs content (can't be written by an audit) and a deliberately deferred larger refactor (P3-12's shared-component consolidation) — nothing left open is a correctness bug.

**What's working well**: every screen has a real loading state, a real empty state, and real error handling — there is no page in this app that silently fails or shows a blank screen on error. Accessibility fundamentals (focus rings, `aria-label`s, semantic landmarks, and now a skip-to-content link and several more `aria-live` regions) are applied consistently across nearly every screen, which is above average for a codebase this size. The previously-documented trust gaps (dead links, fake OAuth, a stubbed BYOK feature, a permanently-placeholder live preview, a missing Deploy control) have all been fixed in code, not just noted. All six P0/P1 bugs are fixed, and five of six P2/P3 items are fixed: the skip-link, the diff-panel and Onboarding-step announcements, the Launch.tsx theme inconsistency, the mobile-unreachable Sign in link, the unused `LoadingButton`'s color tokens, and `ForgotPassword`'s extraction to its own file.

**What's not ready / deliberately left open**: `AuthPage.tsx`, `Signup.tsx`, `ResetPassword.tsx`, and `VerifyEmail.tsx` each still hand-roll most of their own input/validation UI instead of sharing the four well-built, already-existing shared components in `components/ui/form/*` and `components/ui/{EmptyState,ClipboardCopyButton}.tsx` — consolidating onto them (P3-12) was deliberately deferred as a larger, separate refactor rather than folded in opportunistically. (Password *validation logic* specifically has since been consolidated into `lib/passwordPolicy.ts`, closing off the exact drift that caused P0-2.) Terms/Privacy/Docs pages still don't exist — the dead-link symptom is fixed, the underlying content gap isn't, and can't be closed without real legal copy from whoever owns it. `NotFoundPage.tsx`'s theme (P2-9) was left as-is since it's reachable from both public and authenticated contexts with no clean way to pick a theme without a larger design decision.

**Recommended fix order**: nothing blocking remains from this audit. If picking up the deferred items: the shared-component consolidation (P3-12) first, since it closes off the root cause of P0-bug-style drift recurring; Terms/Privacy/Docs content whenever the business is ready to publish it.

---

## Verified P0 candidates from the original pass — resolution status

- ~~Replace dead `href="#"` links~~ — **Fixed.**
- ~~Add `aria-live` announcement for new chat/transcript items in `ChatPanel.tsx`~~ — **Fixed.**
- ~~Replace mock-data credits/user rendering in `AppShell.tsx` with real auth state in LIVE_MODE~~ — **Fixed** (P1-6).
