import type { Agent } from "../../lib/agents";

// These mirror the JSON schemas the backend agents are prompted to return
// (backend/prompt_builder/templates/*_v1.py, backend/agents/*.py) — LLM
// output, so every field is optional and rendering must degrade gracefully
// when a field is missing or malformed rather than throwing.

interface ArchitectBlueprint {
  app_name?: string;
  description?: string;
  pages?: { name?: string; route?: string; description?: string; components?: string[] }[];
  data_models?: { name?: string; fields?: { name?: string; type?: string; required?: boolean }[] }[];
  api_endpoints?: { method?: string; path?: string; description?: string; auth_required?: boolean }[];
  features?: string[];
  integrations?: string[];
  auth_required?: boolean;
  clarifications?: string[];
}

interface BusinessModelPlan {
  executive_summary?: string;
  target_customers?: {
    segment?: string;
    jobs_to_be_done?: string[];
    pain_points?: string[];
    why_now?: string;
    success_metrics?: string[];
  }[];
  value_proposition?: { current?: string; improved?: string; differentiators?: string[]; positioning_statement?: string };
  revenue_model_options?: {
    option?: string;
    how_it_works?: string;
    pros?: string[];
    cons?: string[];
    best_for_segments?: string[];
  }[];
  recommended_pricing?: {
    recommended_model?: string;
    tiers?: {
      name?: string;
      price?: { amount?: number; currency?: string; billing_period?: string };
      ideal_for?: string;
      included?: string[];
      limits?: string[];
    }[];
    assumptions?: string[];
    risks_and_mitigations?: { risk?: string; mitigation?: string }[];
  };
  packaging_and_offer_design?: {
    free_or_trial_strategy?: string;
    add_ons_and_upsells?: { name?: string; description?: string; pricing_suggestion?: string }[];
    retention_levers?: string[];
  };
  go_to_market?: {
    initial_focus?: string[];
    channels?: string[];
    launch_experiments?: { experiment?: string; hypothesis?: string; success_criteria?: string[]; timebox?: string }[];
  };
  mvp_validation_plan?: {
    what_to_test?: string[];
    metrics_to_track?: string[];
    decision_rules?: { condition?: string; next_step?: string }[];
  };
}

interface DesignerSystem {
  theme?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    surface?: string;
    style?: string;
    font_family?: string;
    border_radius?: string;
  };
  layout?: { sidebar?: boolean; topbar?: boolean; sidebar_width?: string; content_max_width?: string };
  components?: Record<string, { layout?: string; key_elements?: string[] }>;
  design_notes?: string;
}

interface PMValidation {
  passed?: boolean;
  score?: number;
  missing_features?: string[];
  issues?: { severity?: string; description?: string; file?: string; suggestion?: string }[];
  summary?: string;
}

interface IntegrationManifest {
  env_vars_needed?: string[];
  instructions?: string;
  files?: Record<string, string>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[10px] font-medium uppercase tracking-wider text-faint mt-4 mb-1.5 first:mt-0">{children}</h4>;
}

