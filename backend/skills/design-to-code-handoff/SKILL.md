---
name: design-to-code-handoff
version: 1.0.0
domain: design_tools
description: Turning Figma designs into implementation-ready specs - tokens, component mapping, states, breakpoints, and edge cases.
keywords: [figma, handoff, design spec, redline, mockup, prototype, design token, component mapping, pixel, implement design, design review]
dependencies: [accessible-design-systems]
permissions: [read_repo]
departments: [design, engineering]
---
A design is ready for engineering when every value maps to a token, every element maps to an existing or specified component, and every state is drawn.

## Checklist
- [ ] Map each element to an existing component and variant; flag anything new explicitly.
- [ ] Express colors, spacing, radius, typography, and shadows as design tokens, not raw values.
- [ ] Specify all interaction states: default, hover, focus, active, disabled, loading, error.
- [ ] Include empty, long-content, and overflow cases (long names, 0 and 1000 items).
- [ ] Define responsive behaviour for each breakpoint, or reference the layout pattern used.
- [ ] Annotate accessibility: focus order, labels, roles, and keyboard shortcuts.
- [ ] Describe motion with duration, easing, and reduced-motion fallback.
- [ ] Provide exported assets (SVG icons, images at 1x/2x) with names matching the codebase.
- [ ] Note data requirements and API fields each view needs.
- [ ] Review the implemented build against the design and log deviations.

## Pitfalls
- Pixel-perfect mockups with one-off values that bypass the design system.
- Designs showing only ideal data and the happy path.
