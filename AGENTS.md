# UI Standards & Guidelines for AI Coding Agents

UI STANDARDS — apply to all UI output unless overridden

## DESIGN TOKENS
- Define a token set before writing components: colors (primary, secondary, neutral scale, semantic: success/warning/error/info), spacing scale (4/8/12/16/24/32/48/64px), typography scale (H1–H6, body, caption), border-radius scale, shadow/elevation levels.
- Never hardcode raw hex/px values inline — reference tokens.
- Token implementations live in `/frontend/src/lib/designTokens.ts` and CSS variables in `/frontend/src/index.css`.

## LAYOUT
- Use a 12-column grid or flex/grid layout, not absolute positioning.
- Define breakpoints: mobile (<640px), tablet (640–1024px), desktop (>1024px).
- Consistent max-width containers; no fixed pixel widths on responsive pages.

## COMPONENTS
- Every interactive component must define states: default, hover, active, focus, disabled, error/invalid, loading.
- Buttons: max 3 visual weights (primary, secondary, ghost/text).
- Forms: label + input + helper/error text pattern, consistent across all forms.
- Tables/data views: sticky headers, zebra striping or dividers, empty-state and loading-state variants (important for dashboards / backtest results).

## ACCESSIBILITY
- WCAG AA minimum: 4.5:1 contrast for text, 3:1 for large text/icons.
- All interactive elements keyboard-navigable and screen-reader labeled.
- Touch targets ≥ 44x44px on mobile.

## CONTENT & MICROCOPY
- Error messages: state what happened + how to fix it, no blame language.
- Empty states: explain what belongs there + a clear next action.

## MOTION
- Transitions 150–300ms, ease-in-out; avoid motion for its own sake.

## OUTPUT FORMAT
- When generating code, use CSS variables/design tokens, not magic numbers.
- Favor composable components over one-off styled elements.
