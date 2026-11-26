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
      return <Users className="w-3.5 h-3.5 text-accent" />;
    }
    if (cLower.includes('mvp') || cLower.includes('scope') || cLower.includes('feature')) {
      return <Target className="w-3.5 h-3.5 text-error" />;
    }
    if (cLower.includes('stack') || cLower.includes('architecture') || cLower.includes('tech')) {
      return <Wrench className="w-3.5 h-3.5 text-agent-business-improver" />;
    }
    if (cLower.includes('integration') || cLower.includes('api')) {
      return <Zap className="w-3.5 h-3.5 text-warn" />;
    }
    if (cLower.includes('security') || cLower.includes('compliance') || cLower.includes('sla')) {
      return <Lock className="w-3.5 h-3.5 text-error" />;
    }
    if (cLower.includes('timeline') || cLower.includes('sprint') || cLower.includes('velocity')) {
      return <Clock className="w-3.5 h-3.5 text-ok" />;
    }
    return <Layers className="w-3.5 h-3.5 text-muted" />;
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
            <span className="font-semibold text-ink text-sm">
              Validation Summary
            </span>
            <span className="px-2 py-0.5 rounded-md bg-agent-integration/10 text-agent-integration font-semibold text-[10px]">
              Ready to generate
            </span>
          </div>
          <p className="text-muted font-sans text-xs">
            Review specifications before creating sprint epics and tasks.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onSaveDraft && (
            <button
              id="val-summary-save-draft-btn"
              type="button"
              onClick={onSaveDraft}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isDraftSaved
                  ? 'bg-ok text-on-ink'
                  : 'glass-button-secondary text-ink'
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
            className="px-3 py-1.5 rounded-xl glass-button-secondary font-semibold text-xs flex items-center gap-1.5 text-ink transition-all cursor-pointer"
            title="Copy requirements manifest"
          >
            {copied ? (
              <>
                <CheckCheck className="w-3.5 h-3.5 text-ok" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-muted" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onBackToSurvey}
            className="px-3 py-1.5 rounded-xl glass-button-secondary font-semibold text-xs flex items-center gap-1.5 text-ink transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Questions</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
            Requirements Completeness
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-ink font-mono">
              {answeredCount}/{totalCount}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-agent-integration/15 text-agent-integration border border-agent-integration/30 font-semibold text-[10px]">
              {percent}%
            </span>
          </div>
          <div className="text-[11px] text-muted mt-1.5">
            {remainingCount === 0
              ? 'All dimensions customized'
              : `${remainingCount} field${remainingCount === 1 ? '' : 's'} using intelligent defaults`}
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
            Domain Classification
          </div>
          <div className="font-semibold text-sm text-ink truncate uppercase">
            {domain || 'Full-Stack Software Architecture'}
          </div>
          <div className="text-[11px] text-muted mt-1.5">
            Tailored PM taxonomy and workflow
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
            Synthesis Readiness
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2.5 h-2.5 rounded-full bg-ok shadow-xs shadow-emerald-500/50" />
            <span className="font-semibold text-xs text-ok uppercase">
              Ready for PM Generation
            </span>
          </div>
          <div className="text-[11px] text-muted mt-1.5">
            Zero hallucinations on unstated needs
          </div>
        </div>
      </div>

      {/* Field 1: Project Concept Prompt */}
      <div className="glass-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-ink text-on-ink text-[10px] font-semibold uppercase tracking-wider">
              CORE INITIATIVE
            </span>
            <span className="font-semibold text-ink text-xs">
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
              className="px-3 py-1.5 rounded-xl glass-button-secondary font-semibold text-[11px] uppercase flex items-center gap-1.5 text-ink transition-all cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-muted" />
              <span>Edit</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSavePrompt}
                className="px-3 py-1.5 rounded-xl glass-button-primary font-semibold text-[10px] uppercase flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => setEditingPrompt(false)}
                className="px-3 py-1.5 rounded-xl glass-button-secondary font-semibold text-[10px] uppercase text-muted cursor-pointer"
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
                className="flex-1 rounded-xl bg-panel/80 border border-border p-2.5 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-agent-integration/30"
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
          <p className="font-semibold text-sm text-ink bg-ink/40 p-3 rounded-xl border border-border">
            &ldquo;{prompt}&rdquo;
          </p>
        )}
      </div>

      {/* Survey Fields List (with Edit Button on each field) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pt-1">
          <span className="font-semibold text-xs uppercase tracking-wider text-ink">
            Gathered Requirements By Dimension ({questions.length})
          </span>
          <span className="text-[11px] text-muted font-mono">
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
                isBranch ? 'border-l-4 border-l-info/30 bg-info/[0.08]' : ''
              } ${isEditing ? 'ring-2 ring-agent-integration/50 bg-agent-integration/[0.08]' : ''}`}
            >
              {/* Field Header */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-ink text-on-ink text-[10px] font-semibold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-panel-alt border border-border text-[10px] font-semibold uppercase text-ink">
                    {getCategoryIcon(q.category)}
                    <span>{q.category}</span>
                  </div>
                  {isBranch && (
                    <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-info/15 text-info border border-info/30 text-[10px] font-semibold uppercase">
                      <GitBranch className="w-3 h-3 text-info" />
                      <span>{q.branch_badge || 'TAILORED FOLLOW-UP'}</span>
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-ink text-sm leading-tight">
                      {q.business_title || q.question}
                    </span>
                    {q.business_title && (
                      <span className="text-[11px] font-semibold text-muted font-sans mt-0.5">
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
                      className="px-3 py-1.5 rounded-xl glass-button-secondary font-semibold text-[11px] uppercase flex items-center gap-1 text-ink transition-all cursor-pointer"
                      title={`Edit ${q.category} requirements`}
                    >
                      <Edit3 className="w-3 h-3 text-muted" />
                      <span>Edit</span>
                    </button>
                    {onJumpToQuestion && (
                      <button
                        type="button"
                        onClick={() => onJumpToQuestion(idx)}
                        className="px-2 py-1 text-[10px] font-semibold text-muted hover:text-ink underline hidden sm:inline cursor-pointer"
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
                      className="px-3 py-1.5 rounded-xl glass-button-primary font-semibold text-[10px] uppercase flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Save Field</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-3 py-1.5 rounded-xl glass-button-secondary font-semibold text-[10px] uppercase text-muted cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Field Value Display OR Field Inline Editor */}
              {isBranch && q.branch_reason && (
                <div className="text-[10px] font-semibold text-muted bg-panel/50 px-2.5 py-1 rounded-lg border border-border inline-flex items-center gap-1.5 mb-2 font-mono">
                  <span>↳</span>
                  <span>{q.branch_reason}</span>
                </div>
              )}
              {!isEditing ? (
                <div className="mt-2">
                  {isAnswered ? (
                    <div className="p-3.5 rounded-xl bg-ink/40 border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-ok text-[10px] font-semibold uppercase">
                          <CheckCircle2 className="w-3.5 h-3.5 text-ok" />
                          <span>Confirmed Requirement</span>
                        </div>
                        {(q.business_impact || BUSINESS_CATEGORY_MAP[q.category]?.businessImpact) && (
                          <span className="text-[10px] text-muted font-sans italic hidden sm:inline">
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
                              className="p-2.5 rounded-xl bg-panel/70 border border-border text-xs flex flex-col gap-1"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-ink">{optInfo.label}</span>
                                  {optInfo.badge && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-agent-integration/15 text-agent-integration border border-agent-integration/30 text-[9px] font-semibold uppercase">
                                      {optInfo.badge}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-muted">
                                  Spec: {chip}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted font-sans leading-relaxed">
                                {optInfo.plainExplanation}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-warn/10 border border-warn/30 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-warn shrink-0" />
                        <span className="text-warn text-[11px] font-semibold">
                          Not specified yet — Autonomous agents will formulate safe industry defaults.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(q.id, toSafeString(q.default_answer))}
                        className="text-[10px] font-semibold uppercase text-warn underline hover:text-warn shrink-0 cursor-pointer"
                      >
                        + Add Custom Choice
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* INLINE EDIT MODE FOR THIS FIELD */
                <div className="mt-3 p-4 rounded-xl bg-agent-integration/[0.08] border border-agent-integration/30 space-y-3">
                  <div className="text-[11px] font-semibold uppercase text-ink flex items-center justify-between">
                    <span>Editing &ldquo;{q.category}&rdquo; Specification:</span>
                    {q.default_answer && (
                      <button
                        type="button"
                        onClick={() => setTempValue(toSafeString(q.default_answer))}
                        className="text-[10px] font-semibold text-agent-integration hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        Reset to Recommended
                      </button>
                    )}
                  </div>

                  {/* Preset Options to toggle */}
                  {Array.isArray(q.options) && q.options.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">
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
                                  ? 'bg-agent-integration/15 text-agent-integration border-agent-integration/60 shadow-xs'
                                  : 'bg-panel/60 text-ink border-border hover:bg-panel/90'
                              }`}
                              title={`${optInfo.plainExplanation} (Tech spec: ${opt})`}
                            >
                              <span>{isSelected ? '✓' : '+'}</span>
                              <span>{optInfo.label}</span>
                              {optInfo.badge && (
                                <span className="text-[8px] px-1.5 py-0.2 rounded-full font-semibold uppercase bg-agent-integration/20 text-agent-integration">
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
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-muted mb-1">
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
                      className="w-full text-xs font-medium p-2.5 rounded-xl border border-border bg-panel/80 text-ink focus:outline-none focus:ring-2 focus:ring-agent-integration/30 resize-none"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-3.5 py-1.5 rounded-xl glass-button-secondary text-[10px] font-semibold uppercase text-muted cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(q.id)}
                      className="px-4 py-1.5 rounded-xl glass-button-primary text-[10px] font-semibold uppercase cursor-pointer"
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
            <span className="px-2.5 py-0.5 rounded-lg bg-panel-alt border border-border text-[10px] font-semibold uppercase text-ink">
              ADDITIONAL CONSTRAINTS
            </span>
            <span className="font-semibold text-ink text-xs">
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
              className="px-3 py-1.5 rounded-xl glass-button-secondary font-semibold text-[11px] uppercase flex items-center gap-1.5 text-ink cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-muted" />
              <span>Edit</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSaveNotes}
                className="px-3 py-1.5 rounded-xl glass-button-primary font-semibold text-[10px] uppercase flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => setEditingNotes(false)}
                className="px-3 py-1.5 rounded-xl glass-button-secondary font-semibold text-[10px] uppercase text-muted cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {editingNotes ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-muted mb-1">
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
              className="w-full rounded-xl bg-panel/80 border border-border p-2.5 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-agent-integration/30 resize-none"
              autoFocus
            />
          </div>
        ) : (
          <p className="font-semibold text-xs text-ink bg-ink/40 p-3 rounded-xl border border-border">
            {additionalNotes.trim() ? (
              additionalNotes
            ) : (
              <span className="text-faint italic">
                None specified. Standard agile and best-practice engineering standards will apply.
              </span>
            )}
          </p>
        )}
      </div>

      {/* Neural Architectural Chat Dialogue History (if available) */}
      {chatMessages && chatMessages.length > 0 && (
        <div className="glass-card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-agent-integration/15 border border-agent-integration/30 flex items-center justify-center shrink-0">
                <Brain className="w-3.5 h-3.5 text-agent-integration" />
              </div>
              <div>
                <span className="font-semibold text-xs uppercase tracking-wider text-ink">
                  Neural Architectural Chat Dialogue
                </span>
                <span className="ml-2 px-2 py-0.5 rounded-full bg-ink text-on-ink text-[9px] font-mono font-semibold">
                  {chatMessages.length} {chatMessages.length === 1 ? 'Message' : 'Messages'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowChatHistory(!showChatHistory)}
              className="px-3 py-1.5 rounded-xl text-[10px] font-semibold uppercase glass-button-secondary text-ink flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3 h-3 text-agent-integration" />
              <span>{showChatHistory ? 'Hide Dialogue' : 'Review Dialogue'}</span>
              {showChatHistory ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>

          {showChatHistory && (
            <div className="max-h-80 overflow-y-auto space-y-2.5 p-3 rounded-xl bg-ink/30 border border-border font-mono text-xs">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl border ${
                    msg.role === 'user'
                      ? 'bg-agent-integration/10 border-agent-integration/25'
                      : 'bg-panel/50 border-border'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-muted mb-1 border-b border-border pb-1">
                    <span className={msg.role === 'user' ? 'text-agent-integration' : 'text-agent-business-improver'}>
                      {msg.role === 'user' ? '👤 User Requirement' : '⚡ Autonomous Architect'}
                    </span>
                    <span className="font-mono text-[9px] text-faint">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-ink leading-relaxed text-[11px] font-sans">
                    {msg.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation & Synthesis Action Banner */}
      <div className="p-5 rounded-2xl glass-card border border-agent-integration/30 bg-gradient-to-br from-agent-integration/10 via-ok/5 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-ok" />
            <span className="font-semibold text-xs uppercase tracking-wider text-ink">
              Ready for PM Board Synthesis
            </span>
          </div>
          <p className="text-[11px] text-muted font-sans">
            Every specification above is locked in. The autonomous agent fleet will strictly follow these requirements.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackToSurvey}
            disabled={isGenerating}
            className="px-4 py-2.5 rounded-xl glass-button-secondary text-xs font-semibold uppercase text-ink cursor-pointer"
          >
            Review Questions
          </button>

          <button
            id="requirements-survey-generate-btn"
            type="button"
            onClick={onConfirmGenerate}
            disabled={isGenerating}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-agent-integration/25 to-ok/25 hover:from-agent-integration/25 hover:to-ok/25 text-ink font-semibold text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-teal-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin text-ink" />
                <span>Generating PM Board...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-warn" />
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
