import React, { useState, useMemo } from 'react';
import {
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Download,
  Search,
  ArrowRight,
  Database,
  Shield,
  Cloud,
  Globe,
  Server,
  Zap,
  Cpu,
  Layers,
  Sparkles,
  RotateCcw,
  Code2,
  ListFilter,
  CheckCheck,
} from 'lucide-react';
import { ClarificationQuestion } from '../../lib/geminiPM';

export interface LiveBlueprintSummaryProps {
  questions: ClarificationQuestion[];
  answers: Record<string, string>;
  additionalNotes?: string;
  prompt: string;
  domain?: string;
  isOpen: boolean;
  onToggle: () => void;
  onJumpToQuestion?: (index: number) => void;
  onClearAnswer?: (questionId: string) => void;
  className?: string;
}

const getCategoryIcon = (category: string) => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('database') || cat.includes('data') || cat.includes('storage') || cat.includes('sql')) {
    return Database;
  }
  if (cat.includes('security') || cat.includes('auth') || cat.includes('compliance') || cat.includes('permission')) {
    return Shield;
  }
  if (cat.includes('cloud') || cat.includes('deploy') || cat.includes('infra') || cat.includes('devops') || cat.includes('host')) {
    return Cloud;
  }
  if (cat.includes('frontend') || cat.includes('ui') || cat.includes('ux') || cat.includes('client') || cat.includes('web')) {
    return Globe;
  }
  if (cat.includes('backend') || cat.includes('api') || cat.includes('server') || cat.includes('microservice')) {
    return Server;
  }
  if (cat.includes('perform') || cat.includes('scale') || cat.includes('cache') || cat.includes('latency')) {
    return Zap;
  }
  if (cat.includes('ai') || cat.includes('ml') || cat.includes('neural') || cat.includes('model') || cat.includes('llm')) {
    return Cpu;
  }
  return Layers;
};

const toSafeString = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

