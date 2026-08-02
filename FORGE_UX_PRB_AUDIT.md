# FORGE AI — PRODUCT REVIEW BOARD AUDIT
**Date:** 2026-08-02  
**Auditor:** Product Review Board (Senior Product Designers, UX Researchers, PMs, Design Engineers, Accessibility Specialists, Conversion Experts, IAs, UX Writers)  
**Target Score:** 98+/100  
**Current Estimated Score:** 68/100

---

## PHASE 1: COMPLETE PRODUCT AUDIT

### Screens Reviewed
| Screen | Path | Status |
|--------|------|--------|
| Launch (/) | `/` | Public splash + prompt bar |
| Landing Page | `/home` | Full marketing site |
| Auth | `/login` | Email/password + MFA |
| Signup | `/signup` | Name/email/password |
| Forgot Password | `/forgot-password` | Email reset |
| Reset Password | `/reset-password` | Token reset |
| Verify Email | `/verify-email` | Email verification |
| Google Callback | `/google-callback` | OAuth handler |
| Onboarding | `/onboarding` | 4-step wizard |
| Projects | `/projects` | Project library + build input |
| Workspace | `/build/:id` | 3-panel IDE (chat/editor/preview) |
| Project History | `/project/:id` | Build history |
| Engineering Org | `/project/:id/org` | Engineering org view |
| Marketplace | `/marketplace` | Templates/playbooks |
| Billing | `/billing` | Plans + usage |
| Settings | `/settings` | Preferences, security, integrations |
| Admin Console | `/admin-console` | Admin dashboard |
| LLM Management | `/llm-management` | Model config |
| Optimization Dashboard | `/optimization-dashboard` | AI optimization |
| Engineering Health | `/engineering-health` | System health |
| Prompt Studio | `/prompt-studio` | Prompt engineering |
| Reviews | `/reviews`, `/reviews/:id` | Review board |
| Initiatives | `/initiatives`, `/initiatives/:id` | PM layer |
| NotFound | `*` | 404 page |

---

### 1.1 Navigation — CRITICAL ISSUES

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| N-01 | Two competing landing surfaces: `/` (Launch with globe) and `/home` (LandingPage). Users reaching `/home` get a different experience than `/`. Confusing for sharing links. | HIGH | Launch, LandingPage |
| N-02 | No breadcrumbs anywhere in the app. Users in `/project/:id/org` or `/initiatives/:id/board` have no way to understand their depth or navigate up. | HIGH | All in-shell routes |
| N-03 | Dock items use icon+label but admin items appear conditionally without any visual separator. Admin tools blend with user tools. | MEDIUM | AppShell |
| N-04 | No keyboard shortcut hints or command palette. Power users have no quick navigation. | MEDIUM | AppShell |
| N-05 | "Go to home" on 404 links to `/home` (landing page), not `/projects` (dashboard). Wrong destination for authenticated users. | HIGH | NotFoundPage |
| N-06 | Landing nav links (`#agents`, `#workflow`, etc.) are anchor-only. On mobile, the nav disappears entirely with no hamburger. | HIGH | LandingPage |
| N-07 | `/projects` is the dashboard but is labeled "Projects" in dock. Users expect "Dashboard" or "Home". | LOW | AppShell |
| N-08 | No "Help" or "Docs" link in primary navigation. Users must search for documentation. | MEDIUM | AppShell |

### 1.2 User Journeys — CRITICAL ISSUES

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| J-01 | First-time user lands on `/` (Launch), types prompt, clicks "Start building" → goes to `/signup` → after signup → `/projects` → must click build again. Two-step friction where one-step is possible. | CRITICAL | Launch → Signup → Projects |
| J-02 | Onboarding step 2 ("Connect") opens `/settings` in a new tab instead of inline. User must manually return to onboarding tab. No state synchronization. | HIGH | Onboarding |
| J-03 | After build completes, no clear "View result" or "Deploy" action. User is left on the chat panel with no next-step guidance. | HIGH | Workspace |
| J-04 | Signup success shows email verification screen but allows "Continue to your projects" — skipping verification. Inconsistent with security expectations. | MEDIUM | Signup |
| J-05 | No guided tour or coach marks after first login. New users see a blank project library with no hint where to start. | HIGH | ProjectsPage |
| J-06 | Build failure shows in chat only. No dedicated error state, no retry button, no suggestion for next action. | HIGH | Workspace/ChatPanel |
| J-07 | Users cannot access their builds from the landing page without signing up. No demo/preview mode for anonymous visitors beyond the simulated transcript. | MEDIUM | LandingPage |

