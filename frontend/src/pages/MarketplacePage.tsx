import { useState } from "react";
import { Star, Download, Search } from "lucide-react";
import { TEMPLATES } from "../lib/mockData";
import type { Template } from "../lib/mockData";

type FilterTab = "all" | "official" | "community";

const TABS: { value: FilterTab; label: string }[] = [
  { value: "all",       label: "All"       },
  { value: "official",  label: "Official"  },
  { value: "community", label: "Community" },
];

export default function MarketplacePage() {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const visible = TEMPLATES.filter(t => {
    const matchesFilter = filter === "all" || t.source === filter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.includes(q));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold text-ink">Marketplace</h1>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="bg-panel border border-border rounded-lg pl-8 pr-4 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent w-full sm:w-60"
          />
        </div>
      </header>

      {/* Filter tabs */}
      <div
        role="tablist"
        aria-label="Filter templates"
        className="flex gap-1 mb-6 bg-panel-alt rounded-lg p-1 w-fit"
      >
        {TABS.map(tab => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={filter === tab.value}
            onClick={() => setFilter(tab.value)}
            className={[
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors motion-reduce:transition-none",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              filter === tab.value
                ? "bg-panel text-ink shadow-sm"
                : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="list">
          {visible.map(template => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      ) : (
        <p className="text-center text-muted text-sm py-20">
          No templates match your search.
        </p>
      )}
    </div>
  );
}

function TemplateCard({ template }: { template: Template }) {
  return (
    <article
      role="listitem"
      className="flex flex-col gap-3 p-4 rounded-xl bg-panel border border-border"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-base font-bold select-none"
          style={{ background: `${template.hue}22`, color: template.hue }}
          aria-hidden="true"
        >
          {template.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink truncate">{template.name}</h2>
            <span className="text-[10px] text-faint shrink-0">
              {template.source === "official" ? "Official" : `by ${template.author}`}
            </span>
          </div>
          <p className="text-xs text-muted mt-1 line-clamp-2">{template.description}</p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {template.tags.map(tag => (
          <span
            key={tag}
            className="text-[10px] px-2 py-0.5 rounded-full bg-panel-alt text-faint border border-border-soft"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 mt-auto">
        <div className="flex items-center gap-1 text-xs text-muted" aria-label={`Rating: ${template.rating}`}>
          <Star size={11} className="text-warn fill-warn" aria-hidden="true" />
          <span>{template.rating}</span>
        </div>
        <button
          onClick={() => {/* install — no-op until backend */}}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-alt border border-border text-xs text-ink font-medium hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors motion-reduce:transition-none"
          aria-label={`Install ${template.name} — ${template.installs} installs`}
        >
          <Download size={11} aria-hidden="true" />
          {template.installs}
        </button>
      </div>
    </article>
  );
}
