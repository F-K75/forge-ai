# The Portfolio Mirror — validation runbook

Companion to `docs/icp.md`. Produced by `/office-hours` + `/plan-ceo-review`,
2026-07-27. This is the operational half: the rules and templates needed to run
the test without improvising while tired.

**The test.** Take 20 agencies from Clutch/GoodFirms matching the ICP. For each,
find a project they already shipped, run that public case study through Forge,
and send back the generated PRD and sprint plan with two questions.

**What it answers.** Whether Forge's output is good enough for people who ship
client work for a living, and what those people use today to produce the same
artifacts. Output quality is the gating hypothesis; everything else in the ICP
doc is downstream of it.

---

## 1. The go / no-go rule for output

Decide this now, not at 1am with four emails queued and two hours invested in a
run. The failure mode this prevents is talking yourself into sending something
mediocre because generating it was expensive.

**The rule: would you put your own name on this as a deliverable to a paying
client? If no, it does not go.**

A borderline artifact does not get downgraded into a softer email. The agency
gets skipped and replaced from the reserve list. You have hundreds of agencies
available and exactly one first contact with each.

| Observation in the output | Action |
|---|---|
| Invents a requirement the client never asked for | **Do not send.** Log it. This is the worst failure available — it tells an expert the tool does not understand their domain. |
| Names a technology or vendor the case study never mentions | **Do not send.** Same class as above. |
| Generic enough to describe any project | **Do not send.** It proves nothing and reads as spam. |
| Structurally right, thin on detail | Send. Thin is a fair thing for them to judge. |
| Right but formatted badly | Fix the formatting, then send. Formatting is your problem, not Forge's. |
| Pipeline errored mid-build | Skip the agency, log the error. This is a finding in itself. |
| Case study too vague to extract a brief | Skip. Not a Forge failure. Note the rate — if it is most of them, the whole method needs rethinking. |

**Kill criterion.** If 3 of the first 5 hit a "do not send" row, stop the
campaign. The finding is that output quality is not ready, which is the answer
you came for. Do not burn the remaining 15 looking for a better result.

---

## 2. Tracking

Keep this in the repo, a sheet, or anywhere that is not your memory. In three
weeks you will not recall what agency #7 said, and the PRD-versus-code split is
the entire point of the second question.

| # | Agency | Contact | Sent | Their project used | Replied | Would ship? | Reacted to PRD or code? | What they use today | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |
| 4 | | | | | | | | | |
| 5 | | | | | | | | | |

Batch 2 (agencies 6-20) starts only after batch 1 replies are read and the
opener is revised.

**The columns that matter.** "Would ship?" is the gating hypothesis. "Reacted to
PRD or code?" tests the wedge: a majority engaging with the PRD and sprint plan
supports the coupling thesis, a majority engaging with the code falsifies it and
means you are competing with Lovable and Cursor after all.

---

## 3. The email

One agency, one project they actually shipped, two questions. Not a pitch, not a
demo request.

> Subject: your <PROJECT NAME> build — one question
>
> Hi <NAME>,
>
> I read your case study on <PROJECT>. I am building a tool that turns a project
> brief into a PRD and sprint plan, and I ran your public write-up through it to
> see what it produced. That output is attached.
>
> Two questions, and honest answers help me more than kind ones:
>
> 1. Would you have sent that scope doc to the client?
> 2. What do you use today to produce a PRD and sprint plan for a new project,
>    and roughly how long does it take?
>
> Not selling anything. You know what good looks like for this project and I
> don't, which is why I'm asking you.
>
> <YOUR NAME>

**Why it is shaped like this.** It opens on their work rather than your product,
which is why strangers reply. Question 1 is the gating hypothesis. Question 2
answers the status quo, which is currently unknown and sets the ceiling on what
anyone will pay. "Honest answers help me more than kind ones" measurably reduces
polite-but-useless replies.

**Have an answer ready for "sure, can you do ours?"** That is the good outcome
and it currently has no offer behind it. Minimum viable response: yes, send me
the brief, I will turn it around in 24 hours, free for the first one.

---

## 4. Before the first send

- [ ] Rotate the leaked credentials (`INSTANT_NEXT_STEPS.md` #1). Outreach
      raises the profile of a repo whose history contains live keys.
- [ ] Get Forge running locally and complete one brief end to end. The pipeline
      has never run unattended. If it cannot, that is day-one information.
- [ ] Read that first output as if you were the agency. Formatting problems and
      hallucinations are both invisible until you do this.
- [ ] Start the tracking table above.

## 5. Success criteria

Measured 14 days after the first batch.

- **Gating answer:** at least one agency says they would have shipped the
  output, with or without edits. Zero across all substantive replies means
  output quality is the problem and no go-to-market work fixes it.
- **Wedge test:** count PRD reactions versus code reactions.
- **Status quo:** at least three concrete descriptions of what they use today,
  with a time or cost attached.
- **Reachability:** response rate across 20. Below 10% means the opener is
  wrong, not the segment.

**A note on reading the results.** Three replies out of twenty is a
self-selected sample, and the three who bother replying are more engaged than
the seventeen who do not. One yes out of three is not a positive result. Zero
yeses out of any number of substantive replies is a real negative one. Negative
evidence is stronger than positive evidence at this sample size, so plan to act
on a "no" and be sceptical of a "yes."