### 1.3 Information Architecture — CRITICAL ISSUES

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| IA-01 | `/projects` mixes project CRUD, build initiation, and project library in one screen. Cognitive overload for first-time users. | HIGH | ProjectsPage |
| IA-02 | Settings page groups unrelated concerns (appearance, API keys, integrations, notifications, defaults, security, sessions, support) into one long scroll. | MEDIUM | SettingsPage |
| IA-03 | Admin console is a single monolithic page with 6+ data sections. No tab navigation or collapsible sections. | HIGH | AdminConsole |
| IA-04 | No clear distinction between "build" (AI generation) and "project" (container). Users don't understand the relationship. | HIGH | Multiple |
| IA-05 | "Initiatives" and "Projects" are separate top-level concepts with no explanation of how they relate. | MEDIUM | AppShell |

### 1.4 Discoverability — HIGH ISSUES

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| D-01 | Starter templates are small pills below the main input. Easy to miss on mobile. No dedicated template browser. | MEDIUM | ProjectsPage |
| D-02 | "Blank project" button is styled as a chip with a plus icon — looks like a filter, not a primary action. | LOW | ProjectsPage |
| D-03 | Agent Fleet Graph button (`<Activity>`) in header has no label beyond an icon. Users don't know what it does. | MEDIUM | AppShell |
| D-04 | Build input on Projects page says "Tell Forge what to build…" but doesn't indicate credit cost. | MEDIUM | ProjectsPage |
| D-05 | No search in Settings. Users with many preferences must scroll. | LOW | SettingsPage |

### 1.5 Content Hierarchy — MEDIUM ISSUES

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| C-01 | Landing page has 10+ sections. Hero is strong but subsequent sections compete for attention. No clear reading funnel. | MEDIUM | LandingPage |
| C-02 | Billing page shows usage stats, agent breakdown, and plans in one vertical stack. Plans should be the primary focus. | MEDIUM | BillingPage |
| C-03 | Auth page split-panel is excellent but the editorial panel dominates on desktop, pushing the form down. | LOW | AuthPage |

### 1.6 Accessibility — CRITICAL ISSUES (detailed in Phase 6)

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| A-01 | Multiple inputs lack `aria-describedby` linking to error messages | CRITICAL | AuthPage, Signup, Settings |
| A-02 | Error `role="alert"` regions not connected to inputs via `aria-describedby` | CRITICAL | AuthPage, Signup, ForgotPassword |
| A-03 | Some buttons are `<div>` elements with `onClick` (infer from patterns) | HIGH | Various |
| A-04 | Focus management missing during MFA transition | HIGH | AuthPage |
| A-05 | No skip link on in-app pages (only landing and shell have them) | HIGH | Workspace, Projects, etc. |
| A-06 | Color contrast potentially failing on `text-faint` in some states | MEDIUM | Multiple |
| A-07 | Touch targets below 44x44px in dock items on mobile | MEDIUM | AppShell |

### 1.7 Mobile Usability

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| M-01 | Landing page nav disappears on mobile with no hamburger menu | HIGH | LandingPage |
| M-02 | Workspace 3-panel layout doesn't adapt to mobile (no tab-based panel switching) | CRITICAL | WorkspacePage |
| M-03 | Auth split-panel collapses to form-only on mobile — editorial content lost, no context | MEDIUM | AuthPage |
| M-04 | Admin console data tables overflow horizontally on mobile without card adaptation | HIGH | AdminConsole |
| M-05 | Projects grid adapts but project names truncate aggressively on small screens | LOW | ProjectsPage |

### 1.8 Tablet Usability

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| T-01 | Workspace 3-panel layout uses fixed 320px preview panel — wastes space on 10" tablets | MEDIUM | WorkspacePage |
| T-02 | Onboarding step goal grid is 2-col on all sizes — should be 3-col on tablet | LOW | Onboarding |

### 1.9 Desktop Usability

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| D-01 | Max content width of 1440px creates excessive whitespace on 27"+ monitors | LOW | AppShell |
| D-02 | No multi-window or split-view support for comparing projects | LOW | Multiple |

### 1.10 Enterprise Usability

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| E-01 | No visible organization/team management UI despite API existing | CRITICAL | Missing |
| E-02 | No role/permission management UI | CRITICAL | Missing |
| E-03 | No audit log viewer for users | HIGH | Missing |
| E-04 | Admin console has no role-based view — all admins see everything | MEDIUM | AdminConsole |
| E-05 | No SSO/SAML configuration UI | HIGH | Missing |

