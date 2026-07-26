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
- [ ] Draft blog post 1: "How We Built a Multi-Agent AI Engineering Platform" → `blog/01-architecture.md`
- [ ] Draft blog post 2: "Why Single-Agent AI Coding Tools Are Not Enough" → `blog/02-positioning.md`
- [ ] Draft blog post 3: "Building a Full-Stack App in 5 Minutes with Forge" → `blog/03-tutorial.md`
- [ ] Add PostHog analytics snippet to frontend (signups, builds started/completed, errors)
- [ ] Draft onboarding welcome email templates for Resend integration
- [ ] Draft Product Hunt launch kit: tagline, description, first comment → `launch/product-hunt.md`
- [ ] Draft "Show HN" post text → `launch/hacker-news.md`
- [ ] Update README with waitlist link and contributing pointers

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
