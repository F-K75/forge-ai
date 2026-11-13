# Forge Task List

Worked by Claude's daily 7am scheduled task. Rules for the scheduled run:
- Pick the FIRST unchecked item under "Claude queue", do it, check it off, and append a dated note under "Run log".
- Work only inside this repo. No force pushes, no credential rotation, no destructive git operations, no external account creation.
- If an item is blocked, note why in the Run log and move to the next item.

## Claude queue

- [x] Create `landing.html` in repo root: headline "Your AI Engineering Team", waitlist email capture, ready to deploy to Netlify/Vercel
- [x] Set pricing tiers in `backend/core/config.py` (Free 5 credits/$0, Standard 100/$20mo, Pro 750/$50mo, Enterprise custom)
- [x] Draft `TEAM.md` (founding team page skeleton for keshav to fill in)
- [x] Add GitHub issue templates (bug + feature) under `.github/ISSUE_TEMPLATE/`
- [x] Draft blog post 1: "How We Built a Multi-Agent AI Engineering Platform" → `blog/01-architecture.md`
- [x] Draft blog post 2: "Why Single-Agent AI Coding Tools Are Not Enough" → `blog/02-positioning.md`
- [x] Draft blog post 3: "Building a Full-Stack App in 5 Minutes with Forge" → `blog/03-tutorial.md`
- [x] Add PostHog analytics snippet to frontend (signups, builds started/completed, errors)
- [x] Draft onboarding welcome email templates for Resend integration
- [x] Draft Product Hunt launch kit: tagline, description, first comment → `launch/product-hunt.md`
- [x] Draft "Show HN" post text → `launch/hacker-news.md`
- [x] Update README with waitlist link and contributing pointers

## Needs keshav (not automatable)

- [ ] Rotate all live credentials (.env in git history — URGENT, see INSTANT_NEXT_STEPS.md #1)
- [ ] Create Twitter/X account
- [ ] Create Discord server
- [ ] Create GitHub org and move repo
- [ ] Lawyer review of legal docs
- [ ] Product Hunt / HN launch execution

## Run log

(Claude appends a dated entry after each run.)

### 2026-07-26
- Items 1 & 2 found already complete from prior work but unchecked: `landing.html` exists (correct headline, waitlist form, static single-file — Netlify/Vercel ready) and `backend/core/config.py` already has the specified tiers (free_credits=5, standard 100/$20, pro 750/$50, Enterprise via Stripe/Razorpay price IDs). Verified and checked off.
- Completed item 3: created `TEAM.md` skeleton (mission, founder block for keshav with placeholders, advisors, join-us/links sections).
- Follow-ups: keshav to fill TEAM.md placeholders and add a photo at `assets/team/keshav.jpg`; landing.html waitlist form posts to a placeholder endpoint — wire to real backend/Formspree before deploy.
- Next in queue: GitHub issue templates (`.github/ISSUE_TEMPLATE/`).
- Later same day (with keshav): finalized TEAM.md (bio, GitHub/LinkedIn links; waitlist URL TBD pending domain). Added issue templates: `bug_report.yml`, `feature_request.yml`, `config.yml` (discussions link — update URL after GitHub org move).
- Next in queue: blog post 1 (`blog/01-architecture.md`).

### 2026-11-13
- Found already complete but unchecked: blog posts 1–3 (in `blog/` as `01-multi-agent-architecture.md`, `02-why-single-agent-is-not-enough.md`, `03-building-fullstack-app-in-5-minutes.md`) and PostHog analytics (`frontend/src/lib/analytics.ts`). Checked off.
- Completed: onboarding email templates in `backend/services/email_templates.py` (welcome, first-build nudge, first-build-done, planning tips), with tests. Templates only: not yet sent or scheduled anywhere.
- Completed: Product Hunt launch kit (`launch/product-hunt.md`): taglines, description, maker comment, FAQ replies, gallery/video plan, launch checklist. Claims checked against code; bracketed placeholders need keshav.
- Completed: "Show HN" draft (`launch/hacker-news.md`): titles, post text, prepared thread answers, and a claim-to-source table. Found there's no logged-out demo in production (`/demo` redirects to `/projects` in LIVE_MODE); flagged in the pre-post checklist.
- Completed: root `README.md` restored from `.stash/README.md` (moved there in 01e9aa3, breaking links from docs/README.md) with corrections (deploy is off in prod, no Cloud Run target, first build free) plus a waitlist placeholder and Contributing/License sections.
- Found: the `landing.html` waitlist form shows "You're on the list!" but never sends the email anywhere (fetch is commented out). Needs a backend endpoint before the page goes live.
- Claude queue is now empty.
- Later same day: added `POST /v1/waitlist` (`backend/api/waitlist.py`) and wired `landing.html` to it. Before the landing page goes live, its origin must be added to `ALLOWED_ORIGINS` on the backend.
- Found (not fixed): `rate_limit_middleware` and `csrf_protection_middleware` in `backend/core/security.py` raise `HTTPException` from function middleware, which FastAPI turns into a 500. Every rate-limit 429, CSRF 403 and body-too-large 413 reaches clients as a 500.