### 1.11 Performance Perception

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| P-01 | Landing page loads GSAP + Motion + Cobe/Three globe simultaneously — heavy initial payload | HIGH | LandingPage, Launch |
| P-02 | No skeleton loading for project cards during initial fetch | MEDIUM | ProjectsPage |
| P-03 | Admin console fires 6+ parallel queries without staggered loading indication | MEDIUM | AdminConsole |
| P-04 | No image lazy loading for any hero/editorial imagery | LOW | LandingPage |

### 1.12 Cognitive Load

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| CL-01 | Launch page has globe toggle (Cobe/Three) — users don't understand the difference or why it matters | MEDIUM | Launch |
| CL-02 | "Credits" concept is abstract. Users don't know what a credit buys until they run out. | HIGH | Multiple |
| CL-03 | Build status terminology varies: "running", "debugging", "pending", "complete" — inconsistent | MEDIUM | StatusPill |
| CL-04 | Settings has 8 sections with no grouping hierarchy | MEDIUM | SettingsPage |
| CL-05 | Onboarding asks to connect GitHub AND Anthropic before building — both are optional but the UI implies they're required | HIGH | Onboarding |

### 1.13 Error Recovery

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| ER-01 | Build failures only appear as chat messages. No dedicated error UI with retry/suggestions | HIGH | Workspace |
| ER-02 | Network errors during project fetch show "Unknown project" with no recovery option | MEDIUM | WorkspacePage |
| ER-03 | No offline detection or retry queue | MEDIUM | Global |
| ER-04 | Form validation errors disappear on re-focus instead of requiring re-submission | LOW | AuthPage, Signup |

### 1.14 Empty States

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| ES-01 | Empty project library says "Your library is empty" but doesn't suggest creating a project inline — user must scroll up | MEDIUM | ProjectsPage |
| ES-02 | No empty state for when user has no builds in Project History | MEDIUM | ProjectHistory |
| ES-03 | Notifications "All caught up" is good but lacks a CTA to create first build | LOW | NotificationsBell |

### 1.15 Loading States

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| LS-01 | Full-screen spinner for route skeletons blocks navigation feeling | LOW | Global |
| LS-02 | No skeleton for billing plans while loading | LOW | BillingPage |

### 1.16 Onboarding

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| O-01 | Onboarding is skippable but there's no "Skip onboarding" button on step 1 | MEDIUM | Onboarding |
| O-02 | No progress indication of time remaining | LOW | Onboarding |
| O-03 | Step 2 opens external tabs without clear expectation of duration | MEDIUM | Onboarding |

### 1.17 Search

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| S-01 | Project search is client-side only — doesn't search descriptions thoroughly | LOW | ProjectsPage |
| S-02 | No global search (⌘K) for projects, settings, or docs | HIGH | Global |
| S-03 | No search in Admin Console user list (has filter but no text search) | MEDIUM | AdminConsole |

### 1.18 Settings

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| ST-01 | No way to change email or name from settings | MEDIUM | SettingsPage |
| ST-02 | API key management is buried under "API key" section with no dedicated page | LOW | SettingsPage |
| ST-03 | No data export or account deletion UI | HIGH | SettingsPage |

### 1.19 Dashboard

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| DB-01 | `/projects` serves as dashboard but shows no summary stats (credits used, builds this month, etc.) | MEDIUM | ProjectsPage |
| DB-02 | No recent activity feed or build status summary | MEDIUM | ProjectsPage |

### 1.20 AI Workflows

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| AI-01 | No indication of credit cost before/during build | HIGH | Workspace |
| AI-02 | No way to pause or cancel a running build | HIGH | Workspace |
| AI-03 | Chat input placeholder doesn't suggest what makes a good prompt | LOW | Workspace |

### 1.21 Authentication

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| AU-01 | Google OAuth redirects to `/` then `/projects` — if user came from `/signup` with a prompt, state is lost | MEDIUM | GoogleCallback |
| AU-02 | No "Remember me" on signup (only on login) | LOW | Signup, AuthPage |
| AU-03 | Session management shows IP and user agent but no location | LOW | SettingsPage |

### 1.22 Billing

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| B-01 | No invoice history visible in UI — only Stripe portal link | MEDIUM | BillingPage |
| B-02 | No low-credit warning or top-up prompt | HIGH | Global |
| B-03 | Annual savings shown as dollar amount but not percentage (e.g., "Save 20%") | LOW | BillingPage |
| B-04 | No pause subscription option | LOW | BillingPage |

