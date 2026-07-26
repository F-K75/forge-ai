# Ideal Customer Profile

**Status:** Hypothesis, not finding. Forge has zero users, so nothing here is
validated. Every claim below is written to be *falsifiable* — each section ends
with what would prove it wrong. Revise this document as evidence arrives; do not
treat it as settled.

**Source:** `FORGE_AI_BUSINESS_AUDIT.md` §4 (competition), §5 (customers),
§8 (pricing), reconciled against what `backend/core/config.py` actually ships.

---

## The decision

**Primary ICP: small and mid-sized digital product agencies (2–30 people) that
build custom applications for external clients, starting with India.**

Secondary: startup engineering teams (3–20). Deliberately deprioritised:
enterprise, and indie developers as a *paying* segment.

The audit's §5 table ranks enterprise "Highest" priority on ARPU alone. Choosing
on ARPU is how a pre-revenue company spends a year losing enterprise deals. The
ranking below weighs ARPU against whether Forge can actually win the segment
today.

| Segment | ARPU (audit) | Can Forge win it now? | Call |
|---|---|---|---|
| Dev agencies | $500–2,000/mo | Yes — see below | **Primary** |
| Startup teams | $200–500/mo | Partly — blocked on editor integration | Secondary |
| Indie devs | $20–50/mo | Yes, but churns and barely pays | Funnel, not target |
| Enterprise | $5K–50K/mo | No — no SOC 2, no case studies, no sales motion | Defer |

### Why agencies

Four of Forge's five genuine advantages point at agencies specifically.

1. **The agile PM layer is the wedge.** BA → PRD → epics → stories → sprint
   planning is, per audit §4, something *no competitor has*. For a solo developer
   this is overhead. For an agency it is billable client-facing artefact: the
   scoping document, the sprint plan, the status report. Forge is the only tool
   that produces the app *and* the paperwork the client is actually buying.
2. **Full app build matches the unit of work.** An agency's deliverable is a
   whole application, not an autocompletion. Cursor and Copilot make a developer
   faster inside a file; they do not compress a six-week MVP engagement.
3. **No editor integration is not disqualifying here.** Audit §4 lists the
   missing VS Code/desktop story as a top-five weakness, and it is — for
   developers who live in an editor. An agency principal scoping and delivering
   client work does not.
4. **Razorpay is a real distribution edge.** India has one of the largest
   concentrations of small dev agencies in the world, and per §4 no competitor
   bills in INR. Competing with Cursor for a San Francisco startup's seat is a
   losing fight; being the only tool an agency in Pune can actually pay for is
   not.

The pricing already ships a volume discount that fits: Pro gives 7.5× the credits
of Standard for 2.5× the price ($1.00 versus $3.00 per build). That curve rewards
exactly the high-throughput buyer an agency is, and penalises the occasional one.

### Why not enterprise yet

Audit §5 names procurement and legal as gates, and §4 marks enterprise readiness
"❌ Not ready". A segment needing SOC 2, an MSA, indemnification, and a
6–18 month sales cycle cannot be served by a pre-seed team with no compliance
posture. Revisit once there are reference customers and an audit trail — the
agency motion produces both.

**Falsified if:** agencies say the PM artefacts are worthless because clients
want *their* templates; or agency deal cycles prove as slow as enterprise; or
India-based agencies won't pay USD-equivalent rates for a tool without a brand.

---

## Personas

Sharpened from audit §5. Status remains UNVALIDATED for all.

### Primary — "Raj", agency owner/principal

- **Company:** 8-person product studio, Bengaluru. Builds MVPs and internal tools
  on fixed-price contracts of $8K–40K.
- **Measured on:** projects delivered per quarter, and margin per project.
- **Pain:** every engagement burns two weeks on scoping and boilerplate before
  anything client-visible exists. That time is unbillable and it caps throughput.
- **Forge job:** compress discovery-to-first-demo from two weeks to two days, and
  emit the PRD and sprint plan as a by-product.
- **Buys when:** one delivered client project proves the time saving. He will not
  buy on a feature list.
- **Churns when:** output quality forces a rewrite. One bad client deliverable
  ends the relationship permanently — his reputation is the product.

### Secondary — "Priya", startup CTO

- **Company:** 12-engineer Series A.
- **Pain:** velocity bottleneck; roadmap outruns the team.
- **Forge job:** parallel multi-agent development of whole features.
- **Blocker:** her team lives in Cursor and VS Code. Until Forge reaches the
  editor, it is a context switch, and context switches lose.

