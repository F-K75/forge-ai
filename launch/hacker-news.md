# Show HN post

Draft. Fill in everything in `[brackets]` and rewrite in your own words before
posting: HN readers spot marketing copy instantly, and the post should sound
like a developer explaining a project, not a launch.

**Before you post, check:**
- [ ] There's a way to try it without much friction. HN dislikes signup walls,
      and right now there's no logged-out demo: in production (`LIVE_MODE`)
      `/demo` redirects to `/projects`, which needs an account. Either add a
      public demo (a recorded run or read-only sample project) or link a
      short video, and say plainly that trying it needs a signup.
- [ ] If the repo is public (it's MIT-licensed), link it. Source access gets a
      much better reception on HN than a closed product.
- [ ] The free 5 credits can complete a real build on a fresh account.
- [ ] Every technical claim below is still true (each one was checked against
      the code on 2026-11-13; file pointers are in the notes at the bottom).
- [ ] You can stay in the thread for the first 3–4 hours to answer questions.

Post on a weekday morning, US Pacific time. Don't ask anyone to upvote; HN
detects and penalizes vote rings.

---

## Title (max 80 chars)

Pick one:

1. `Show HN: Forge – AI agents that write the PRD and sprint plan, then the code` (76)
2. `Show HN: Forge – a multi-agent pipeline that plans and builds full-stack apps` (77)

Recommendation: **#1**. The planning layer is the distinctive part; "AI builds
apps" alone reads as one more of many.

## URL

`[repo URL if public, otherwise the /demo URL]`

## Text

> Hi HN, I'm [name]. Forge is a set of AI agents that take a product idea,
> write a PRD, break it into epics, stories, tasks and sprints, and then
> build the app.
>
> Demo: [video or public demo URL] / Code: [repo URL, MIT]
>
> I started it because AI coding tools made me faster inside a file, but most
> of the time on client projects went into everything around the code:
> scoping, specs, tickets, sprint plans, checking the result. I wanted to see
> how far a pipeline of narrow agents could get on the whole thing.
>
> How it works:
>
> - Planning: a business-analyst agent, a PRD writer, and epic, story, task and
>   sprint generators produce a plan you review and approve before anything is
>   built.
>
> - Building: an architect agent designs the data model and API, a designer
>   sets up the UI system, a developer writes the files, and integration, QA,
>   security and devops agents run after it. Each agent gets only the context
>   its role needs rather than one huge prompt.
>
> - Structured handoffs: agents hand off JSON validated against a schema. When
>   a model returns invalid JSON, the gateway sends one repair prompt with the
>   validation errors instead of failing the build. Malformed JSON between
>   agents was the most common failure early on.
>
> - Debug loop: when a build fails, a debug step reads the error, patches the
>   code and retries, up to 3 times.
>
> - Models: one gateway in front of Anthropic, OpenAI, Azure OpenAI, Gemini,
>   Groq, Mistral and Ollama, with failover between providers, a circuit
>   breaker and per-user budgets. You can bring your own API key.
>
> - Generated apps get a strict default Content Security Policy and a
>   moderation pass that flags things like hardcoded secrets.
>
> Stack: FastAPI, Celery and Redis for the agent pipeline, MongoDB, and a
> React frontend.
>
> What doesn't work well yet:
>
> - [Be specific and honest here. Examples to verify and replace: large apps
>   still need manual fixes after the debug loop gives up; output quality
>   varies a lot between models; one-click hosting is off in production, so
>   you push the code to GitHub and deploy it yourself.]
> - No editor integration. If you live in VS Code, this complements Copilot
>   or Cursor rather than replacing them.
>
> I'd especially like feedback on whether the generated plans (PRD, stories,
> sprints) are useful on their own, and on where builds break for you.

---

## Prepared answers for the thread

Short, factual, no marketing. Adjust before using.

- **"Isn't this just a wrapper around an LLM?"**
  The model calls are the easy part. Most of the work is in the handoffs:
  schemas between agents, repair on bad output, retries and failover, a debug
  loop, and keeping each agent's context small. [Add a concrete example of a
  failure this fixed.]

- **"Why many agents instead of one big prompt?"**
  Smaller, role-specific contexts were more reliable than one long prompt, and
  they make failures easier to locate: you can see which agent produced the
  bad output. [Back this with numbers if you have them; otherwise say it's
  what you observed.]

- **"How does it compare to Lovable / Bolt / v0?"**
  Those are fast at prompt-to-UI. Forge spends more time up front on the plan
  (PRD, backlog, sprints) and runs separate QA and security passes. It's aimed
  at apps you keep developing, not a first draft.

- **"What does it cost to run?"**
  [Real numbers: typical tokens or cost per build on your default model.]
  Users can bring their own API key.

- **"Who owns the generated code?"**
  The user, per the Terms of Service (§4). Push it to your own repo.

- **"Can I self-host it?"**
  [Yes/no. If the repo is public: it runs with docker-compose (MongoDB, Redis,
  API, Celery worker, frontend).]

---

## Notes: where each claim comes from

Verify before posting; the code may have changed.

| Claim | Source |
|---|---|
| Planning agents | `backend/agents/` (business_analyst, prd_writer, epic/story/task generators, sprint_planner) |
| Build agents | `backend/agents/` (architect, designer, developer, integration, qa, security, devops) |
| Schema-validated handoffs + one repair | `backend/agents/structured_schemas.py`, `backend/gateway/service.py` |
| Debug loop, max 3 retries | `MAX_DEBUG_ITERATIONS = 3` in `backend/core/orchestrator.py` |
| Providers | `backend/providers/` |
| Failover, circuit breaker, budgets, BYOK | `backend/gateway/service.py`, `backend/core/llm/circuit_breaker.py`, `backend/core/llm/budget_manager.py`, `backend/agents/base.py` |
| CSP and moderation for generated apps | `backend/sandbox/csp.py`, `backend/sandbox/moderation.py` |
| Hosting off in production | `DEPLOYMENTS_ENABLED` guard in `backend/api/deployments.py` |
| MIT license | `LICENSE` |
| Code ownership | `TERMS_OF_SERVICE.md` §4 |
