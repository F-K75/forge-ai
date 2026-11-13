# Product Hunt launch kit

Draft. Everything in `[brackets]` needs filling in before launch. Character
limits are Product Hunt's; counts are noted next to each field.

**Before you post, check these claims are still true:**
- Free plan is 5 credits; Standard $20/mo (100 credits); Pro $50/mo (750 credits)
  (`backend/core/config.py`).
- Code can be pushed to GitHub (`POST /deployments/github/push`).
- One-click hosting is **not** claimed anywhere below: Docker deployments are
  off in production (`DEPLOYMENTS_ENABLED`). Don't add it unless that changes.
- No user counts, testimonials or "trusted by" lines: there are no users yet
  (`docs/icp.md`). Add real numbers only once they exist.

---

## Name

Forge

## Tagline (max 60 chars)

Pick one:

1. `An AI engineering team that plans, designs and builds apps` (58)
2. `From product idea to PRD, sprint plan and working code` (54)
3. `AI agents that scope, plan and build your next app` (50)

Recommendation: **#2**. It names the thing no competitor does (the planning
layer) instead of competing with every "AI builds your app" tagline.

## Description (max 260 chars)

> Forge is a team of AI agents for building software. A PM agent turns your
> idea into a PRD, epics, stories and sprints. An architect, designer and
> developers build the app, and QA checks it. Review the plan, watch every
> agent work, push the code to GitHub.

(255 chars)

## Topics

Developer Tools, Artificial Intelligence, Productivity, No-Code

## Links

- Website: `[https://... — production URL]`
- Waitlist / signup: `[URL]`
- GitHub: `[repo URL if public; otherwise omit]`

## Pricing field

Freemium. Free plan with 5 credits; paid plans from $20/month.

## Launch offer (optional)

`[e.g. "Product Hunt: 50 bonus credits with code HUNT50" — only if a
redeemable code actually exists in billing. Don't announce one that doesn't.]`

---

## Maker's first comment

Post this the moment the launch goes live. Edit the bracketed parts into your
own voice; it reads better in first person from the founder.

> Hey Product Hunt 👋
>
> I'm [name], and I built Forge because every AI coding tool I tried made me a
> faster typist but left me doing everything around the code myself: scoping
> the work, writing the spec, breaking it into tickets, planning the sprint,
> checking the result.
>
> Forge treats software the way a small engineering team does:
>
> **1. Plan first.** Describe a product and a PM agent writes a PRD, then breaks
> it into epics, user stories, tasks and sprints. You review and approve the
> plan before anything gets built.
>
> **2. Specialists, not one generalist.** An architect designs the data model and
> API, a designer sets up the UI system, developers write the code, and
> integration, QA and security agents each do their part. Each agent only gets
> the context its role needs, so nothing gets lost in one giant prompt.
>
> **3. Fix, don't just generate.** When a build fails, a debug loop analyzes the
> error, applies a fix and retries.
>
> **4. You stay in control.** Every agent's work is visible live, plans need your
> approval, and the code is yours: push it to GitHub.
>
> Who it's for: agencies and small product teams who deliver whole apps, and
> who need the plan and paperwork as much as the code.
>
> What it isn't (yet): an editor plugin. If you want autocomplete inside VS
> Code, Copilot and Cursor are great at that. Forge is for the step before and
> around the code.
>
> You get 5 free credits to try it. I'd love feedback on two things in
> particular: [1. was the generated plan useful, 2. where did a build go wrong].
> I'll be here all day answering questions.

## Short replies to likely questions

Keep these handy for the comment thread. Adjust before using.

- **"How is this different from Cursor / Copilot?"**
  They make you faster inside a file. Forge works one level up: it plans the
  product (PRD, epics, sprints) and builds the whole app with a team of
  specialized agents. Many people will use both.

- **"How is this different from Lovable / Bolt / v0?"**
  Those are great at turning a prompt into a UI fast. Forge adds the planning
  layer: a reviewed PRD, a backlog and sprints, and separate agents for
  architecture, QA and security. It's built for apps you'll keep developing,
  not just a first draft.

- **"What stack does it generate?"**
  `[Confirm before launch. Default today: React frontend, FastAPI backend,
  MongoDB.]`

- **"Do I own the code?"**
  Yes. You own the code Forge generates for you (Terms of Service §4), and
  you can push it to your own GitHub repo.

- **"What does a build cost?"**
  Your first build is free. After that it depends on the size of the app and
  the stack, since each agent step uses credits (a typical build is ~15–17).
  Standard is $20/month for 100 credits.

- **"Which payment methods?"**
  Cards via Stripe, plus Razorpay for payments in India (INR).
  `[Confirm both are live in production.]`

---

## Gallery (images, 1270×760)

1. Hero: the idea prompt + the generated plan side by side, with the tagline.
2. The Initiative view: PRD → epics → stories → sprint board.
3. The live agent flow: architect → designer → developer → QA, in progress.
4. A finished app preview next to its generated file tree.
5. Pricing: Free / Standard / Pro.

Use real screenshots of the product, not mockups.

## Video (optional, under 60s)

1. 0–10s: type a one-line product idea.
2. 10–25s: the PRD and sprint plan appear; click "Approve".
3. 25–45s: agents build, shown in the live flow view (sped up).
4. 45–60s: click through the finished app, push to GitHub. End on the tagline.

---

## Launch-day checklist

- [ ] Production signup, email verification and payments tested end to end
- [ ] A launch build tested end to end on a fresh account (the first build
      on every account is free, per `backend/api/builds.py`)
- [ ] Launch scheduled for 12:01 AM Pacific, Tuesday–Thursday
- [ ] Hunter lined up `[name, or self-hunt]`
- [ ] Gallery images and video uploaded
- [ ] Maker comment ready to paste
- [ ] Twitter/X, LinkedIn and Discord posts ready to go out at launch
      (accounts still need creating; see `FORGE_TASKS.md`)
- [ ] Someone available to reply to comments all day
- [ ] Don't ask anyone to upvote. Ask people to check it out and comment;
      Product Hunt penalizes vote solicitation.