function BulletList({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-xs text-muted flex gap-1.5">
          <span className="text-faint">—</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-error",
  high: "text-error",
  medium: "text-warn",
  low: "text-faint",
};

function ArchitectView({ doc }: { doc: ArchitectBlueprint }) {
  return (
    <div>
      {doc.description && <p className="text-xs text-ink leading-relaxed">{doc.description}</p>}

      {doc.pages && doc.pages.length > 0 && (
        <>
          <Heading>Pages ({doc.pages.length})</Heading>
          <ul className="space-y-1.5">
            {doc.pages.map((p, i) => (
              <li key={i} className="text-xs">
                <span className="font-mono text-ink">{p.route ?? p.name}</span>
                {p.description && <span className="text-muted"> — {p.description}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {doc.data_models && doc.data_models.length > 0 && (
        <>
          <Heading>Data models ({doc.data_models.length})</Heading>
          <ul className="space-y-1">
            {doc.data_models.map((m, i) => (
              <li key={i} className="text-xs">
                <span className="font-mono text-ink">{m.name}</span>
                <span className="text-faint"> · {(m.fields ?? []).map((f) => f.name).filter(Boolean).join(", ")}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {doc.api_endpoints && doc.api_endpoints.length > 0 && (
        <>
          <Heading>API endpoints ({doc.api_endpoints.length})</Heading>
          <ul className="space-y-1">
            {doc.api_endpoints.map((e, i) => (
              <li key={i} className="text-xs font-mono">
                <span className="text-agent-integration">{e.method}</span> <span className="text-ink">{e.path}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {doc.integrations && doc.integrations.length > 0 && (
        <>
          <Heading>Integrations</Heading>
          <BulletList items={doc.integrations} />
        </>
      )}

      {doc.clarifications && doc.clarifications.length > 0 && (
        <>
          <Heading>Open questions</Heading>
          <BulletList items={doc.clarifications} />
        </>
      )}
    </div>
  );
}

function BusinessModelView({ doc }: { doc: BusinessModelPlan }) {
  const tiers = doc.recommended_pricing?.tiers ?? [];
  return (
    <div>
      {doc.executive_summary && <p className="text-xs text-ink leading-relaxed">{doc.executive_summary}</p>}

      {doc.value_proposition?.positioning_statement && (
        <>
          <Heading>Positioning</Heading>
          <p className="text-xs text-muted leading-relaxed italic">"{doc.value_proposition.positioning_statement}"</p>
        </>
      )}

      {doc.target_customers && doc.target_customers.length > 0 && (
        <>
          <Heading>Target customers</Heading>
          <div className="space-y-2">
            {doc.target_customers.map((c, i) => (
              <div key={i} className="text-xs">
                <span className="text-ink font-medium">{c.segment}</span>
                {c.pain_points && c.pain_points.length > 0 && (
                  <p className="text-muted mt-0.5">{c.pain_points.join(" · ")}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tiers.length > 0 && (
        <>
          <Heading>Pricing ({doc.recommended_pricing?.recommended_model ?? "recommended"})</Heading>
          <div className="space-y-2">
            {tiers.map((t, i) => (
              <div key={i} className="rounded-md border border-border-soft p-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-ink">{t.name}</span>
                  <span className="text-xs font-mono text-ember">
                    {typeof t.price?.amount === "number"
                      ? `${t.price.amount === 0 ? "Free" : `$${t.price.amount}`}${t.price.amount > 0 ? `/${t.price.billing_period === "annual" ? "yr" : "mo"}` : ""}`
                      : "—"}
                  </span>
                </div>
                {t.ideal_for && <p className="text-[11px] text-faint mt-0.5">{t.ideal_for}</p>}
                {t.included && t.included.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {t.included.slice(0, 4).map((inc, j) => (
                      <li key={j} className="text-[11px] text-muted">✓ {inc}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {doc.go_to_market?.channels && doc.go_to_market.channels.length > 0 && (
        <>
          <Heading>Go-to-market channels</Heading>
          <BulletList items={doc.go_to_market.channels} />
        </>
      )}

      {doc.go_to_market?.launch_experiments && doc.go_to_market.launch_experiments.length > 0 && (
        <>
          <Heading>Launch experiments</Heading>
          <div className="space-y-1.5">
            {doc.go_to_market.launch_experiments.map((e, i) => (
              <div key={i} className="text-xs">
                <span className="text-ink">{e.experiment}</span>
                {e.timebox && <span className="text-faint"> · {e.timebox}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DesignerView({ doc }: { doc: DesignerSystem }) {
  const swatches = doc.theme
    ? [
        ["primary", doc.theme.primary],
        ["secondary", doc.theme.secondary],
        ["accent", doc.theme.accent],
        ["background", doc.theme.background],
        ["surface", doc.theme.surface],
      ].filter(([, v]) => typeof v === "string" && /^#/.test(v as string))
    : [];

  return (
    <div>
      {doc.theme?.style && (
        <p className="text-xs text-ink">
          <span className="text-muted">Style:</span> {doc.theme.style}
          {doc.theme.font_family && <span className="text-muted"> · {doc.theme.font_family}</span>}
        </p>
      )}

      {swatches.length > 0 && (
        <>
          <Heading>Theme</Heading>
          <div className="flex flex-wrap gap-2">
            {swatches.map(([label, hex]) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="h-6 w-6 rounded border border-border-soft" style={{ background: hex }} title={hex} aria-hidden="true" />
                <span className="text-[9px] text-faint">{label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {doc.layout && (
        <>
          <Heading>Layout</Heading>
          <p className="text-xs text-muted">
            {[doc.layout.sidebar ? "sidebar" : null, doc.layout.topbar ? "topbar" : null].filter(Boolean).join(" + ") || "single column"}
            {doc.layout.content_max_width && ` · max ${doc.layout.content_max_width}`}
          </p>
        </>
      )}

      {doc.components && Object.keys(doc.components).length > 0 && (
        <>
          <Heading>Page components</Heading>
          <ul className="space-y-1">
            {Object.entries(doc.components).map(([page, spec]) => (
              <li key={page} className="text-xs">
                <span className="font-mono text-ink">{page}</span>
                {spec.key_elements && spec.key_elements.length > 0 && (
                  <span className="text-faint"> · {spec.key_elements.join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {doc.design_notes && (
        <>
          <Heading>Notes</Heading>
          <p className="text-xs text-muted leading-relaxed">{doc.design_notes}</p>
        </>
      )}
    </div>
  );
}

function PMView({ doc }: { doc: PMValidation }) {
  return (
    <div>
      {typeof doc.score === "number" && (
        <p className="text-xs">
          <span className={doc.passed ? "text-ok" : "text-warn"}>{doc.score}/100</span>
          <span className="text-muted"> · {doc.passed ? "passed" : "needs work"}</span>
        </p>
      )}
      {doc.summary && <p className="text-xs text-ink leading-relaxed mt-1">{doc.summary}</p>}

      {doc.issues && doc.issues.length > 0 && (
        <>
          <Heading>Issues ({doc.issues.length})</Heading>
          <ul className="space-y-1.5">
            {doc.issues.map((issue, i) => (
              <li key={i} className="text-xs">
                {issue.severity && (
                  <span className={`uppercase text-[10px] font-medium ${SEVERITY_COLOR[issue.severity] ?? "text-muted"}`}>
                    {issue.severity}
                  </span>
                )}
                <span className="text-muted"> {issue.description}</span>
                {issue.file && <span className="text-faint font-mono"> ({issue.file})</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {doc.missing_features && doc.missing_features.length > 0 && (
        <>
          <Heading>Missing features</Heading>
          <BulletList items={doc.missing_features} />
        </>
      )}
    </div>
  );
}

function IntegrationView({ doc }: { doc: IntegrationManifest }) {
  return (
    <div>
      {doc.instructions && <p className="text-xs text-ink leading-relaxed">{doc.instructions}</p>}
      {doc.env_vars_needed && doc.env_vars_needed.length > 0 && (
        <>
          <Heading>Environment variables</Heading>
          <ul className="space-y-0.5">
            {doc.env_vars_needed.map((v) => (
              <li key={v} className="text-xs font-mono text-muted">{v}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function AgentDocumentView({ agentId, output }: { agentId: Agent["id"]; output: unknown }) {
  if (!output || typeof output !== "object") return null;
  switch (agentId) {
    case "architect":
      return <ArchitectView doc={output as ArchitectBlueprint} />;
    case "business_improver":
      return <BusinessModelView doc={output as BusinessModelPlan} />;
    case "designer":
      return <DesignerView doc={output as DesignerSystem} />;
    case "pm":
      return <PMView doc={output as PMValidation} />;
    case "integration":
      return <IntegrationView doc={output as IntegrationManifest} />;
    default:
      return null;
  }
}

// Renders the same structured output as a standalone Markdown document, for
// the explorer's "download document" action — a real export of what the
// agent actually returned, not a re-summary.
export function agentDocumentToMarkdown(agentId: Agent["id"], agentLabel: string, output: unknown): string {
  if (!output || typeof output !== "object") return `# ${agentLabel}\n\nNo document available.\n`;
  const lines: string[] = [`# ${agentLabel}`, ""];
  const list = (items?: string[]) => (items ?? []).forEach((i) => lines.push(`- ${i}`));

  switch (agentId) {
    case "architect": {
      const d = output as ArchitectBlueprint;
      if (d.app_name) lines.push(`**${d.app_name}**`, "");
      if (d.description) lines.push(d.description, "");
      if (d.pages?.length) {
        lines.push("## Pages", "");
        d.pages.forEach((p) => lines.push(`- \`${p.route}\` — ${p.description ?? p.name}`));
        lines.push("");
      }
      if (d.data_models?.length) {
        lines.push("## Data models", "");
        d.data_models.forEach((m) => lines.push(`- **${m.name}**: ${(m.fields ?? []).map((f) => f.name).join(", ")}`));
        lines.push("");
      }
      if (d.api_endpoints?.length) {
        lines.push("## API endpoints", "");
        d.api_endpoints.forEach((e) => lines.push(`- \`${e.method} ${e.path}\` — ${e.description ?? ""}`));
        lines.push("");
      }
      if (d.integrations?.length) {
        lines.push("## Integrations", "");
        list(d.integrations);
        lines.push("");
      }
      if (d.clarifications?.length) {
        lines.push("## Open questions", "");
        list(d.clarifications);
      }
      break;
    }
    case "business_improver": {
      const d = output as BusinessModelPlan;
      if (d.executive_summary) lines.push(d.executive_summary, "");
      if (d.value_proposition?.positioning_statement) {
        lines.push("## Positioning", "", `> ${d.value_proposition.positioning_statement}`, "");
      }
      if (d.target_customers?.length) {
        lines.push("## Target customers", "");
        d.target_customers.forEach((c) => {
          lines.push(`### ${c.segment ?? "Segment"}`);
          if (c.pain_points?.length) lines.push(`Pain points: ${c.pain_points.join("; ")}`);
          if (c.jobs_to_be_done?.length) lines.push(`Jobs to be done: ${c.jobs_to_be_done.join("; ")}`);
          lines.push("");
        });
      }
      const tiers = d.recommended_pricing?.tiers ?? [];
      if (tiers.length) {
        lines.push(`## Pricing (${d.recommended_pricing?.recommended_model ?? "recommended"})`, "");
        tiers.forEach((t) => {
          const price = typeof t.price?.amount === "number" ? (t.price.amount === 0 ? "Free" : `$${t.price.amount}/${t.price.billing_period}`) : "—";
          lines.push(`### ${t.name} — ${price}`);
          if (t.ideal_for) lines.push(t.ideal_for);
          (t.included ?? []).forEach((inc) => lines.push(`- ${inc}`));
          lines.push("");
        });
      }
      if (d.go_to_market?.channels?.length) {
        lines.push("## Go-to-market channels", "");
        list(d.go_to_market.channels);
        lines.push("");
      }
      if (d.go_to_market?.launch_experiments?.length) {
        lines.push("## Launch experiments", "");
        d.go_to_market.launch_experiments.forEach((e) => lines.push(`- **${e.experiment}** — ${e.hypothesis ?? ""} (${e.timebox ?? "no timebox"})`));
        lines.push("");
      }
      if (d.mvp_validation_plan?.metrics_to_track?.length) {
        lines.push("## Metrics to track", "");
        list(d.mvp_validation_plan.metrics_to_track);
      }
      break;
    }
    case "designer": {
      const d = output as DesignerSystem;
      if (d.theme?.style) lines.push(`Style: **${d.theme.style}**${d.theme.font_family ? ` · ${d.theme.font_family}` : ""}`, "");
      if (d.theme) {
        lines.push("## Theme", "");
        (["primary", "secondary", "accent", "background", "surface"] as const).forEach((k) => {
          const v = d.theme?.[k];
          if (v) lines.push(`- ${k}: \`${v}\``);
        });
        lines.push("");
      }
      if (d.components && Object.keys(d.components).length) {
        lines.push("## Page components", "");
        Object.entries(d.components).forEach(([page, spec]) => {
          lines.push(`- **${page}**: ${(spec.key_elements ?? []).join(", ")}`);
        });
        lines.push("");
      }
      if (d.design_notes) lines.push("## Notes", "", d.design_notes);
      break;
    }
    case "pm": {
      const d = output as PMValidation;
      if (typeof d.score === "number") lines.push(`**Score: ${d.score}/100** (${d.passed ? "passed" : "needs work"})`, "");
      if (d.summary) lines.push(d.summary, "");
      if (d.issues?.length) {
        lines.push("## Issues", "");
        d.issues.forEach((i) => lines.push(`- [${(i.severity ?? "").toUpperCase()}] ${i.description}${i.file ? ` (${i.file})` : ""}`));
        lines.push("");
      }
      if (d.missing_features?.length) {
        lines.push("## Missing features", "");
        list(d.missing_features);
      }
      break;
    }
    case "integration": {
      const d = output as IntegrationManifest;
      if (d.instructions) lines.push(d.instructions, "");
      if (d.env_vars_needed?.length) {
        lines.push("## Environment variables", "");
        d.env_vars_needed.forEach((v) => lines.push(`- \`${v}\``));
      }
      break;
    }
    default:
      lines.push("```json", JSON.stringify(output, null, 2), "```");
  }
  return lines.join("\n") + "\n";
}
