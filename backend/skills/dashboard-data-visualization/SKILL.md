---
name: dashboard-data-visualization
version: 1.0.0
domain: design_tools
description: Charts, KPI tiles, and dashboards that are accurate, accessible, and readable at a glance in light and dark themes.
keywords: [chart, charts, graph, data visualization, visualiz, dashboard, kpi tile, stat tile, sparkline, legend, axis, recharts, d3, plot, heatmap]
dependencies: [accessible-design-systems]
permissions: [read_repo]
departments: [design, engineering]
---
Choose the chart from the question being answered, show the most important number first, and never let styling distort the data.

## Checklist
- [ ] Start from the decision the dashboard supports; cut charts that do not serve it.
- [ ] Put headline KPIs first with value, unit, comparison period, and trend direction.
- [ ] Choose the form by task: line for trends, bar for comparison, stacked bar for composition, table for exact lookup.
- [ ] Start bar axes at zero; label axes and units; avoid dual axes and 3D.
- [ ] Use a categorical palette with at most ~7 series; highlight one series and mute the rest.
- [ ] Ensure series colors meet contrast and are distinguishable for color-blind users; add labels or patterns.
- [ ] Prefer direct labels over legends when there are few series.
- [ ] Format numbers consistently (thousands separators, abbreviations, fixed decimals).
- [ ] Provide tooltips plus an accessible text or table alternative.
- [ ] Design loading, empty, and error states for every chart.
- [ ] Verify the chart in both light and dark themes using semantic tokens.

## Pitfalls
- Pie charts with many slices; use a sorted bar chart instead.
- Averages hiding distribution; show percentiles where tails matter.
