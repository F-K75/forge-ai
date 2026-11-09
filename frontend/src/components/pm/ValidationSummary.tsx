import React, { useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Check,
  RotateCcw,
  Copy,
  CheckCheck,
  Layers,
  Users,
  Target,
  Wrench,
  Lock,
  Clock,
  Zap,
  GitBranch,
  Save,
  Brain,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ClarificationQuestion, NeuralSurveyChatMessage } from '../../lib/geminiPM';
import { VoiceInputButton } from './VoiceInputButton';
import { getBusinessOptionInfo, BUSINESS_CATEGORY_MAP } from '../../lib/businessSurveyHelper';

export interface ValidationSummaryProps {
  prompt: string;
  domain?: string;
  questions: ClarificationQuestion[];
  answers: Record<string, string>;
  additionalNotes?: string;
  chatMessages?: NeuralSurveyChatMessage[];
  onUpdatePrompt?: (newPrompt: string) => void;
  onUpdateAnswer: (questionId: string, newAnswer: string) => void;
  onUpdateNotes?: (newNotes: string) => void;
  onJumpToQuestion?: (questionIndex: number) => void;
  onConfirmGenerate: () => void;
  onBackToSurvey: () => void;
  isGenerating?: boolean;
  onSaveDraft?: () => void;
  isDraftSaved?: boolean;
  lastSavedTime?: number | null;
}

const toSafeString = (val: unknown): string => {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map((v) => toSafeString(v)).filter(Boolean).join(', ');
  if (val !== null && val !== undefined) return String(val);
  return '';
};

