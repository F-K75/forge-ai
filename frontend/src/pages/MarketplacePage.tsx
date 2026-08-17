import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, Download, Search } from "lucide-react";
import toast from "react-hot-toast";
import { motion, useReducedMotion } from "motion/react";
import { motionVariants } from "../lib/animations";
import { TEMPLATES } from "../lib/mockData";
import type { Template } from "../lib/mockData";
import { LIVE_MODE } from "../lib/env";
import { marketplaceApi } from "../lib/api";
import { HUE_CYCLE } from "../lib/theme";
import { Card, Button, Heading } from "../components/ui";
import { radius } from "../lib/designTokens";

type FilterTab = "all" | "official" | "community";

const TABS: { value: FilterTab; label: string }[] = [
  { value: "all",       label: "All"       },
  { value: "official",  label: "Official"  },
  { value: "community", label: "Community" },
];

// The real marketplace model has no color field — pick a stable accent per
// item from its id so cards stay visually distinct without a backend field.
const HUES = HUE_CYCLE;
function hueForId(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return HUES[sum % HUES.length];
}

interface RawItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  rating: number;
  downloads: number;
}

function toDisplayTemplate(raw: RawItem): Template {
  return {
    id: raw.id,
    name: raw.title,
    author: "Community",
    source: "community",
    description: raw.description,
    tags: raw.tags,
    rating: Math.round(raw.rating * 10) / 10,
    installs: raw.downloads >= 1000 ? `${(raw.downloads / 1000).toFixed(1)}k` : String(raw.downloads),
    hue: hueForId(raw.id),
  };
}

export default function MarketplacePage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [liveTemplates, setLiveTemplates] = useState<Template[] | null>(null);

  useEffect(() => {
    if (!LIVE_MODE) return;
    marketplaceApi
      .list({ search: search.trim() || undefined })
      .then((items: RawItem[]) => setLiveTemplates(items.map(toDisplayTemplate)))
      .catch(() => toast.error("Couldn't load the marketplace. Please try again."));
  }, [search]);

  const source = LIVE_MODE ? liveTemplates ?? [] : TEMPLATES;

  const visible = source.filter(t => {
    // The real backend has no official/community distinction — the filter
    // tabs only apply to demo-mode mock data.
    const matchesFilter = LIVE_MODE || filter === "all" || t.source === filter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      LIVE_MODE ||
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.includes(q));
    return matchesFilter && matchesSearch;
  });

  const handleInstall = async (template: Template) => {
    if (!LIVE_MODE) return;
    try {
      const { prompt } = await marketplaceApi.download(template.id);
      navigate("/build/new", { state: { prompt } });
    } catch {
       toast.error("Couldn't install that template. Please try again.");
    }
  };

  return (
    <motion.div
      className="mx-auto max-w-5xl px-4 py-6 md:px-8"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Heading level="h2">Marketplace</Heading>
          <Heading level="body" className="mt-1">
            Pre-built starters from Forge and the community. Install one to open it as a project.
          </Heading>
        </div>
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="h-10 w-full border border-border bg-panel-alt pl-8 pr-4 text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:w-60"
            style={{ borderRadius: radius.md }}
          />
        </div>
      </header>

      {/* Filter tabs — demo mode only, real backend has no official/community split */}
      {!LIVE_MODE && (
        <div
          role="tablist"
          aria-label="Filter templates"
          className="mb-8 flex flex-wrap gap-2"
        >
          {TABS.map(tab => (
            <Button
              key={tab.value}
              variant="chip"
              size="sm"
              role="tab"
              aria-selected={filter === tab.value}
              onClick={() => setFilter(tab.value)}
              className={filter === tab.value ? "border-accent/40 bg-accent/10 text-ink" : ""}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      )}

      {/* Grid */}
      {LIVE_MODE && liveTemplates === null ? (
        <Card variant="empty-state" className="p-0">
          <Heading level="body" className="py-12 text-center">
            Loading templates…
          </Heading>
        </Card>
      ) : visible.length > 0 ? (
        <motion.div
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          role="list"
          variants={reduceMotion ? undefined : motionVariants.staggerContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
        >
          {visible.map(template => (
            <TemplateCard key={template.id} template={template} onInstall={() => handleInstall(template)} />
          ))}
        </motion.div>
      ) : (
        <Card variant="empty-state" className="p-0">
          <Heading level="body" className="py-12 text-center">
            No templates match your search. Try a different term.
          </Heading>
        </Card>
      )}
    </motion.div>
  );
}

function TemplateCard({ template, onInstall }: { template: Template; onInstall: () => void }) {
  return (
    <motion.div role="listitem" className="h-full" variants={motionVariants.staggerItem}>
      <Card variant="content" className="flex h-full flex-col gap-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center bg-accent-soft text-sm font-semibold text-accent select-none"
            style={{ borderRadius: radius.md }}
            aria-hidden="true"
          >
            {template.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="truncate font-display text-sm font-medium text-ink">{template.name}</h3>
              <span className="shrink-0 rounded-full border border-border bg-panel px-2 py-1 text-xs text-muted">
                {template.source === "official" ? "Official" : `by ${template.author}`}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{template.description}</p>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2">
          {template.tags.map(tag => (
            <span
              key={tag}
              className="border border-border bg-panel px-2 py-1 text-xs text-muted"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted" aria-label={`Rating: ${template.rating}`}>
            <Star size={11} className="fill-warn text-warn" aria-hidden="true" />
            <span>{template.rating}</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onInstall}
            aria-label={`Install ${template.name} — ${template.installs} installs`}
          >
            <Download size={11} aria-hidden="true" />
            {template.installs}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
