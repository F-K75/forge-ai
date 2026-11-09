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
      className={`rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs overflow-hidden font-sans transition-all ${className}`}
    >
      {/* Top Header & Telemetry Bar */}
      <div className="bg-neutral-50/90 dark:bg-neutral-900/90 border-b border-neutral-200 dark:border-neutral-800">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Component Identity & Live Metrics */}
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
            aria-expanded={isOpen}
          >
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400 group-hover:scale-105 transition-transform shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                  Live Blueprint Summary
                </span>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 text-[10px] font-mono font-medium border border-teal-500/20">
                  {answeredCount}/{totalCount} Specified ({percent}%)
                </span>
                {branchCount > 0 && (
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-[10px] font-mono font-medium border border-cyan-500/20">
                    {branchCount} Branches
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
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
              className="h-8 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Copy architectural blueprint as Markdown"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="hidden sm:inline">Copy Spec</span>
                </>
              )}
            </button>

            {/* Export .md Button */}
            <button
              type="button"
              onClick={handleDownload}
              className="h-8 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Download blueprint as Markdown file"
            >
              <Download className="w-3.5 h-3.5 text-neutral-500" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {/* Expand / Collapse Button */}
            <button
              type="button"
              onClick={onToggle}
              className="h-8 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
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
        <div className="w-full h-1 bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
          <div
            className="h-full bg-teal-500 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Expanded Blueprint Body */}
      {isOpen && (
        <div className="p-4 sm:p-5 space-y-4 bg-neutral-50/40 dark:bg-neutral-950/20">
          {/* Subheader: Filter Chips, Search & View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/80 text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                All ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('specified')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  filterMode === 'specified'
                    ? 'bg-white dark:bg-neutral-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Specified ({answeredCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('pending')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  filterMode === 'pending'
                    ? 'bg-white dark:bg-neutral-700 text-amber-700 dark:text-amber-400 shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Pending Defaults ({pendingCount})
              </button>
            </div>

            {/* Search Input & View Switch */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter dimensions..."
                  className="h-7 pl-8 pr-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {/* View Switch: Cards vs Raw */}
              <div className="flex items-center p-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`h-6 px-2 rounded font-medium text-[11px] flex items-center gap-1 cursor-pointer transition-colors ${
                    viewMode === 'cards'
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                  }`}
                  title="Grid cards layout"
                >
                  <Layers className="w-3 h-3" />
                  <span className="hidden sm:inline">Matrix</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  className={`h-6 px-2 rounded font-medium text-[11px] flex items-center gap-1 cursor-pointer transition-colors ${
                    viewMode === 'raw'
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
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
                <div className="p-8 text-center rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-white/50 dark:bg-neutral-800/40">
                  <ListFilter className="w-6 h-6 text-neutral-400 mx-auto mb-2" />
                  <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    No architecture dimensions match the current filter or search criteria.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('all');
                      setSearchQuery('');
                    }}
                    className="mt-2 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
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
                            ? 'bg-white dark:bg-neutral-800 border-teal-500/30 shadow-2xs'
                            : 'bg-white/70 dark:bg-neutral-850 border-neutral-200 dark:border-neutral-700'
                        }`}
                      >
                        <div>
                          {/* Card Header: Category & Branch Pill */}
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300 font-medium">
                              <CategoryIcon className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                              <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
                                {q.category}
                              </span>
                              {q.is_conditional_branch && (
                                <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-[9px] font-mono border border-cyan-500/20">
                                  ↳ Branch
                                </span>
                              )}
                            </div>

                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                                isSpecified
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                                  : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'
                              }`}
                            >
                              {isSpecified ? 'Specified' : 'Default Inference'}
                            </span>
                          </div>

                          {/* Requirement Question Title */}
                          <p className="text-xs text-neutral-600 dark:text-neutral-400 font-sans line-clamp-2 mb-2">
                            {q.business_title || q.question}
                          </p>

                          {/* Active Value Display */}
                          <div className="p-2 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-700/80 mb-2">
                            {isSpecified ? (
                              <div className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                                <span className="font-semibold text-neutral-900 dark:text-white font-mono break-words leading-relaxed text-xs">
                                  {ans}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
                                <span className="italic">
                                  {defaultVal ? `Default: ${defaultVal}` : 'Will apply autonomous safe default'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card Bottom Actions: Quick Jump & Reset */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-750">
                          {onJumpToQuestion && (
                            <button
                              type="button"
                              onClick={() => onJumpToQuestion(originalIndex)}
                              className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>Tune in Survey</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}

                          {isSpecified && onClearAnswer && (
                            <button
                              type="button"
                              onClick={() => onClearAnswer(q.id)}
                              className="text-[11px] font-medium text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
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
                <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Custom Architectural Directives & Constraints
                    </span>
                  </div>
                  <p className="text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap font-mono bg-neutral-50 dark:bg-neutral-900 p-2.5 rounded-lg border border-neutral-200/80 dark:border-neutral-700/80">
                    {additionalNotes}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* View Mode 2: Raw Markdown Specification */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <span className="font-mono">Generated Architecture Spec Manifest</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy All Markdown'}</span>
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-[11px] font-mono leading-relaxed overflow-x-auto max-h-96 border border-neutral-800 selection:bg-teal-700">
                {blueprintMarkdown}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