export const ValidationSummary: React.FC<ValidationSummaryProps> = ({
  prompt,
  domain,
  questions,
  answers,
  additionalNotes = '',
  chatMessages = [],
  onUpdatePrompt,
  onUpdateAnswer,
  onUpdateNotes,
  onJumpToQuestion,
  onConfirmGenerate,
  onBackToSurvey,
  isGenerating = false,
  onSaveDraft,
  isDraftSaved = false,
  lastSavedTime,
}) => {
  // Editing state for fields
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>('');
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [tempPrompt, setTempPrompt] = useState(prompt);
  const [editingNotes, setEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState(additionalNotes);
  const [copied, setCopied] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);

  // Field stats
  const totalCount = questions.length;
  const answeredCount = questions.filter((q) => Boolean(toSafeString(answers[q.id]).trim())).length;
  const remainingCount = Math.max(0, totalCount - answeredCount);
  const percent = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

  const getCategoryIcon = (category: string) => {
    const cLower = category.toLowerCase();
    if (cLower.includes('user') || cLower.includes('audience') || cLower.includes('role')) {
      return <Users className="w-3.5 h-3.5 text-blue-600" />;
    }
    if (cLower.includes('mvp') || cLower.includes('scope') || cLower.includes('feature')) {
      return <Target className="w-3.5 h-3.5 text-rose-600" />;
    }
    if (cLower.includes('stack') || cLower.includes('architecture') || cLower.includes('tech')) {
      return <Wrench className="w-3.5 h-3.5 text-indigo-600" />;
    }
    if (cLower.includes('integration') || cLower.includes('api')) {
      return <Zap className="w-3.5 h-3.5 text-amber-600" />;
    }
    if (cLower.includes('security') || cLower.includes('compliance') || cLower.includes('sla')) {
      return <Lock className="w-3.5 h-3.5 text-red-600" />;
    }
    if (cLower.includes('timeline') || cLower.includes('sprint') || cLower.includes('velocity')) {
      return <Clock className="w-3.5 h-3.5 text-emerald-600" />;
    }
    return <Layers className="w-3.5 h-3.5 text-neutral-600" />;
  };

  const handleStartEdit = (qId: string, currentVal: string) => {
    setEditingFieldId(qId);
    setTempValue(currentVal);
  };

  const handleSaveEdit = (qId: string) => {
    onUpdateAnswer(qId, tempValue.trim());
    setEditingFieldId(null);
  };

  const handleCancelEdit = () => {
    setEditingFieldId(null);
    setTempValue('');
  };

  const handleToggleOptionInEdit = (option: string) => {
    const currentList = tempValue
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    let updatedList: string[];
    if (currentList.includes(option)) {
      updatedList = currentList.filter((item) => item !== option);
    } else {
      updatedList = [...currentList, option];
    }
    setTempValue(updatedList.join(', '));
  };

  const handleSavePrompt = () => {
    if (onUpdatePrompt && tempPrompt.trim()) {
      onUpdatePrompt(tempPrompt.trim());
    }
    setEditingPrompt(false);
  };

  const handleSaveNotes = () => {
    if (onUpdateNotes) {
      onUpdateNotes(tempNotes.trim());
    }
    setEditingNotes(false);
  };

  const handleCopySpec = () => {
    const specLines: string[] = [
      `# PROJECT REQUIREMENTS BLUEPRINT: ${prompt}`,
      domain ? `Domain: ${domain}` : '',
      `Completion: ${answeredCount}/${totalCount} questions (${percent}%)`,
      '',
      '## SPECIFICATIONS:',
    ];

    questions.forEach((q, idx) => {
      const ans = toSafeString(answers[q.id]) || '[Default Safe Inference]';
      specLines.push(`${idx + 1}. [${q.category}] ${q.question}`);
      specLines.push(`   Answer: ${ans}`);
    });

    if (additionalNotes) {
      specLines.push('');
      specLines.push('## ARCHITECTURAL CONSTRAINTS:');
      specLines.push(additionalNotes);
    }

    navigator.clipboard.writeText(specLines.filter(Boolean).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="validation-summary-container" className="space-y-4 w-full max-w-6xl 2xl:max-w-7xl mx-auto font-sans text-xs">
      {/* Verification Notice Banner */}
      <div className="glass-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-bold text-neutral-900 dark:text-white text-sm">
              Validation Summary
            </span>
            <span className="px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-800 dark:text-teal-300 font-bold text-[10px]">
              Ready to generate
            </span>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 font-sans text-xs">
            Review specifications before creating sprint epics and tasks.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onSaveDraft && (
            <button
              id="val-summary-save-draft-btn"
              type="button"
              onClick={onSaveDraft}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isDraftSaved
                  ? 'bg-emerald-600 text-white'
                  : 'glass-button-secondary text-neutral-800 dark:text-neutral-200'
              }`}
              title="Save current requirements specification as draft"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isDraftSaved ? 'Saved' : 'Save Draft'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopySpec}
            className="px-3 py-1.5 rounded-xl glass-button-secondary font-bold text-xs flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer"
            title="Copy requirements manifest"
          >
            {copied ? (
              <>
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-neutral-500" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onBackToSurvey}
            className="px-3 py-1.5 rounded-xl glass-button-secondary font-bold text-xs flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Questions</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
            Requirements Completeness
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-neutral-900 dark:text-white font-mono">
              {answeredCount}/{totalCount}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-800 dark:text-teal-300 border border-teal-500/30 font-bold text-[10px]">
              {percent}%
            </span>
          </div>
          <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1.5">
            {remainingCount === 0
              ? 'All dimensions customized'
              : `${remainingCount} field${remainingCount === 1 ? '' : 's'} using intelligent defaults`}
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
            Domain Classification
          </div>
          <div className="font-bold text-sm text-neutral-900 dark:text-white truncate uppercase">
            {domain || 'Full-Stack Software Architecture'}
          </div>
          <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1.5">
            Tailored PM taxonomy and workflow
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
            Synthesis Readiness
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
            <span className="font-bold text-xs text-emerald-700 dark:text-emerald-400 uppercase">
              Ready for PM Generation
            </span>
          </div>
          <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1.5">
            Zero hallucinations on unstated needs
          </div>
        </div>
      </div>

      {/* Field 1: Project Concept Prompt */}
      <div className="glass-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[10px] font-bold uppercase tracking-wider">
              CORE INITIATIVE
            </span>
            <span className="font-bold text-neutral-800 dark:text-neutral-200 text-xs">
              Project Concept & Problem Statement
            </span>
          </div>
          {!editingPrompt ? (
            <button
              type="button"
              onClick={() => {
                setTempPrompt(prompt);
                setEditingPrompt(true);
              }}
              className="px-3 py-1.5 rounded-xl glass-button-secondary font-bold text-[11px] uppercase flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-neutral-500" />
              <span>Edit</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSavePrompt}
                className="px-3 py-1.5 rounded-xl glass-button-primary font-bold text-[10px] uppercase flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => setEditingPrompt(false)}
                className="px-3 py-1.5 rounded-xl glass-button-secondary font-bold text-[10px] uppercase text-neutral-600 dark:text-neutral-400 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {editingPrompt ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tempPrompt}
                onChange={(e) => setTempPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSavePrompt()}
                className="flex-1 rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 p-2.5 text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                autoFocus
              />
              <VoiceInputButton
                id="voice-val-prompt"
                label="Dictate"
                currentValue={tempPrompt}
                onTextCaptured={(spokenText) => setTempPrompt(spokenText)}
                variant="inline-sm"
              />
            </div>
          </div>
        ) : (
          <p className="font-semibold text-sm text-neutral-900 dark:text-white bg-white/40 dark:bg-neutral-800/40 p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80">
            &ldquo;{prompt}&rdquo;
          </p>
        )}
      </div>

      {/* Survey Fields List (with Edit Button on each field) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pt-1">
          <span className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
            Gathered Requirements By Dimension ({questions.length})
          </span>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
            Click &ldquo;Edit&rdquo; on any field to refine before generation
          </span>
        </div>

        {questions.map((q, idx) => {
          const currentAnswer = toSafeString(answers[q.id]);
          const isAnswered = Boolean(currentAnswer.trim());
          const isEditing = editingFieldId === q.id;
          const selectedChips = currentAnswer
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean);

          const isBranch = Boolean(q.is_conditional_branch);

          return (
            <div
              key={q.id}
              id={`validation-field-${q.id}`}
              className={`glass-card p-4 sm:p-5 transition-all ${
                isBranch ? 'border-l-4 border-l-cyan-500 bg-cyan-500/5 dark:bg-cyan-950/20' : ''
              } ${isEditing ? 'ring-2 ring-teal-500/50 bg-teal-500/5' : ''}`}
            >
              {/* Field Header */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-[10px] font-bold uppercase text-neutral-700 dark:text-neutral-300">
                    {getCategoryIcon(q.category)}
                    <span>{q.category}</span>
                  </div>
                  {isBranch && (
                    <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-900 dark:text-cyan-300 border border-cyan-500/30 text-[10px] font-bold uppercase">
                      <GitBranch className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                      <span>{q.branch_badge || 'TAILORED FOLLOW-UP'}</span>
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-neutral-900 dark:text-white text-sm leading-tight">
                      {q.business_title || q.question}
                    </span>
                    {q.business_title && (
                      <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 font-sans mt-0.5">
                        {q.question}
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit Button for this Field */}
                {!isEditing ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(q.id, currentAnswer)}
                      className="px-3 py-1.5 rounded-xl glass-button-secondary font-bold text-[11px] uppercase flex items-center gap-1 text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer"
                      title={`Edit ${q.category} requirements`}
                    >
                      <Edit3 className="w-3 h-3 text-neutral-500" />
                      <span>Edit</span>
                    </button>
                    {onJumpToQuestion && (
                      <button
                        type="button"
                        onClick={() => onJumpToQuestion(idx)}
                        className="px-2 py-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white underline hidden sm:inline cursor-pointer"
                        title="Jump to question in survey wizard"
                      >
                        Survey Step
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(q.id)}
                      className="px-3 py-1.5 rounded-xl glass-button-primary font-bold text-[10px] uppercase flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Save Field</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-3 py-1.5 rounded-xl glass-button-secondary font-bold text-[10px] uppercase text-neutral-600 dark:text-neutral-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Field Value Display OR Field Inline Editor */}
              {isBranch && q.branch_reason && (
                <div className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-400 bg-white/50 dark:bg-neutral-800/50 px-2.5 py-1 rounded-lg border border-neutral-200/80 dark:border-neutral-700/80 inline-flex items-center gap-1.5 mb-2 font-mono">
                  <span>↳</span>
                  <span>{q.branch_reason}</span>
                </div>
              )}
              {!isEditing ? (
                <div className="mt-2">
                  {isAnswered ? (
                    <div className="p-3.5 rounded-xl bg-white/40 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Confirmed Requirement</span>
                        </div>
                        {(q.business_impact || BUSINESS_CATEGORY_MAP[q.category]?.businessImpact) && (
                          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-sans italic hidden sm:inline">
                            Impact: {q.business_impact || BUSINESS_CATEGORY_MAP[q.category]?.businessImpact}
                          </span>
                        )}
                      </div>

                      {/* Display each selected option with plain-English business explanation */}
                      <div className="space-y-2">
                        {selectedChips.map((chip) => {
                          const optInfo = getBusinessOptionInfo(chip);
                          return (
                            <div
                              key={chip}
                              className="p-2.5 rounded-xl bg-white/70 dark:bg-neutral-800/70 border border-neutral-200/70 dark:border-neutral-700/70 text-xs flex flex-col gap-1"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-neutral-900 dark:text-white">{optInfo.label}</span>
                                  {optInfo.badge && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-teal-500/15 text-teal-800 dark:text-teal-300 border border-teal-500/30 text-[9px] font-bold uppercase">
                                      {optInfo.badge}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
                                  Spec: {chip}
                                </span>
                              </div>
                              <p className="text-[11px] text-neutral-600 dark:text-neutral-400 font-sans leading-relaxed">
                                {optInfo.plainExplanation}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="text-amber-900 dark:text-amber-300 text-[11px] font-semibold">
                          Not specified yet — Autonomous agents will formulate safe industry defaults.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(q.id, toSafeString(q.default_answer))}
                        className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 underline hover:text-amber-900 dark:hover:text-amber-200 shrink-0 cursor-pointer"
                      >
                        + Add Custom Choice
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* INLINE EDIT MODE FOR THIS FIELD */
                <div className="mt-3 p-4 rounded-xl bg-teal-500/5 border border-teal-500/30 space-y-3">
                  <div className="text-[11px] font-bold uppercase text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                    <span>Editing &ldquo;{q.category}&rdquo; Specification:</span>
                    {q.default_answer && (
                      <button
                        type="button"
                        onClick={() => setTempValue(toSafeString(q.default_answer))}
                        className="text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        Reset to Recommended
                      </button>
                    )}
                  </div>

                  {/* Preset Options to toggle */}
                  {Array.isArray(q.options) && q.options.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                        Select Presets:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {q.options.map((opt) => {
                          const isSelected = tempValue
                            .split(/[,;]/)
                            .map((s) => s.trim())
                            .includes(opt);
                          const optInfo = getBusinessOptionInfo(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleToggleOptionInEdit(opt)}
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-teal-500/15 dark:bg-teal-500/20 text-teal-950 dark:text-teal-100 border-teal-500/60 shadow-xs'
                                  : 'bg-white/60 dark:bg-neutral-800/50 text-neutral-800 dark:text-neutral-200 border-neutral-200/80 dark:border-neutral-700/80 hover:bg-white/90 dark:hover:bg-neutral-800/80'
                              }`}
                              title={`${optInfo.plainExplanation} (Tech spec: ${opt})`}
                            >
                              <span>{isSelected ? '✓' : '+'}</span>
                              <span>{optInfo.label}</span>
                              {optInfo.badge && (
                                <span className="text-[8px] px-1.5 py-0.2 rounded-full font-bold uppercase bg-teal-500/20 text-teal-900 dark:text-teal-200">
                                  {optInfo.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Direct Text input */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-neutral-500 dark:text-neutral-400 mb-1">
                      <span>Custom Specification / Notes:</span>
                      <VoiceInputButton
                        id={`voice-val-q-${q.id}`}
                        label="Dictate"
                        contextHint={q.question}
                        currentValue={tempValue}
                        onTextCaptured={(spokenText) => setTempValue(spokenText)}
                        variant="inline-sm"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      placeholder={q.placeholder || 'Type or speak custom specifications...'}
                      className="w-full text-xs font-medium p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-3.5 py-1.5 rounded-xl glass-button-secondary text-[10px] font-bold uppercase text-neutral-600 dark:text-neutral-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(q.id)}
                      className="px-4 py-1.5 rounded-xl glass-button-primary text-[10px] font-bold uppercase cursor-pointer"
                    >
                      Save Specification
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Field: Architectural Constraints / Additional Notes */}
      <div className="glass-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-[10px] font-bold uppercase text-neutral-700 dark:text-neutral-300">
              ADDITIONAL CONSTRAINTS
            </span>
            <span className="font-bold text-neutral-800 dark:text-neutral-200 text-xs">
              Architectural Guardrails & Compliance Overrides
            </span>
          </div>

          {!editingNotes ? (
            <button
              type="button"
              onClick={() => {
                setTempNotes(additionalNotes);
                setEditingNotes(true);
              }}
              className="px-3 py-1.5 rounded-xl glass-button-secondary font-bold text-[11px] uppercase flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300 cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-neutral-500" />
              <span>Edit</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSaveNotes}
                className="px-3 py-1.5 rounded-xl glass-button-primary font-bold text-[10px] uppercase flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => setEditingNotes(false)}
                className="px-3 py-1.5 rounded-xl glass-button-secondary font-bold text-[10px] uppercase text-neutral-600 dark:text-neutral-400 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {editingNotes ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-neutral-500 dark:text-neutral-400 mb-1">
              <span>Directives & Constraints:</span>
              <VoiceInputButton
                id="voice-val-notes"
                label="Dictate"
                currentValue={tempNotes}
                onTextCaptured={(spokenText) => setTempNotes(spokenText)}
                variant="inline-sm"
              />
            </div>
            <textarea
              rows={2}
              value={tempNotes}
              onChange={(e) => setTempNotes(e.target.value)}
              placeholder="e.g., Must use Postgres on GCP, enforce SOC2 compliance, 2-week sprints..."
              className="w-full rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 p-2.5 text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
              autoFocus
            />
          </div>
        ) : (
          <p className="font-semibold text-xs text-neutral-800 dark:text-neutral-200 bg-white/40 dark:bg-neutral-800/40 p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80">
            {additionalNotes.trim() ? (
              additionalNotes
            ) : (
              <span className="text-neutral-400 dark:text-neutral-500 italic">
                None specified. Standard agile and best-practice engineering standards will apply.
              </span>
            )}
          </p>
        )}
      </div>

      {/* Neural Architectural Chat Dialogue History (if available) */}
      {chatMessages && chatMessages.length > 0 && (
        <div className="glass-card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-200/70 dark:border-neutral-800/70 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0">
                <Brain className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <span className="font-bold text-xs uppercase tracking-wider text-neutral-900 dark:text-white">
                  Neural Architectural Chat Dialogue
                </span>
                <span className="ml-2 px-2 py-0.5 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[9px] font-mono font-bold">
                  {chatMessages.length} {chatMessages.length === 1 ? 'Message' : 'Messages'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowChatHistory(!showChatHistory)}
              className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase glass-button-secondary text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3 h-3 text-teal-600 dark:text-teal-400" />
              <span>{showChatHistory ? 'Hide Dialogue' : 'Review Dialogue'}</span>
              {showChatHistory ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>

          {showChatHistory && (
            <div className="max-h-80 overflow-y-auto space-y-2.5 p-3 rounded-xl bg-white/30 dark:bg-neutral-900/30 border border-neutral-200/60 dark:border-neutral-800/60 font-mono text-xs">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl border ${
                    msg.role === 'user'
                      ? 'bg-teal-500/10 border-teal-500/25'
                      : 'bg-white/50 dark:bg-neutral-800/50 border-neutral-200/80 dark:border-neutral-700/80'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-neutral-500 dark:text-neutral-400 mb-1 border-b border-neutral-200/40 dark:border-neutral-700/40 pb-1">
                    <span className={msg.role === 'user' ? 'text-teal-700 dark:text-teal-300' : 'text-purple-700 dark:text-purple-400'}>
                      {msg.role === 'user' ? '👤 User Requirement' : '⚡ Autonomous Architect'}
                    </span>
                    <span className="font-mono text-[9px] text-neutral-400">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-neutral-800 dark:text-neutral-200 leading-relaxed text-[11px] font-sans">
                    {msg.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation & Synthesis Action Banner */}
      <div className="p-5 rounded-2xl glass-card border border-teal-500/30 bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-bold text-xs uppercase tracking-wider text-neutral-900 dark:text-white">
              Ready for PM Board Synthesis
            </span>
          </div>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400 font-sans">
            Every specification above is locked in. The autonomous agent fleet will strictly follow these requirements.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackToSurvey}
            disabled={isGenerating}
            className="px-4 py-2.5 rounded-xl glass-button-secondary text-xs font-bold uppercase text-neutral-700 dark:text-neutral-300 cursor-pointer"
          >
            Review Questions
          </button>

          <button
            id="requirements-survey-generate-btn"
            type="button"
            onClick={onConfirmGenerate}
            disabled={isGenerating}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-teal-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin text-white" />
                <span>Generating PM Board...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Confirm & Synthesize PM Board</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