### 1.23 Notifications

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| N-01 | Notifications bell only shows build completion. No email, no team mentions, no billing alerts | MEDIUM | NotificationsBell |
| N-02 | No notification preferences beyond "builds complete" | MEDIUM | SettingsPage |
| N-03 | No in-app notification center routing — only bell dropdown | LOW | NotificationsBell |

### 1.24 Documentation

| # | Issue | Severity | Screen |
|---|-------|----------|--------|
| DOC-01 | No in-app help center or docs link | MEDIUM | Global |
| DOC-02 | Landing page has no documentation link | MEDIUM | LandingPage |
| DOC-03 | No contextual help (tooltips, info icons) for complex features like credits, BYOK, agents | HIGH | Multiple |

---

## PHASE 2: UX HEURISTIC REVIEW

### Nielsen's 10 Heuristics

| # | Heuristic | Violations | Severity |
|---|-----------|------------|----------|
| 1 | Visibility of system status | Build progress hidden in chat only; no global status bar for long operations | HIGH |
| 2 | Match between system and real world | "Credits" abstraction; "debug iterations" terminology; "build" = AI generation | MEDIUM |
| 3 | User control and freedom | No undo for project deletion; no cancel for running builds; no "back to previous step" in onboarding | HIGH |
| 4 | Consistency and standards | Two landing pages (`/` and `/home`); inconsistent status vocabulary; mixed button styles | HIGH |
| 5 | Error prevention | No confirmation before leaving page with unsaved build; no "are you sure" for destructive actions | MEDIUM |
| 6 | Recognition rather than recall | No command palette; no recent projects list on empty state; no template previews | MEDIUM |
| 7 | Flexibility and efficiency of use | No keyboard shortcuts; no bulk actions; no quick filters | MEDIUM |
| 8 | Aesthetic and minimalist design | Landing page has 10+ sections; Settings has 8 unscrollable sections; Admin has 6+ data panels | MEDIUM |
| 9 | Help users recognize, diagnose, recover from errors | Build failures lack error codes, retry suggestions, or support links | HIGH |
| 10 | Help and documentation | No in-app docs, no contextual tooltips, no searchable help | HIGH |

### Jakob's Law
- Users expect `/projects` to behave like other project dashboards (GitHub, Linear, Vercel). Currently it's a hybrid of dashboard + build input + library. Violation: HIGH.

### Hick's Law
- Onboarding step 2 presents 2 choices but with complex state (open settings in new tab, wait, return). Decision paralysis. Violation: MEDIUM.
- Projects page has 3 filter dropdowns + search + view toggle + build input. Too many simultaneous choices. Violation: HIGH.

### Fitts's Law
- Dock items on mobile are small (44px height but tight spacing). Agent fleet button competes with notifications for space. Violation: MEDIUM.
- Settings page toggle switches have adequate size but are visually subtle. Violation: LOW.

### Miller's Law
- Projects page shows unlimited items with no pagination or chunking. Violation: MEDIUM.
- Onboarding step 2 shows 2 integration options but implies more with "Connect your tools" heading. Violation: LOW.

### Progressive Disclosure
- Admin console dumps all data at once. Should use tabs/collapsible sections. Violation: HIGH.
- Settings shows all 8 sections expanded. Should collapse by default. Violation: MEDIUM.
- Workspace has all 3 panels visible simultaneously — should use tabs on smaller screens. Violation: HIGH.

### Mental Models
- "Build" means different things: AI generation, CI/CD build, project creation. Violation: HIGH.
- "Credits" as currency is abstract. Users expect "runs" or "generations". Violation: MEDIUM.
- "Initiatives" vs "Projects" — unclear relationship. Violation: MEDIUM.

### Information Scent
- Landing page CTA "Start building" leads to signup, but the value prop (credits, agents, speed) isn't reinforced near the CTA. Weak scent. Violation: MEDIUM.
- Project library search filters by name but not by tags, dates, or status clearly. Weak scent. Violation: LOW.

### Gestalt Principles
- Projects grid uses proximity well but status dots compete visually with folder icons. Similarity violation: LOW.
- Admin console sections lack clear visual hierarchy — all panels look equal. Violation: MEDIUM.

### WCAG 2.2 AA
- Multiple form inputs lack proper `aria-describedby` linkage to errors (see Phase 6).
- Some clickable elements may not meet 44x44px touch target.
- Color contrast on `text-faint` may not meet 4.5:1 ratio.
- No `focus-visible` trap management in modals/dropdowns.
- See Phase 6 for detailed findings.

