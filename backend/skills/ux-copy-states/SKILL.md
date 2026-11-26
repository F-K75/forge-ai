---
name: ux-copy-states
version: 1.0.0
domain: design_tools
description: UX microcopy and interface states - empty, loading, error, success - with clear CTAs and consistent voice.
keywords: [microcopy, ux copy, copywriting, empty state, loading state, error message, error state, success message, cta, button label, tooltip, wording, confirmation dialog]
dependencies: []
permissions: [read_repo]
departments: [design, business, engineering]
---
Every screen needs designed states, not just the happy path; copy tells users what happened, why, and what to do next in as few words as possible.

## States checklist
- [ ] Empty: explain what will appear here and offer the first action.
- [ ] Loading: use skeletons for layout-heavy views; show progress for long tasks.
- [ ] Error: say what failed, in plain language, and how to recover (retry, fix input, contact).
- [ ] Partial: show what loaded and mark what did not.
- [ ] Success: confirm the outcome briefly and point to the next step.
- [ ] Permission denied and offline states are distinct from generic errors.

## Copy checklist
- [ ] Buttons start with a verb that names the outcome ("Create project", not "Submit").
- [ ] Destructive confirmations name the object and consequence ("Delete 3 files? This can't be undone.").
- [ ] Field errors sit next to the field and say how to fix the value.
- [ ] Use the user's vocabulary, not internal system names or error codes.
- [ ] Keep terms consistent across the product (one word per concept).
- [ ] Sentence case, short sentences, no blame ("We couldn't save" not "You failed").
- [ ] Leave room for translation (text can grow 30-40%).

## Pitfalls
- "Something went wrong" with no next step.
- Spinners with no timeout or fallback message.