### Funnel, not target — "Sam", solo founder

Real, numerous, and reachable — but $20–50/mo with high churn will not fund a
company. Sam matters as the top of the funnel and as the source of public proof
(showcase builds, word of mouth), not as the revenue base.

### Anti-personas — explicitly not for us

Naming these is as load-bearing as naming the targets.

- **Developers wanting faster autocomplete.** That is Copilot and Cursor. Forge
  loses on latency, integration, and price.
- **Non-technical no-code builders.** Forge emits a real codebase that needs a
  developer to own, deploy, and maintain it. Bubble and Lovable serve this
  buyer better.
- **Regulated enterprise buyers.** No SOC 2, no DPA, no indemnification. Pursuing
  them now burns months for nothing.

---

## Jobs to be done

Framed as the buyer would say it, with the honest incumbent.

| Job | Solved today with | What Forge must beat |
|---|---|---|
| "Get a client from signed contract to working demo before they lose interest" | Two weeks of manual scaffolding | Two weeks, not a marginal speedup |
| "Show the client a plan that justifies the invoice" | Hand-written PRDs and sprint decks | Quality of generated artefacts, not existence |
| "Take on a fourth concurrent project without a fourth hire" | Declining the work | Cost per project versus a contractor |
| "Ship the feature without pulling seniors off the roadmap" | Sprint triage | Output quality at review time |

The first and third are where Forge's multi-agent pipeline is differentiated. The
second is where the PM layer is unique. Lead with those.

---

## What must be true, and how to test it

None of this is knowable from the codebase. Ordered by what would kill the
thesis fastest and cheapest.

| # | Assumption | Cheapest test | Kills the thesis if |
|---|---|---|---|
| 1 | Output is good enough to put in front of a paying client | Build 3 real apps end to end; have a senior engineer review | Needs substantial rewrite |
| 2 | Agencies value the PM artefacts | 10 agency interviews; show a generated PRD and sprint plan | They discard them for their own templates |
| 3 | Two weeks really becomes two days | Time one real engagement against a baseline | Saving is under ~40% |
| 4 | India agencies will pay $50/mo+ | Price-test Pro against 20 agencies | Conversion stays near zero at $50 |
| 5 | Agencies are reachable without a brand | Cold outreach to 50; measure reply rate | Under 5% reply |

Assumption 1 gates everything. Do not run 2–5 before it, and do not launch
publicly before it: audit §4 notes output quality is entirely unproven, and for
this ICP a single bad deliverable is unrecoverable.

---

## Blocker: the free tier cannot demonstrate the product

Found while reconciling this ICP against `backend/core/config.py`. It invalidates
the acquisition path for every persona above, so it is recorded here rather than
left implicit.

A build costs **15 credits** — architect 3, designer 2, developer 5, integration
2, PM 1, business model 2 — plus 2 per debug iteration. The free tier grants
**5 credits** (`free_credits`, reduced from 10 to limit abuse).

**A free user cannot complete a single build.** They exhaust their credits about
a third of the way through their first attempt and never see a finished
application. Every persona here buys on *proof*, and Raj explicitly will not buy
on a feature list. The funnel is severed at the first step.

Audit §8 flagged the opposite risk — a 10-credit free tier being too generous —
and the correction overshot. Both concerns are real; the resolution is not a
credit number in either direction:

- Let the first build always complete, then meter afterwards. One finished app is
  the demo, and the abuse ceiling is one build per account.
- Or ship pre-built showcase applications so proof does not depend on free credits
  at all. This also fills the empty marketplace noted in §4.

Recommend both. Neither is priced work.

---

## Where this must show up next

An ICP that lives only in this file changes nothing. It resolves the audit's §2
and §7 findings — no formal vision, no positioning, "developers" as the target —
only when it propagates:

- `README.md` and `landing.html` both currently say "Your AI Engineering Team",
  which is aimed at everyone and therefore no one. Rewrite against Raj.
- Pricing page copy should lead with cost per project, not credits per month —
  §8 notes credits force the buyer into mental arithmetic.
- The three drafted blog posts in `FORGE_TASKS.md` should be re-aimed at agency
  readers before they are written.

The positioning rewrite is tracked separately as the next P0 in
`FORGE_AUDIT_LOG.md`; it depends on this document.