export const LiveBlueprintSummary: React.FC<LiveBlueprintSummaryProps> = ({
  questions,
  answers,
  additionalNotes = '',
  prompt,
  domain,
  isOpen,
  onToggle,
  onJumpToQuestion,
  onClearAnswer,
  className = '',
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'specified' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'raw'>('cards');
  const [copied, setCopied] = useState(false);

  // Analytics
  const totalCount = questions.length;
  const answeredCount = useMemo(() => {
    return questions.filter((q) => Boolean(toSafeString(answers[q.id]).trim())).length;
  }, [questions, answers]);

  const pendingCount = Math.max(0, totalCount - answeredCount);
  const percent = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;
  const branchCount = useMemo(() => {
    return questions.filter((q) => q.is_conditional_branch).length;
  }, [questions]);

  // Filtered Questions
  const filteredQuestions = useMemo(() => {
    return questions
      .map((q, originalIndex) => ({ q, originalIndex }))
      .filter(({ q }) => {
        const answerVal = toSafeString(answers[q.id]).trim();
        const isAnswered = Boolean(answerVal);

        if (filterMode === 'specified' && !isAnswered) return false;
        if (filterMode === 'pending' && isAnswered) return false;

        if (searchQuery.trim()) {
          const qText = (q.question || '').toLowerCase();
          const qCat = (q.category || '').toLowerCase();
          const qTitle = (q.business_title || '').toLowerCase();
          const ansText = answerVal.toLowerCase();
          const query = searchQuery.toLowerCase().trim();
          return (
            qText.includes(query) ||
            qCat.includes(query) ||
            qTitle.includes(query) ||
            ansText.includes(query)
          );
        }

        return true;
      });
  }, [questions, answers, filterMode, searchQuery]);

  // Blueprint Markdown Generation
  const blueprintMarkdown = useMemo(() => {
    const lines: string[] = [
      `# ARCHITECTURE REQUIREMENTS BLUEPRINT`,
      `**Initiative**: ${prompt}`,
      domain ? `**Domain**: ${domain}` : '',
      `**Progress**: ${answeredCount}/${totalCount} questions confirmed (${percent}% specified)`,
      `**Generated**: ${new Date().toISOString()}`,
      '',
      `## 1. ARCHITECTURAL SPECIFICATIONS`,
    ];

    questions.forEach((q, idx) => {
      const ans = toSafeString(answers[q.id]).trim();
      const status = ans ? 'SPECIFIED' : 'DEFAULT_INFERENCE';
      const resolved = ans || toSafeString(q.default_answer) || 'Autonomous Safe Default';
      lines.push(`${idx + 1}. [${q.category.toUpperCase()}] ${q.question}`);
      lines.push(`   Status: [${status}]`);
      lines.push(`   Specification: ${resolved}`);
      if (q.is_conditional_branch && q.branch_reason) {
        lines.push(`   Branch Context: ${q.branch_reason}`);
      }
    });

    if (additionalNotes.trim()) {
      lines.push('');
      lines.push(`## 2. ARCHITECTURAL DIRECTIVES & RULES`);
      lines.push(additionalNotes.trim());
    }

    return lines.filter(Boolean).join('\n');
  }, [prompt, domain, answeredCount, totalCount, percent, questions, answers, additionalNotes]);

  const handleCopy = () => {
    navigator.clipboard.writeText(blueprintMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([blueprintMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `architecture-blueprint-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="live-blueprint-summary-container"
      className={`rounded-2xl border border-border bg-panel shadow-xs overflow-hidden font-sans transition-all ${className}`}
    >
      {/* Top Header & Telemetry Bar */}
      <div className="bg-ink/10 border-b border-border">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Component Identity & Live Metrics */}
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
            aria-expanded={isOpen}
          >
            <div className="w-8 h-8 rounded-xl bg-agent-integration/10 border border-agent-integration/20 flex items-center justify-center text-agent-integration group-hover:scale-105 transition-transform shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink">
                  Live Blueprint Summary
                </span>
                <span className="px-2 py-0.5 rounded-full bg-agent-integration/10 text-agent-integration text-[10px] font-mono font-medium border border-agent-integration/20">
                  {answeredCount}/{totalCount} Specified ({percent}%)
                </span>
                {branchCount > 0 && (
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-info/10 text-info text-[10px] font-mono font-medium border border-info/20">
                    {branchCount} Branches
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted">
                {answeredCount === totalCount
                  ? 'All architecture dimensions tailored · Ready for sprint generation'
                  : `${pendingCount} dimension${pendingCount === 1 ? '' : 's'} using intelligent defaults`}
              </p>
            </div>
          </button>

          {/* Right: Quick Action Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Copy Spec Button */}
            <button
              type="button"
              onClick={handleCopy}
              className="h-8 px-2.5 rounded-pill border border-border bg-panel text-xs font-medium text-ink hover:bg-ink/5 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Copy architectural blueprint as Markdown"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-ok stroke-[2.5]" />
                  <span className="text-ok font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-muted" />
                  <span className="hidden sm:inline">Copy Spec</span>
                </>
              )}
            </button>

            {/* Export .md Button */}
            <button
              type="button"
              onClick={handleDownload}
              className="h-8 px-2.5 rounded-pill border border-border bg-panel text-xs font-medium text-ink hover:bg-ink/5 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Download blueprint as Markdown file"
            >
              <Download className="w-3.5 h-3.5 text-muted" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {/* Expand / Collapse Button */}
            <button
              type="button"
              onClick={onToggle}
              className="h-8 px-2.5 rounded-pill border border-border bg-panel text-muted hover:text-ink transition-colors flex items-center gap-1 cursor-pointer"
              title={isOpen ? 'Collapse Blueprint Summary' : 'Expand Blueprint Summary'}
            >
              <span className="text-xs font-medium hidden sm:inline">
                {isOpen ? 'Collapse' : 'Expand'}
              </span>
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Live Convergence Progress Line */}
        <div className="w-full h-1 bg-surface-high overflow-hidden">
          <div
            className="h-full bg-agent-integration transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Expanded Blueprint Body */}
      {isOpen && (
        <div className="p-4 sm:p-5 space-y-4 bg-ink/10">
          {/* Subheader: Filter Chips, Search & View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-panel-alt border border-border text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-panel text-ink shadow-2xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                All ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('specified')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  filterMode === 'specified'
                    ? 'bg-panel text-agent-integration shadow-2xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Specified ({answeredCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('pending')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  filterMode === 'pending'
                    ? 'bg-panel text-warn shadow-2xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Pending Defaults ({pendingCount})
              </button>
            </div>

            {/* Search Input & View Switch */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-faint absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter dimensions..."
                  className="h-7 pl-8 pr-3 rounded-lg border border-border bg-panel text-xs text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-agent-integration/40"
                />
              </div>

              {/* View Switch: Cards vs Raw */}
              <div className="flex items-center p-0.5 rounded-lg bg-panel-alt border border-border">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`h-6 px-2 rounded-pill font-medium text-[11px] flex items-center gap-1 cursor-pointer transition-colors ${
                    viewMode === 'cards'
                      ? 'bg-panel text-ink shadow-2xs'
                      : 'text-muted hover:text-ink'
                  }`}
                  title="Grid cards layout"
                >
                  <Layers className="w-3 h-3" />
                  <span className="hidden sm:inline">Matrix</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  className={`h-6 px-2 rounded-pill font-medium text-[11px] flex items-center gap-1 cursor-pointer transition-colors ${
                    viewMode === 'raw'
                      ? 'bg-panel text-ink shadow-2xs'
                      : 'text-muted hover:text-ink'
                  }`}
                  title="Raw markdown blueprint spec"
                >
                  <Code2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Spec</span>
                </button>
              </div>
            </div>
          </div>

          {/* View Mode 1: Interactive Cards Matrix */}
          {viewMode === 'cards' ? (
            <div className="space-y-4">
              {filteredQuestions.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-border bg-panel/50">
                  <ListFilter className="w-6 h-6 text-faint mx-auto mb-2" />
                  <p className="text-xs font-medium text-muted">
                    No architecture dimensions match the current filter or search criteria.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('all');
                      setSearchQuery('');
                    }}
                    className="mt-2 text-xs font-semibold text-agent-integration hover:underline cursor-pointer"
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredQuestions.map(({ q, originalIndex }) => {
                    const ans = toSafeString(answers[q.id]).trim();
                    const isSpecified = Boolean(ans);
                    const CategoryIcon = getCategoryIcon(q.category);
                    const defaultVal = toSafeString(q.default_answer);

                    return (
                      <div
                        key={q.id}
                        className={`p-3.5 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                          isSpecified
                            ? 'bg-panel border-agent-integration/30 shadow-2xs'
                            : 'bg-panel/70 dark:bg-neutral-850 border-border'
                        }`}
                      >
                        <div>
                          {/* Card Header: Category & Branch Pill */}
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 text-muted font-medium">
                              <CategoryIcon className="w-3.5 h-3.5 text-muted" />
                              <span className="text-[11px] font-semibold text-ink">
                                {q.category}
                              </span>
                              {q.is_conditional_branch && (
                                <span className="px-1.5 py-0.2 rounded bg-info/10 text-info text-[9px] font-mono border border-info/20">
                                  ↳ Branch
                                </span>
                              )}
                            </div>

                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                                isSpecified
                                  ? 'bg-ok/10 text-ok border border-ok/20'
                                  : 'bg-panel-alt text-muted'
                              }`}
                            >
                              {isSpecified ? 'Specified' : 'Default Inference'}
                            </span>
                          </div>

                          {/* Requirement Question Title */}
                          <p className="text-xs text-muted font-sans line-clamp-2 mb-2">
                            {q.business_title || q.question}
                          </p>

                          {/* Active Value Display */}
                          <div className="p-2 rounded-lg bg-panel border border-border mb-2">
                            {isSpecified ? (
                              <div className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-agent-integration shrink-0 mt-0.5" />
                                <span className="font-semibold text-ink font-mono break-words leading-relaxed text-xs">
                                  {ans}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1.5 text-muted text-[11px]">
                                <span className="italic">
                                  {defaultVal ? `Default: ${defaultVal}` : 'Will apply autonomous safe default'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card Bottom Actions: Quick Jump & Reset */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-soft dark:border-neutral-750">
                          {onJumpToQuestion && (
                            <button
                              type="button"
                              onClick={() => onJumpToQuestion(originalIndex)}
                              className="text-xs font-semibold text-agent-integration hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>Tune in Survey</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}

                          {isSpecified && onClearAnswer && (
                            <button
                              type="button"
                              onClick={() => onClearAnswer(q.id)}
                              className="text-[11px] font-medium text-faint hover:text-error flex items-center gap-1 transition-colors cursor-pointer"
                              title="Reset this specification to recommended default"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Architectural Directives Summary Card (If provided) */}
              {additionalNotes.trim() && (
                <div className="p-4 rounded-xl border border-border bg-panel space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-agent-integration" />
                    <span className="text-xs font-semibold text-ink">
                      Custom Architectural Directives & Constraints
                    </span>
                  </div>
                  <p className="text-xs text-ink whitespace-pre-wrap font-mono bg-panel p-2.5 rounded-lg border border-border">
                    {additionalNotes}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* View Mode 2: Raw Markdown Specification */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="font-mono">Generated Architecture Spec Manifest</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-xs font-semibold text-agent-integration hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy All Markdown'}</span>
                </button>
              </div>
              <pre className="p-4 rounded-pill bg-ink text-on-ink text-[11px] font-mono leading-relaxed overflow-x-auto max-h-96 border border-border selection:bg-agent-integration">
                {blueprintMarkdown}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