---

## PHASE 3: COGNITIVE LOAD AUDIT

### Duplicate Actions
- "Start building" appears on Launch, LandingPage (hero + CTA + FinalCTA), ProjectsPage, and Onboarding. Each is a separate code path with slightly different routing logic.
- "Sign in" link appears in header on Signup AND AuthPage — both point to `/login`.
- "Create account" on AuthPage AND "Sign up" on LandingPage nav — both point to `/signup`.

### Duplicate Navigation
- Two landing surfaces (`/` and `/home`) with overlapping content.
- Onboarding step 2 sends users to Settings in a new tab instead of inline — duplicates the navigation path.

### Unnecessary Text
- Landing page has 10 sections with 3,000+ words. Can reduce by 40% while keeping meaning.
- Settings page has verbose descriptions that repeat the label.
- Projects page has "What do you want to build?" + "Describe what to build" — redundant.

### Confusing Terminology
- "Build" = AI generation (not CI/CD)
- "Credits" = AI token cost units
- "Debug iterations" = retry count
- "Initiatives" = agile PM epics container
- "Agent runs" = individual agent executions

### Repetitive Workflows
- Creating a project and starting a build requires: ProjectsPage → type prompt → click Build → wait for project creation → auto-submit. Can be one step from landing page.
- Connecting GitHub requires: Settings → GitHub → paste token → save → return to Onboarding. Should be inline.

### Unnecessary Confirmations
- No confirmation before navigating away from unsaved build state
- No confirmation for project deletion (if exists)

### Hidden Functionality
- Double-click on project icon to open (in addition to single click) — hidden and inconsistent
- Agent Fleet Graph button has no label
- Globe mode toggle (Cobe/Three) is unexplained

### Inconsistent Naming
- "Billing" vs "Plans" vs "Subscription" — used interchangeably
- "Projects" vs "Builds" vs "Workspace" — unclear hierarchy
- "Settings" vs "Preferences" vs "Profile" — all refer to same area

---

## PHASE 4: WORKFLOW OPTIMIZATION

### Can this require fewer clicks?

| Workflow | Current Clicks | Target Clicks | Optimization |
|----------|---------------|---------------|--------------|
| Signup → First build | 5 (signup → onboarding step 1 → step 2 (skip) → step 3 → build) | 2 (signup → build) | Skip onboarding for users who want to start immediately |
| Login → Build | 3 (login → projects → build input) | 2 (login → build input) | Redirect authenticated users with prompt state to workspace |
| Connect GitHub | 4 (settings → show input → paste token → save) | 2 (inline OAuth flow) | Implement GitHub OAuth instead of PAT |
| View build status | 3 (projects → project → history) | 2 (projects → click build) | Show build status inline on project cards |
| Cancel build | Not possible | 1 (cancel button) | Add cancel to build status bar |

### Can fewer decisions be made?
- Onboarding step 2 (connect tools) should be deferred until first build needs the integration.
- Billing interval toggle (monthly/annual) should remember user preference.
- Theme toggle should be auto-detected based on system preference with manual override.

### Can defaults be smarter?
- Auto-deploy should default to true for Pro/Enterprise users.
- Debug iterations should default to 3 but remember last-used value.
- New projects should inherit workspace defaults.

### Can steps be merged?
- Merge "Create account" and "Start building" into a single form with prompt input.
- Merge Settings "API key" and "Integrations" into a unified "Connections" section.
- Merge Project History and Engineering Org into tabbed sub-pages.

### Can actions become contextual?
- Build input should show "Connect GitHub to deploy" only when user has a successful build ready to deploy.
- Billing upgrade prompts should appear only when credits are low, not on every page.
- Settings sections should appear/disappear based on plan (e.g., BYOK only for Pro+).

### Can users recover faster?
- Add "Retry" button directly in build failure message.
- Add "Restore previous version" in build history.
- Add "Clear filters" button always visible, not just in empty state.

### Can first-time users succeed without documentation?
- No. The landing page doesn't explain what a "credit" buys. The workspace has no inline guidance. Settings has no tooltips. This is the #1 barrier.

---

## PHASE 5: TRUST REVIEW

### Privacy
- No visible privacy policy link on auth pages (only in footer on landing)
- No data retention or deletion policy visible in settings
- No "Export my data" button in settings (API exists but no UI)

### Security
- MFA setup is well-implemented with QR code and backup codes
- Session management shows devices and allows revocation
- No visible security score or security history
- No password change UI in settings (only MFA disable requires password)

