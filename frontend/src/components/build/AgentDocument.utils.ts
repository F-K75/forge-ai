import type { Agent } from '../../lib/agents';

export function agentDocumentToMarkdown(agentId: Agent["id"], agentLabel: string, output: unknown): string {
  if (!output || typeof output !== 'object') return `# ${agentLabel}\n\nNo document available.\n`;
  const lines: string[] = [`# ${agentLabel}`, ''];
  const list = (items?: string[]) => (items ?? []).forEach((i) => lines.push(`- ${i}`));

  const d: any = output;

  switch (agentId) {
    case 'architect': {
      if (d.app_name) lines.push(`**${d.app_name}**`, '');
      if (d.description) lines.push(d.description, '');
      if (d.pages?.length) {
        lines.push('## Pages', '');
        d.pages.forEach((p: any) => lines.push(`- \`${p.route}\` — ${p.description ?? p.name}`));
        lines.push('');
      }
      if (d.data_models?.length) {
        lines.push('## Data models', '');
        d.data_models.forEach((m: any) => lines.push(`- **${m.name}**: ${(m.fields ?? []).map((f: any) => f.name).join(', ')}`));
        lines.push('');
      }
      if (d.api_endpoints?.length) {
        lines.push('## API endpoints', '');
        d.api_endpoints.forEach((e: any) => lines.push(`- \`${e.method} ${e.path}\` — ${e.description ?? ''}`));
        lines.push('');
      }
      if (d.integrations?.length) {
        lines.push('## Integrations', '');
        list(d.integrations);
        lines.push('');
      }
      if (d.clarifications?.length) {
        lines.push('## Open questions', '');
        list(d.clarifications);
      }
      break;
    }
    case 'business_improver': {
      if (d.executive_summary) lines.push(d.executive_summary, '');
      if (d.value_proposition?.positioning_statement) {
        lines.push('## Positioning', '', `> ${d.value_proposition.positioning_statement}`, '');
      }
      if (d.target_customers?.length) {
        lines.push('## Target customers', '');
        d.target_customers.forEach((c: any) => {
          lines.push(`### ${c.segment ?? 'Segment'}`);
          if (c.pain_points?.length) lines.push(`Pain points: ${c.pain_points.join('; ')}`);
          if (c.jobs_to_be_done?.length) lines.push(`Jobs to be done: ${c.jobs_to_be_done.join('; ')}`);
          lines.push('');
        });
      }
      const tiers = d.recommended_pricing?.tiers ?? [];
      if (tiers.length) {
        lines.push(`## Pricing (${d.recommended_pricing?.recommended_model ?? 'recommended'})`, '');
        tiers.forEach((t: any) => {
          const price = typeof t.price?.amount === 'number' ? (t.price.amount === 0 ? 'Free' : `$${t.price.amount}/${t.price.billing_period}`) : '—';
          lines.push(`### ${t.name} — ${price}`);
          if (t.ideal_for) lines.push(t.ideal_for);
          (t.included ?? []).forEach((inc: string) => lines.push(`- ${inc}`));
          lines.push('');
        });
      }
      if (d.go_to_market?.channels?.length) {
        lines.push('## Go-to-market channels', '');
        list(d.go_to_market.channels);
        lines.push('');
      }
      if (d.go_to_market?.launch_experiments?.length) {
        lines.push('## Launch experiments', '');
        d.go_to_market.launch_experiments.forEach((e: any) => lines.push(`- **${e.experiment}** — ${e.hypothesis ?? ''} (${e.timebox ?? 'no timebox'})`));
        lines.push('');
      }
      if (d.mvp_validation_plan?.metrics_to_track?.length) {
        lines.push('## Metrics to track', '');
        list(d.mvp_validation_plan.metrics_to_track);
      }
      break;
    }
    case 'designer': {
      if (d.theme?.style) lines.push(`Style: **${d.theme.style}**${d.theme.font_family ? ` · ${d.theme.font_family}` : ''}`, '');
      if (d.theme) {
        lines.push('## Theme', '');
        (['primary', 'secondary', 'accent', 'background', 'surface'] as const).forEach((k) => {
          const v = d.theme?.[k];
          if (v) lines.push(`- ${k}: \`${v}\``);
        });
        lines.push('');
      }
      if (d.components && Object.keys(d.components).length) {
        lines.push('## Page components', '');
        Object.entries(d.components).forEach(([page, spec]: any) => {
          lines.push(`- **${page}**: ${(spec.key_elements ?? []).join(', ')}`);
        });
        lines.push('');
      }
      if (d.design_notes) lines.push('## Notes', '', d.design_notes);
      break;
    }
    case 'pm': {
      if (typeof d.score === 'number') lines.push(`**Score: ${d.score}/100** (${d.passed ? 'passed' : 'needs work'})`, '');
      if (d.summary) lines.push(d.summary, '');
      if (d.issues?.length) {
        lines.push('## Issues', '');
        d.issues.forEach((i: any) => lines.push(`- [${(i.severity ?? '').toUpperCase()}] ${i.description}${i.file ? ` (${i.file})` : ''}`));
        lines.push('');
      }
      if (d.missing_features?.length) {
        lines.push('## Missing features', '');
        list(d.missing_features);
      }
      break;
    }
    case 'integration': {
      if (d.instructions) lines.push(d.instructions, '');
      if (d.env_vars_needed?.length) {
        lines.push('## Environment variables', '');
        d.env_vars_needed.forEach((v: string) => lines.push(`- \`${v}\``));
      }
      break;
    }
    default:
      lines.push('```json', JSON.stringify(output, null, 2), '```');
  }
  return lines.join('\n') + '\n';
}