### Billing
- No clear total cost estimator before starting a build
- No warning when approaching credit limit
- Downgrade message says "takes effect at end of billing period" but doesn't say when that is
- No visible cancellation policy or refund policy

### Pricing
- Annual vs monthly savings not expressed as percentage
- No "most popular" badge on Standard plan (only Pro has featured treatment)
- No enterprise plan visible in pricing (only available via contact)

### Permissions
- Admin routes are hidden but no explanation of why certain features are unavailable
- No org/team role management UI

### AI Transparency
- No indication of which model is being used for a build
- No cost estimate before build starts
- No explanation of how quality score is calculated

### Progress Indicators
- Build progress is shown in chat only — no global progress bar
- Onboarding has good step indicator
- No progress indication for long-running operations (project fetch, etc.)

### Saving
- Form inputs in settings auto-save but don't show "Saved" confirmation
- No draft saving for long support tickets

### Undo
- No undo for any action (project delete, build cancel, settings change)
- No confirmation dialogs for destructive actions

### Version History
- No visible version history for projects
- Rollback API exists but no UI to trigger it

### Recovery
- No recovery from accidental navigation away from build
- No auto-save of build prompts

---

## PHASE 6: ACCESSIBILITY REVIEW (Detailed)

### Keyboard Navigation
| Issue | Severity | Fix |
|-------|----------|-----|
| No focus trap in notifications dropdown | HIGH | Add `FocusTrap` from `@radix-ui/react-focus-trap` or custom |
| MFA transition doesn't move focus to code input | HIGH | Add `autoFocus` + `focus()` call |
| Dock items on mobile not reachable via keyboard in logical order | MEDIUM | Ensure nav is in DOM order |
| No keyboard shortcut for global search | MEDIUM | Add `⌘K` listener |

### Focus Order
| Issue | Severity | Fix |
|-------|----------|-----|
| Error messages not in tab order (correct) but not announced to screen readers without `aria-live` | HIGH | Add `aria-live="polite"` to error containers |
| Skip link on landing page is `sr-only` but not `focus:not-sr-only` in all browsers | LOW | Verify cross-browser |

### Contrast
| Issue | Severity | Fix |
|-------|----------|-----|
| `text-faint` on `bg-base` likely fails WCAG AA (need to verify exact values) | HIGH | Test with axe DevTools; adjust to 4.5:1 minimum |
| `text-muted` on `bg-paper` may fail in some states | MEDIUM | Test and adjust |
| Error text `text-land-destructive` on `bg-land-destructive/10` — verify contrast | MEDIUM | Test and adjust |

### Font Sizes
| Issue | Severity | Fix |
|-------|----------|-----|
| `text-[10px]` used in dock labels and chips — below 12px recommended minimum | MEDIUM | Increase to 12px |
| Caption text `0.8125rem` (13px) is acceptable but could be larger for accessibility | LOW | Consider 14px |

### Touch Targets
| Issue | Severity | Fix |
|-------|----------|-----|
| Dock items: `min-w-[3.25rem]` (52px) with 20px icon + 10px label = tight but pass 44x44 | LOW | Verify actual tap area |
| Agent fleet button is 36x36px (h-9 w-9) — below 44x44 minimum | MEDIUM | Increase to h-11 w-11 |
| Password visibility toggle is `p-2` inside input — may be < 44x44 | MEDIUM | Increase padding |

### ARIA
| Issue | Severity | Fix |
|-------|----------|-----|
| `aria-invalid` set but `aria-describedby` not linked to error message | CRITICAL | Add `id` to error + `aria-describedby` to input |
| `role="alert"` used but errors not programmatically tied to fields | HIGH | Use `aria-describedby` pattern |
| `role="radiogroup"` used but keyboard arrow handling is custom (not using native radio) | MEDIUM | Consider native radios or add full arrow key handling |
| `aria-live="polite"` on status elements but no `aria-atomic` on some | LOW | Add `aria-atomic="true"` |

### Screen Readers
| Issue | Severity | Fix |
|-------|----------|-----|
| Icon-only buttons in dock have `aria-label` but no `sr-only` text fallback | LOW | Add `sr-only` label |
| Loading spinners have no `aria-label` or `role="status"` | MEDIUM | Add `role="status"` + `aria-label="Loading"` |
| Animated elements (globe, agent pipeline) lack `aria-hidden` or reduced-motion handling | MEDIUM | Verify all decorative animations are `aria-hidden` |

### Reduced Motion
| Issue | Severity | Fix |
|-------|----------|-----|
| Landing page uses GSAP + Motion but `useReducedMotion` only on some components | MEDIUM | Audit all animations |
| Cobe/Three globe has no reduced-motion fallback (always animates) | MEDIUM | Add pause/reduce option |

### Localization
| Issue | Severity | Fix |
|-------|----------|-----|
| All text is hardcoded English. No i18n framework. | HIGH | Add i18n infrastructure if targeting global launch |
| Date formatting uses `toLocaleDateString()` without locale parameter | LOW | Use explicit locale or library |

### Plain English
| Issue | Severity | Fix |
|-------|----------|-----|
| "Debug iterations" — users don't know what this means | HIGH | Rename to "Auto-retry on failure" |
| "BYOK" — acronym not explained | MEDIUM | Use "Bring your own key" or add tooltip |
| "Credits" — abstract unit, not explained near consumption | HIGH | Add "1 credit ≈ 1 agent step" explanation |
| "MFA" — used in code but UI says "Two-factor authentication" (good) | NONE | — |

---

## PHASE 7: CONVERSION REVIEW

### Landing Page
| Issue | Severity | Impact |
|-------|----------|--------|
| No social proof (testimonials, logos, user count) | HIGH | Lowers trust, reduces conversion |
| No "How it works" video or interactive demo beyond simulated transcript | MEDIUM | Reduces understanding |
| No FAQ on pricing (only general FAQ) | MEDIUM | Pricing objections go unaddressed |
| "GitHub coming soon" in footer signals incompleteness | HIGH | Reduces perceived maturity |
| No trust badges (SOC2, GDPR, encrypted, etc.) | HIGH | Enterprise users bounce |

### Pricing
| Issue | Severity | Impact |
|-------|----------|--------|
| No annual discount prominence (only shown in plan card) | MEDIUM | Reduces annual conversions |
| No "7-day free trial of Pro" offer | HIGH | Reduces upgrade rate |
| No "Compare all plans" link or feature comparison table | MEDIUM | Users can't evaluate |
| Enterprise plan not visible (only "Contact sales") | MEDIUM | Loses enterprise leads |

### Sign Up
| Issue | Severity | Impact |
|-------|----------|--------|
| Name field is optional in backend but required in UI | MEDIUM | Unnecessary friction |
| No social auth on signup page (only Google on login) | MEDIUM | Missed conversion |
| Password strength meter shows 3 bars but policy requires 4 conditions (12+ chars, upper, lower, number, symbol) — mismatch | HIGH | Users confused about why password "fails" |
| No "Sign up with Google" button on signup page | MEDIUM | Friction |

### Onboarding
| Issue | Severity | Impact |
|-------|----------|--------|
| Step 2 (Connect) is a dead end if user skips — they never return to it | HIGH | Lowers activation |
| No celebration or reward after completing first build | MEDIUM | Missed dopamine moment |

### First AI Generation
| Issue | Severity | Impact |
|-------|----------|--------|
| No credit cost shown before build starts | HIGH | Users shocked by credit consumption |
| No "Your first build is free" messaging | HIGH | Missed conversion hook |
| Build takes ~15 min but no time estimate shown upfront | MEDIUM | Users abandon |

### Upgrade Prompts
| Issue | Severity | Impact |
|-------|----------|--------|
| No upgrade prompt when credits run low | HIGH | Churn |
| No upgrade prompt when user hits free tier limits | HIGH | Churn |
| Upgrade prompts don't show "What you get" context | MEDIUM | Lower conversion |

---

## PHASE 8: ENTERPRISE READINESS

| Area | Status | Gap |
|------|--------|-----|
| Organizations | API exists, no UI | CRITICAL |
| Teams | API exists, no UI | CRITICAL |
| RBAC | Server-side enforced, no UI | HIGH |
| Audit logs | API exists, no user-facing UI | HIGH |
| Compliance | No visible policies (SOC2, GDPR, HIPAA) | HIGH |
| Security settings | MFA + sessions exist; no password policy UI | MEDIUM |
| Administration | Admin console exists but no role-based views | MEDIUM |
| Large workspaces | No pagination, no virtualization | HIGH |
| Scalability | Backend has multi-worker + Redis pub/sub | LOW |

---

## PHASE 9: VISUAL CONSISTENCY

| Area | Issue | Severity |
|------|-------|----------|
| Spacing | Inconsistent padding: some panels use `p-4`, others `p-5`, others `p-6`, others `p-8` | MEDIUM |
| Typography | Mixed font families: `font-display`, `font-brand`, `font-sans`, system defaults in some places | MEDIUM |
| Alignment | Landing page sections use `max-w-6xl`, app uses `max-w-content` (1440px) — inconsistency | LOW |
| Icons | Lucide icons used throughout but some components use custom SVGs (BrandLogo, Globe3D) | LOW |
| Illustrations | Agent network art duplicated between AuthPage and Signup (copy-pasted) | LOW |
| Cards | Multiple card styles: `glass`, `glass-strong`, `bb-panel`, `bg-panel-alt` — 4+ card primitives | HIGH |
| Buttons | `bb-btn`, `bb-btn-primary`, `bb-btn-outlined`, `bb-btn-ghost`, `bb-btn-icon`, `bb-btn-subtle` — 6+ button variants | MEDIUM |
| Colors | Two color systems: app (`ink`, `muted`, `accent`) and landing (`land-ink`, `land-muted`, `land-accent`) — doubled token set | HIGH |
| Motion | Some components use `motion/react`, others use GSAP directly — inconsistent animation system | MEDIUM |
| Glass effects | `glass`, `glass-strong`, `apple-glass`, `apple-glass-strong` — 4+ glass primitives | HIGH |
| Empty states | EmptyState component exists but not used consistently across all empty scenarios | MEDIUM |
| Loading states | LoadingSpinner, Skeleton, SkeletonCard, SkeletonList exist but not used in all loading scenarios | MEDIUM |

---

## PHASE 10: BENCHMARK REVIEW

### vs Apple
- ✅ Clean typography, generous whitespace
- ❌ No system-level integration (no share extensions, no shortcuts, no handoff)
- ❌ No progressive web app support

### vs Google Workspace
- ✅ Modern, clean interface
- ❌ No collaborative editing or real-time multiplayer
- ❌ No offline mode

### vs Stripe Dashboard
- ✅ Polished data visualization
- ❌ No consistent sidebar navigation pattern
- ❌ No clear page hierarchy

### vs Linear
- ✅ Fast, keyboard-friendly feel
- ❌ No command palette (⌘K)
- ❌ No keyboard shortcuts
- ❌ No issue/task tracking UX patterns

### vs Notion
- ✅ Simple project model
- ❌ No block-based editing
- ❌ No inline comments or mentions

### vs Figma
- ✅ Live preview exists
- ❌ No multiplayer cursors or presence
- ❌ No comment/annotation system on previews

### vs Vercel
- ✅ Deployments API exists
- ❌ No deployment preview URLs with preview comments
- ❌ No environment variable management UI

### vs GitHub
- ✅ GitHub sync exists
- ❌ No PR creation from build
- ❌ No branch management

### vs OpenAI
- ✅ Model selection exists
- ❌ No streaming token display
- ❌ No usage analytics per conversation

---

## OVERALL SCORES

| Category | Current | Target |
|----------|---------|--------|
| Navigation | 45/100 | 95/100 |
| User Journeys | 50/100 | 95/100 |
| Information Architecture | 55/100 | 95/100 |
| Discoverability | 60/100 | 95/100 |
| Content Hierarchy | 65/100 | 95/100 |
| Accessibility | 40/100 | 98/100 |
| Mobile Usability | 35/100 | 90/100 |
| Tablet Usability | 60/100 | 90/100 |
| Desktop Usability | 70/100 | 95/100 |
| Enterprise Usability | 30/100 | 90/100 |
| Performance Perception | 60/100 | 90/100 |
| Cognitive Load | 50/100 | 95/100 |
| Error Recovery | 45/100 | 90/100 |
| Empty States | 65/100 | 95/100 |
| Loading States | 70/100 | 95/100 |
| Onboarding | 60/100 | 95/100 |
| Search | 40/100 | 90/100 |
| Settings | 60/100 | 90/100 |
| Dashboard | 50/100 | 90/100 |
| AI Workflows | 55/100 | 90/100 |
| Authentication | 75/100 | 95/100 |
| Billing | 65/100 | 90/100 |
| Notifications | 55/100 | 85/100 |
| Documentation | 30/100 | 85/100 |
| **Overall** | **54/100** | **92/100** |

**Key Blockers to Launch:**
1. Workspace not mobile-adaptable (3-panel breaks on mobile)
2. No global search/command palette
3. Landing page has two competing entry points
4. Build failures lack error recovery UI
5. Accessibility violations in form error handling
6. No enterprise org/team management UI
7. No credit cost visibility before builds
8. No trust signals on landing page
