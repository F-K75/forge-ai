import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Users,
  Target,
  Wrench,
  Lock,
  Clock,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  RefreshCw,
  Edit3,
  X,
  AlertCircle,
  FileText,
  Check,
  RotateCcw,
  Zap,
  Layers,
  ChevronDown,
  ChevronUp,
  Info,
  GitBranch,
  Save,
  FolderOpen,
  Trash2,
  BookmarkCheck,
  Brain,
  Briefcase,
  Code,
  Cpu,
  Lightbulb,
  BookOpen,
  Search,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  clarifyInitiativeWithGemini,
  ClarificationPackage,
  ClarificationQuestion,
  NeuralSurveyChatMessage,
} from '../../lib/geminiPM';
import { ValidationSummary } from './ValidationSummary';
import { VoiceInputButton } from './VoiceInputButton';
import { NeuralSurveyChatbot } from './NeuralSurveyChatbot';
import { LiveBlueprintSummary } from './LiveBlueprintSummary';
import {
  BUSINESS_CATEGORY_MAP,
  getBusinessOptionInfo,
  JARGON_LIST,
  JargonDefinition,
  evaluateBusinessReadiness,
} from '../../lib/businessSurveyHelper';
import {
  computeSurveyQuestions,
  requestAiFollowUpBranch,
  BRANCH_RULES,
} from '../../lib/surveyBranching';
import {
  saveSurveyDraft,
  getLatestSurveyDraft,
  getSurveyDraftForPrompt,
  getAllSurveyDrafts,
  deleteSurveyDraft,
  clearAllSurveyDrafts,
  formatDraftTimestamp,
  SurveyDraft,
  getSurveyChatHistory,
  saveSurveyChatHistory,
} from '../../lib/surveyDraftStorage';

export interface RequirementsSurveyProps {
  isOpen: boolean;
  prompt: string;
  onClose: () => void;
  onGenerate: (
    prompt: string,
    clarifications: Record<string, string>,
    additionalNotes: string
  ) => void;
  isGenerating?: boolean;
}

// Helper to safely convert any value to clean string
const toSafeString = (val: unknown): string => {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map((v) => toSafeString(v)).filter(Boolean).join(', ');
  if (val !== null && val !== undefined) return String(val);
  return '';
};

export const RequirementsSurvey: React.FC<RequirementsSurveyProps> = ({
  isOpen,
  prompt: initialPrompt,
  onClose,
  onGenerate,
  isGenerating = false,
}) => {
  const [currentPrompt, setCurrentPrompt] = useState(initialPrompt || '');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [clarificationData, setClarificationData] = useState<ClarificationPackage | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [chatMessages, setChatMessages] = useState<NeuralSurveyChatMessage[]>([]);

  // Interactive View Modes: "neural-chat" (neural network chatbot), "wizard" (step by step), "full" (all questions), or "summary" (final validation summary)
  const [viewMode, setViewMode] = useState<'neural-chat' | 'wizard' | 'full' | 'summary'>('neural-chat');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [showLiveSummary, setShowLiveSummary] = useState<boolean>(false);

  // Dynamic Conditional Branching State
  const [customAiQuestions, setCustomAiQuestions] = useState<ClarificationQuestion[]>([]);
  const [dismissedBranchIds, setDismissedBranchIds] = useState<Set<string>>(new Set());
  const [isGeneratingAiBranch, setIsGeneratingAiBranch] = useState<boolean>(false);
  const [showBranchDiagram, setShowBranchDiagram] = useState<boolean>(false);
  const [branchToastMessage, setBranchToastMessage] = useState<string | null>(null);

  // Local Storage Draft Persistence State
  const [lastSavedTime, setLastSavedTime] = useState<number | null>(null);
  const [saveSuccessFeedback, setSaveSuccessFeedback] = useState<boolean>(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [detectedDraft, setDetectedDraft] = useState<SurveyDraft | null>(null);
  const [showDraftsModal, setShowDraftsModal] = useState<boolean>(false);
  const [allDrafts, setAllDrafts] = useState<SurveyDraft[]>([]);

  // Business View vs Technical View Perspective (Defaults to 'business' for accessibility)
  const [surveyPerspective, setSurveyPerspective] = useState<'business' | 'technical'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('forge_pm_survey_perspective');
      if (saved === 'business' || saved === 'technical') return saved;
    }
    return 'business'; // Non-technical business view is active by default
  });
  const [showJargonModal, setShowJargonModal] = useState<boolean>(false);
  const [jargonSearchTerm, setJargonSearchTerm] = useState<string>('');
  const [expandedTechSpecs, setExpandedTechSpecs] = useState<Record<string, boolean>>({});

  // Full Screen stretched state: defaults to true for immersive full-screen architecture surveying
  const [isFullScreen, setIsFullScreen] = useState<boolean>(true);
  const [perspectiveToast, setPerspectiveToast] = useState<string | null>(null);

  const handlePerspectiveChange = (mode: 'business' | 'technical') => {
    setSurveyPerspective(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('forge_pm_survey_perspective', mode);
    }
    setPerspectiveToast(
      mode === 'business'
        ? '💼 Switched to Business Perspective: Questions, suggestions, and chat now prioritize customer value, user personas, launch timelines, and ROI in plain English.'
        : '⚙️ Switched to Technical Perspective: Questions, suggestions, and chat now prioritize architecture specs, database schemas, APIs, and engineering directives.'
    );
    setTimeout(() => {
      setPerspectiveToast((prev) => (prev ? null : prev));
    }, 4500);
  };

  // Sync initial prompt, check drafts & load questions
  useEffect(() => {
    if (isOpen && initialPrompt) {
      setCurrentPrompt(initialPrompt);
      setCurrentStepIndex(0);
      setCustomAiQuestions([]);
      setDismissedBranchIds(new Set());
      setSaveSuccessFeedback(false);

      // Check for available drafts in localStorage
      const drafts = getAllSurveyDrafts();
      setAllDrafts(drafts);

      // Look for a matching draft by prompt or latest saved draft
      const matchingDraft = getSurveyDraftForPrompt(initialPrompt) || getLatestSurveyDraft();
      if (matchingDraft && Object.keys(matchingDraft.answers || {}).length > 0) {
        setDetectedDraft(matchingDraft);
      } else {
        setDetectedDraft(null);
      }

      // Restore saved chat history for this prompt if present
      const savedChat = getSurveyChatHistory(initialPrompt);
      if (savedChat && savedChat.length > 0) {
        setChatMessages(savedChat);
      } else {
        setChatMessages([]);
      }

      loadQuestions(initialPrompt);
    }
  }, [isOpen, initialPrompt]);

  // Clear notification toast after 5s
  useEffect(() => {
    if (branchToastMessage) {
      const t = setTimeout(() => setBranchToastMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [branchToastMessage]);

  const loadQuestions = async (targetPrompt: string, preserveAnswers?: Record<string, string>) => {
    setLoadingQuestions(true);
    try {
      const data = await clarifyInitiativeWithGemini(targetPrompt);
      setClarificationData(data);

      if (preserveAnswers && Object.keys(preserveAnswers).length > 0) {
        setAnswers(preserveAnswers);
      } else {
        // Pre-populate with recommended defaults so user can immediately customize
        const initialAnswers: Record<string, string> = {};
        (data.questions || []).forEach((q) => {
          const defAnswer =
            toSafeString(q.default_answer) ||
            (Array.isArray(q.options) && q.options.length > 0 ? toSafeString(q.options[0]) : '');
          initialAnswers[q.id] = defAnswer;
        });
        setAnswers(initialAnswers);
      }
    } catch (err) {
      console.error('Failed to load survey questions:', err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  /**
   * Explicitly persists current survey state to localStorage
   */
  const handleSaveDraft = () => {
    const promptToSave = (currentPrompt || initialPrompt || 'Untitled Project Plan').trim();
    if (!promptToSave) return;

    const saved = saveSurveyDraft(
      {
        prompt: promptToSave,
        answers,
        additionalNotes,
        clarificationData,
        customAiQuestions,
        dismissedBranchIds: Array.from(dismissedBranchIds),
        viewMode,
        currentStepIndex,
        domain: clarificationData?.inferred_domain,
        chatMessages,
      },
      activeDraftId || undefined
    );

    if (saved) {
      setActiveDraftId(saved.id);
      setLastSavedTime(saved.updatedAt);
      setSaveSuccessFeedback(true);
      setAllDrafts(getAllSurveyDrafts());
      setBranchToastMessage(
        `Survey draft saved to browser local storage (${saved.answeredCount} answers recorded). Return anytime!`
      );
      setTimeout(() => {
        setSaveSuccessFeedback(false);
      }, 2500);
    }
  };

  /**
   * Restores a saved draft from localStorage into active survey state
   */
  const handleRestoreDraft = (draftToRestore: SurveyDraft) => {
    setCurrentPrompt(draftToRestore.prompt);
    setAnswers(draftToRestore.answers || {});
    setAdditionalNotes(draftToRestore.additionalNotes || '');
    if (draftToRestore.clarificationData) {
      setClarificationData(draftToRestore.clarificationData);
    } else {
      loadQuestions(draftToRestore.prompt, draftToRestore.answers);
    }
    setCustomAiQuestions(draftToRestore.customAiQuestions || []);
    setDismissedBranchIds(new Set(draftToRestore.dismissedBranchIds || []));
    setViewMode(draftToRestore.viewMode || 'wizard');
    setCurrentStepIndex(draftToRestore.currentStepIndex || 0);
    setActiveDraftId(draftToRestore.id);
    setLastSavedTime(draftToRestore.updatedAt);
    setDetectedDraft(null);
    setShowDraftsModal(false);

    // Restore chat history from draft or localStorage
    if (draftToRestore.chatMessages && draftToRestore.chatMessages.length > 0) {
      setChatMessages(draftToRestore.chatMessages);
    } else {
      const fallbackChat = getSurveyChatHistory(draftToRestore.prompt);
      setChatMessages(fallbackChat);
    }

    setBranchToastMessage(
      `Restored draft for "${draftToRestore.prompt.slice(0, 32)}..." (${draftToRestore.answeredCount} answers loaded)`
    );
  };

  /**
   * Deletes a specific draft
   */
  const handleDeleteDraft = (draftId: string) => {
    deleteSurveyDraft(draftId);
    const updated = getAllSurveyDrafts();
    setAllDrafts(updated);
    if (detectedDraft?.id === draftId) {
      setDetectedDraft(null);
    }
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
    }
  };

  /**
   * Clears all saved drafts from local storage
   */
  const handleClearAllDrafts = () => {
    clearAllSurveyDrafts();
    setAllDrafts([]);
    setDetectedDraft(null);
    setActiveDraftId(null);
    setBranchToastMessage('All saved survey drafts cleared from browser local storage.');
  };

  const handlePromptUpdate = () => {
    setIsEditingPrompt(false);
    if (currentPrompt.trim()) {
      setCurrentStepIndex(0);
      loadQuestions(currentPrompt.trim());
    }
  };

  // Compute active survey questions dynamically based on current answers and branch rules
  const computedResult = useMemo(() => {
    const baseQuestions: ClarificationQuestion[] = clarificationData?.questions || [];
    return computeSurveyQuestions(
      baseQuestions,
      answers,
      customAiQuestions,
      dismissedBranchIds
    );
  }, [clarificationData?.questions, answers, customAiQuestions, dismissedBranchIds]);

  const questions: ClarificationQuestion[] = computedResult.allQuestions;
  const totalCount = questions.length;
  const activeBranchCount = questions.filter((q) => q.is_conditional_branch).length;
  const answeredCount = questions.filter((q) => Boolean(toSafeString(answers[q.id]).trim())).length;
  const progressPercent = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;
  const remainingCount = Math.max(0, totalCount - answeredCount);
  const currentStepNumber = Math.min(currentStepIndex + 1, totalCount || 1);
  const questionsAhead = Math.max(0, totalCount - currentStepNumber);

  // Safe current question retrieval
  const safeCurrentIndex = Math.min(currentStepIndex, Math.max(0, totalCount - 1));
  const currentQuestion = questions[safeCurrentIndex] || null;

  const handleToggleOption = (questionId: string, option: string, isMultiple = true) => {
    const currentAnswer = toSafeString(answers[questionId]);
    let updatedAnswer = '';

    if (!isMultiple) {
      updatedAnswer = option;
    } else {
      const currentList = currentAnswer
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const exists = currentList.includes(option);
      let updatedList: string[];
      if (exists) {
        updatedList = currentList.filter((item) => item !== option);
      } else {
        updatedList = [...currentList, option];
      }
      updatedAnswer = updatedList.join(', ');
    }

    setAnswers((prev) => ({
      ...prev,
      [questionId]: updatedAnswer,
    }));

    // Check if this action triggers a new branch rule
    checkForNewlyTriggeredBranch(questionId, updatedAnswer);
  };

  const handleTextChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    checkForNewlyTriggeredBranch(questionId, value);
  };

  const checkForNewlyTriggeredBranch = (parentId: string, newText: string) => {
    const lower = newText.toLowerCase();
    const matchingRule = BRANCH_RULES.find(
      (rule) =>
        rule.parentQuestionId === parentId &&
        !dismissedBranchIds.has(rule.id) &&
        rule.matchKeywords.some((kw) => lower.includes(kw.toLowerCase()))
    );

    if (matchingRule) {
      // Check if branch question doesn't already have an answer
      setAnswers((prev) => {
        if (!prev[matchingRule.id]) {
          return { ...prev, [matchingRule.id]: matchingRule.default_answer };
        }
        return prev;
      });

      setBranchToastMessage(
        `⚡ Branch Unlocked: "${matchingRule.branchBadge}" tailored to your choice of ${matchingRule.matchKeywords.find((kw) => lower.includes(kw)) || 'technology'}`
      );
    }
  };

  const handleDismissBranch = (branchId: string) => {
    setDismissedBranchIds((prev) => {
      const next = new Set(prev);
      next.add(branchId);
      return next;
    });

    if (currentStepIndex >= questions.length - 1) {
      setCurrentStepIndex(Math.max(0, currentStepIndex - 1));
    }
  };

  const handleRestoreBranch = (branchId: string) => {
    setDismissedBranchIds((prev) => {
      const next = new Set(prev);
      next.delete(branchId);
      return next;
    });
  };

  const handleGenerateAiFollowUp = async (parentQuestion: ClarificationQuestion) => {
    const parentAnswer = toSafeString(answers[parentQuestion.id]);
    if (!parentAnswer.trim()) {
      setBranchToastMessage('Please select or specify an answer first before generating an AI follow-up.');
      return;
    }

    setIsGeneratingAiBranch(true);
    try {
      const newBranchQ = await requestAiFollowUpBranch(currentPrompt, parentQuestion, parentAnswer);
      if (newBranchQ) {
        setCustomAiQuestions((prev) => [...prev.filter((q) => q.id !== newBranchQ.id), newBranchQ]);
        setAnswers((prev) => ({
          ...prev,
          [newBranchQ.id]: newBranchQ.default_answer || '',
        }));
        setBranchToastMessage(`✨ AI Tailored Deep-Dive Question Generated: "${newBranchQ.question.slice(0, 50)}..."`);
      }
    } catch (err) {
      console.error('Error generating AI branch:', err);
    } finally {
      setIsGeneratingAiBranch(false);
    }
  };

  const handleAutoRecommendAll = () => {
    if (!clarificationData) return;
    const suggested: Record<string, string> = {};

    // First populate base questions
    (clarificationData.questions || []).forEach((q) => {
      const def =
        toSafeString(q.default_answer) ||
        (Array.isArray(q.options) ? q.options.map(toSafeString).join(', ') : '');
      suggested[q.id] = def;
    });

    // Also populate all unlocked branch questions
    BRANCH_RULES.forEach((rule) => {
      if (suggested[rule.parentQuestionId]) {
        const parentAns = suggested[rule.parentQuestionId].toLowerCase();
        if (rule.matchKeywords.some((kw) => parentAns.includes(kw.toLowerCase()))) {
          suggested[rule.id] = rule.default_answer;
        }
      }
    });

    setAnswers(suggested);
  };

  const handleResetAll = () => {
    if (!clarificationData) return;
    const cleared: Record<string, string> = {};
    (clarificationData.questions || []).forEach((q) => {
      cleared[q.id] = '';
    });
    setAnswers(cleared);
    setDismissedBranchIds(new Set());
    setCustomAiQuestions([]);
  };

  const handleTriggerGenerate = () => {
    const cleanAnswers: Record<string, string> = {};
    Object.keys(answers).forEach((k) => {
      cleanAnswers[k] = toSafeString(answers[k]).trim();
    });
    onGenerate(currentPrompt, cleanAnswers, additionalNotes);
  };

  const businessReadiness = useMemo(() => {
    return evaluateBusinessReadiness(answers, totalCount);
  }, [answers, totalCount]);

  const filteredJargonList = useMemo(() => {
    if (!jargonSearchTerm.trim()) return JARGON_LIST;
    const term = jargonSearchTerm.toLowerCase();
    return JARGON_LIST.filter(
      (j: JargonDefinition) =>
        j.term.toLowerCase().includes(term) ||
        j.plainMeaning.toLowerCase().includes(term) ||
        j.whyItMatters.toLowerCase().includes(term) ||
        (j.category && j.category.toLowerCase().includes(term))
    );
  }, [jargonSearchTerm]);

  const readinessStatus = useMemo(() => {
    if (progressPercent >= 80) {
      return {
        label: 'High-Fidelity Specification',
        color: 'bg-ok/10 text-ok border-ok/30',
        desc: 'Autonomous agents have comprehensive inputs to draft deep epics & tasks.',
      };
    }
    if (progressPercent >= 40) {
      return {
        label: 'Sufficient Scope Context',
        color: 'bg-warn/10 text-warn border-warn/30',
        desc: 'Good baseline. Consider clarifying architecture and user personas for precision.',
      };
    }
    return {
      label: 'Drafting Requirements',
      color: 'bg-panel-alt text-ink border-border',
      desc: 'Answer a few key questions to prevent unrequested assumptions.',
    };
  }, [progressPercent]);

  const getCategoryIcon = (category: string) => {
    const cLower = category.toLowerCase();
    if (cLower.includes('user') || cLower.includes('audience') || cLower.includes('role')) {
      return <Users className="w-3.5 h-3.5 text-accent" />;
    }
    if (cLower.includes('mvp') || cLower.includes('scope') || cLower.includes('feature')) {
      return <Target className="w-3.5 h-3.5 text-error" />;
    }
    if (cLower.includes('stack') || cLower.includes('architecture') || cLower.includes('tech') || cLower.includes('deep-dive')) {
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

  const handleNext = () => {
    if (currentStepIndex < totalCount - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      setViewMode('summary');
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="requirements-survey-modal"
      className={`fixed inset-0 z-50 flex items-center justify-center font-sans transition-all duration-150 ${
        isFullScreen
          ? 'p-0 sm:p-1.5 md:p-2.5 bg-base/85'
          : 'p-2 sm:p-4 md:p-6 bg-base/70 backdrop-blur-xs'
      }`}
    >
      <div
        className={`relative flex flex-col bg-panel-alt border border-border overflow-hidden transition-all duration-150 ${
          isFullScreen
            ? 'w-full h-full max-w-none max-h-none rounded-lg sm:rounded-[24px] md:rounded-[32px] p-1.5 sm:p-2.5 md:p-3.5'
            : 'w-full max-w-5xl xl:max-w-6xl max-h-[94vh] rounded-[28px] sm:rounded-[36px] md:rounded-[42px] p-2.5 sm:p-4 md:p-5'
        }`}
      >
        {/* Inner Window Container */}
        <div
          className={`relative flex flex-col w-full h-full bg-panel border border-border overflow-hidden ${
            isFullScreen
              ? 'flex-1 max-h-none rounded-lg sm:rounded-[18px] md:rounded-[22px]'
              : 'max-h-[calc(94vh-32px)] rounded-[20px] sm:rounded-[26px]'
          }`}
        >
          {/* Top Header Bar: Unified Streamlined Toolbar */}
          <div className="px-4 sm:px-6 py-2.5 bg-panel border-b-2 border-border flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Left: Brand Title & View Tabs */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full bg-ok border border-border shrink-0" />
                <span className="font-mono font-semibold text-xs sm:text-sm tracking-wider text-ink uppercase truncate">
                  Requirements
                </span>
              </div>

              {/* View Mode Tabs */}
              <div className="flex items-center p-0.5 bg-panel rounded-xl border border-border">
                <button
                  id="neural-chatbot-tab-btn"
                  type="button"
                  onClick={() => setViewMode('neural-chat')}
                  className={`h-7 px-2.5 text-xs font-medium rounded-pill transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'neural-chat'
                      ? 'bg-ink text-on-ink shadow-xs'
                      : 'text-ink hover:text-ink'
                  }`}
                  title="Interactive Neural Network Chatbot Requirements Gathering"
                >
                  <Brain className="w-3.5 h-3.5 text-accent" />
                  <span>AI Chat</span>
                  {chatMessages.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-ink text-on-ink text-[9px] font-mono font-semibold">
                      {chatMessages.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('wizard')}
                  className={`h-7 px-2.5 text-xs font-medium rounded-pill transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'wizard'
                      ? 'bg-ink text-on-ink shadow-xs'
                      : 'text-ink hover:text-ink'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-accent" />
                  <span>Step-by-Step</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('full')}
                  className={`h-7 px-2.5 text-xs font-medium rounded-pill transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'full'
                      ? 'bg-ink text-on-ink shadow-xs'
                      : 'text-ink hover:text-ink'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-ok" />
                  <span>All ({totalCount})</span>
                </button>

                <button
                  id="validation-summary-tab-btn"
                  type="button"
                  onClick={() => setViewMode('summary')}
                  className={`h-7 px-2.5 text-xs font-medium rounded-pill transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'summary'
                      ? 'bg-ink text-on-ink shadow-xs'
                      : 'text-ink hover:text-ink'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-ok" />
                  <span>Summary</span>
                </button>
              </div>
            </div>

            {/* Right: Actions, Mode Toggle, Full Screen & Close */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Business vs Technical Perspective Switcher */}
              <div className="flex items-center p-1 bg-ink/10 rounded-xl border border-border shadow-2xs">
                <button
                  id="perspective-business-toggle-btn"
                  type="button"
                  onClick={() => handlePerspectiveChange('business')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    surveyPerspective === 'business'
                      ? 'bg-warn text-on-ink shadow-xs ring-1 ring-warn/50'
                      : 'text-muted hover:text-ink'
                  }`}
                  title="Business View: Plain English, customer outcomes & ROI"
                >
                  <span>💼</span>
                  <span>Business</span>
                </button>
                <button
                  id="perspective-technical-toggle-btn"
                  type="button"
                  onClick={() => handlePerspectiveChange('technical')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    surveyPerspective === 'technical'
                      ? 'bg-ink text-on-ink shadow-xs ring-1 ring-info/50'
                      : 'text-muted hover:text-ink'
                  }`}
                  title="Technical View: System architecture, databases & APIs"
                >
                  <span>⚙️</span>
                  <span>Technical</span>
                </button>
              </div>

              {/* Save Draft */}
              <button
                id="save-survey-draft-top-btn"
                type="button"
                onClick={handleSaveDraft}
                title="Save current survey responses"
                className={`h-8 px-2.5 sm:px-3 rounded-pill border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all ${
                  saveSuccessFeedback
                    ? 'bg-ok text-on-ink border-ok/30'
                    : 'bg-panel border-border text-ink hover:bg-ink/5'
                }`}
              >
                {saveSuccessFeedback ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-ink stroke-[2.5]" />
                    <span className="hidden sm:inline">Saved</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-muted" />
                    <span className="hidden sm:inline">Save</span>
                  </>
                )}
              </button>

              {/* Fullscreen / Restore Toggle */}
              <button
                id="toggle-survey-fullscreen-btn"
                type="button"
                onClick={() => setIsFullScreen((prev) => !prev)}
                className="h-8 w-8 rounded-xl border border-border bg-panel text-ink flex items-center justify-center cursor-pointer hover:bg-ink/5"
                title={isFullScreen ? 'Restore windowed view' : 'Stretch to full screen'}
                aria-label={isFullScreen ? 'Restore windowed view' : 'Stretch to full screen'}
              >
                {isFullScreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-xl border border-border bg-panel hover:bg-error/20 hover:text-error hover:border-error/30 text-ink flex items-center justify-center cursor-pointer"
                aria-label="Close Survey"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

        {/* Detected Draft Recovery Banner */}
        {detectedDraft && (
          <div
            id="detected-draft-banner"
            className="px-6 py-2 bg-[rgb(var(--md-sys-color-tertiary-container))] border-b border-[rgb(var(--md-sys-color-outline-variant))] flex flex-wrap items-center justify-between gap-2.5 text-xs text-[rgb(var(--md-sys-color-on-tertiary-container))] shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <BookmarkCheck className="w-4 h-4 text-[rgb(var(--md-sys-color-tertiary))] shrink-0" />
              <div className="truncate">
                <span>Saved draft available: </span>
                <span className="font-semibold underline">&ldquo;{detectedDraft.prompt}&rdquo;</span>
                <span className="text-[11px] ml-1 opacity-80">
                  (saved {formatDraftTimestamp(detectedDraft.updatedAt)} · {detectedDraft.answeredCount}/{detectedDraft.totalCount} questions answered)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="restore-detected-draft-btn"
                type="button"
                onClick={() => handleRestoreDraft(detectedDraft)}
                className="m3-button-filled text-[10px] h-7 px-3 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restore Draft</span>
              </button>
              <button
                type="button"
                onClick={() => setDetectedDraft(null)}
                className="m3-button-outlined text-[10px] h-7 px-2.5 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Branch Notification Banner (if newly unlocked) */}
        {branchToastMessage && (
          <div className="px-6 py-2 bg-agent-business-improver/10 border-b border-agent-business-improver/30 text-xs font-medium text-agent-business-improver flex items-center justify-between gap-2 transition-all">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-agent-business-improver shrink-0" />
              <span>{branchToastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setBranchToastMessage(null)}
              className="hover:opacity-80 font-semibold text-xs p-1 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Dynamic Perspective Notification Banner */}
        {perspectiveToast && (
          <div
            className={`px-6 py-2.5 border-b text-xs font-medium flex items-center justify-between gap-2 transition-all ${
              surveyPerspective === 'business'
                ? 'bg-warn/10 border-warn/30 text-warn'
                : 'bg-info/10 border-info/30 text-info'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base shrink-0">{surveyPerspective === 'business' ? '💼' : '⚙️'}</span>
              <span>{perspectiveToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setPerspectiveToast(null)}
              className="hover:opacity-75 font-medium text-sm px-1.5 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Survey Content Area */}
        {viewMode === 'neural-chat' ? (
          /* ================= NEURAL NETWORK CHATBOT VIEW ================= */
          <div className="flex-1 min-h-[500px] flex flex-col overflow-hidden">
            <NeuralSurveyChatbot
              prompt={currentPrompt}
              answers={answers}
              additionalNotes={additionalNotes}
              chatMessages={chatMessages}
              questions={questions}
              domain={clarificationData?.inferred_domain}
              perspective={surveyPerspective}
              onPerspectiveChange={handlePerspectiveChange}
              onUpdateChatMessages={(newMessages) => {
                setChatMessages(newMessages);
                saveSurveyChatHistory(currentPrompt, newMessages);
              }}
              onUpdateAnswers={(newAnswers) => {
                setAnswers(newAnswers);
              }}
              onUpdateAdditionalNotes={(newNotes) => {
                setAdditionalNotes(newNotes);
              }}
              onGenerate={handleTriggerGenerate}
              isGenerating={isGenerating}
              onSaveDraft={handleSaveDraft}
              isDraftSaved={saveSuccessFeedback}
              onSwitchToSummary={() => setViewMode('summary')}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loadingQuestions ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 font-mono">
              <RefreshCw className="w-8 h-8 text-ink animate-spin" />
              <p className="font-semibold text-sm uppercase tracking-wider">
                Autonomous Discovery: Formulating Domain Requirements...
              </p>
              <p className="text-xs text-muted max-w-md">
                Analyzing &ldquo;{currentPrompt}&rdquo; to generate non-generic, high-relevance architectural survey questions...
              </p>
            </div>
          ) : viewMode === 'summary' ? (
            /* ================= VALIDATION SUMMARY CONFIRMATION VIEW ================= */
            <ValidationSummary
              prompt={currentPrompt}
              domain={clarificationData?.inferred_domain}
              questions={questions}
              answers={answers}
              additionalNotes={additionalNotes}
              chatMessages={chatMessages}
              onUpdatePrompt={(newPrompt) => {
                setCurrentPrompt(newPrompt);
              }}
              onUpdateAnswer={(qId, newAnswer) => {
                setAnswers((prev) => ({ ...prev, [qId]: newAnswer }));
                checkForNewlyTriggeredBranch(qId, newAnswer);
              }}
              onUpdateNotes={(newNotes) => {
                setAdditionalNotes(newNotes);
              }}
              onJumpToQuestion={(questionIndex) => {
                setCurrentStepIndex(questionIndex);
                setViewMode('wizard');
              }}
              onConfirmGenerate={handleTriggerGenerate}
              onBackToSurvey={() => setViewMode('wizard')}
              isGenerating={isGenerating}
              onSaveDraft={handleSaveDraft}
              isDraftSaved={saveSuccessFeedback}
              lastSavedTime={lastSavedTime}
            />
          ) : viewMode === 'wizard' && currentQuestion ? (
            /* ================= GUIDED WIZARD MODE ================= */
            <div className="space-y-4 w-full max-w-6xl 2xl:max-w-7xl mx-auto">
              {/* Step Roadmap & Reassurance Pipeline */}
              <div className="p-3 rounded-2xl bg-panel border border-border space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-ink text-on-ink font-semibold text-xs">
                      Question {currentStepNumber} of {totalCount}
                    </span>
                    <span className="text-muted font-medium">
                      {questionsAhead === 0
                        ? 'Final question'
                        : `${questionsAhead} remaining`}
                    </span>
                  </div>
                </div>

                {/* Step Pipeline Tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1.5 pt-0.5">
                  {questions.map((q, idx) => {
                    const isDone = Boolean(toSafeString(answers[q.id]).trim());
                    const isCurrent = idx === safeCurrentIndex;
                    const isBranch = Boolean(q.is_conditional_branch);

                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrentStepIndex(idx)}
                        className={`px-2 py-1.5 rounded-xl border text-left transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                          isCurrent
                            ? 'bg-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-on-primary))] border-[rgb(var(--md-sys-color-primary))] shadow-xs scale-[1.02]'
                            : isDone
                            ? isBranch
                              ? 'bg-[rgb(var(--md-sys-color-tertiary-container))] text-[rgb(var(--md-sys-color-on-tertiary-container))] border-[rgb(var(--md-sys-color-tertiary))]'
                              : 'bg-[rgb(var(--md-sys-color-secondary-container))] text-[rgb(var(--md-sys-color-on-secondary-container))] border-[rgb(var(--md-sys-color-secondary))]'
                            : isBranch
                            ? 'bg-[rgb(var(--md-sys-color-surface-container-low))] text-[rgb(var(--md-sys-color-on-surface-variant))] border-dashed border-[rgb(var(--md-sys-color-tertiary))]'
                            : 'bg-[rgb(var(--md-sys-color-surface-container-low))] text-[rgb(var(--md-sys-color-on-surface-variant))] border-[rgb(var(--md-sys-color-outline-variant))] hover:bg-[rgb(var(--md-sys-color-surface-container))]'
                        }`}
                        title={`Question ${idx + 1} of ${totalCount}: ${q.category} (${isDone ? 'Specified' : 'Pending'})`}
                      >
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span
                            className={`w-4 h-4 rounded-md text-[10px] font-semibold flex items-center justify-center shrink-0 ${
                              isCurrent
                                ? 'bg-ink/20 text-current'
                                : isDone
                                ? isBranch
                                  ? 'bg-[rgb(var(--md-sys-color-tertiary))] text-[rgb(var(--md-sys-color-on-tertiary))]'
                                  : 'bg-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-on-primary))]'
                                : 'bg-[rgb(var(--md-sys-color-surface-container-highest))] text-[rgb(var(--md-sys-color-on-surface))]'
                            }`}
                          >
                            {isBranch ? '↳' : idx + 1}
                          </span>
                          <span className="text-[9px] font-semibold truncate">
                            {q.category.split(' ')[0]}
                          </span>
                        </div>
                        {isDone && !isCurrent && (
                          <Check className="w-3 h-3 text-[rgb(var(--md-sys-color-primary))] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conditional Branch Banner (when currently on a branched question) */}
              {currentQuestion.is_conditional_branch && (
                <div className="p-3.5 rounded-2xl bg-[rgb(var(--md-sys-color-tertiary-container))] border border-[rgb(var(--md-sys-color-outline-variant))] shadow-xs flex flex-wrap items-center justify-between gap-2 text-[rgb(var(--md-sys-color-on-tertiary-container))]">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-xl bg-[rgb(var(--md-sys-color-tertiary))] text-[rgb(var(--md-sys-color-on-tertiary))]">
                      <GitBranch className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-[rgb(var(--md-sys-color-tertiary))] text-[rgb(var(--md-sys-color-on-tertiary))] text-[10px] font-semibold uppercase tracking-wider">
                          {currentQuestion.branch_badge || 'TAILORED FOLLOW-UP BRANCH'}
                        </span>
                        <span className="text-xs font-semibold">
                          ↳ Follow-up triggered by your choice in {currentQuestion.parent_question_label}
                        </span>
                      </div>
                      <p className="text-[11px] mt-0.5 opacity-80">
                        {currentQuestion.branch_reason}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDismissBranch(currentQuestion.id)}
                    className="m3-button-outlined text-[10px] h-7 px-2.5 text-error border-error/30 hover:bg-error/10 cursor-pointer"
                  >
                    Dismiss this follow-up
                  </button>
                </div>
              )}

              {/* Single Interactive Question Card */}
              <div className={`p-5 sm:p-6 space-y-4 rounded-2xl bg-panel border border-border ${
                currentQuestion.is_conditional_branch ? 'ring-2 ring-accent/40' : ''
              }`}>
                {/* Category & Status header with Step Indicator */}
                <div className="flex items-start justify-between gap-2 border-b-2 border-border-soft pb-3.5">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center px-2.5 py-1 rounded-pill bg-ink text-on-ink text-xs font-mono font-semibold">
                      {currentStepNumber} of {totalCount}
                    </span>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-info/10 border border-border text-[11px] font-semibold uppercase text-ink ">
                      {getCategoryIcon(currentQuestion.category)}
                      <span>{currentQuestion.category}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted font-mono hidden sm:inline">
                      {questionsAhead > 0 ? `${questionsAhead} remaining` : 'Final question'}
                    </span>
                    {toSafeString(answers[currentQuestion.id]).trim() ? (
                      <span className="flex items-center gap-1 text-ok font-semibold text-[11px] bg-ok/20 px-2.5 py-0.5 rounded-full border border-ok/40">
                        <CheckCircle2 className="w-3.5 h-3.5 text-ok" />
                        Clarified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-warn font-semibold text-[11px] bg-warn/15 px-2.5 py-0.5 rounded-full border border-warn/30">
                        <AlertCircle className="w-3.5 h-3.5 text-warn" />
                        Awaiting Choice
                      </span>
                    )}
                  </div>
                </div>

                {/* Big Question Heading & Business Insight */}
                {(() => {
                  const businessCatInfo = BUSINESS_CATEGORY_MAP[currentQuestion.category] || BUSINESS_CATEGORY_MAP['Architecture & Scope'];
                  const isBusinessMode = surveyPerspective === 'business';

                  return (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-agent-integration/10 text-agent-integration border border-agent-integration/30 text-[10px] font-semibold uppercase tracking-wide">
                            {isBusinessMode ? 'Business Goal' : 'Technical Requirement'}
                          </span>
                          {isBusinessMode && businessCatInfo && (
                            <span className="text-[11px] font-semibold text-muted">
                              Focus: {businessCatInfo.businessTitle}
                            </span>
                          )}
                        </div>

                        <h2 className="text-base sm:text-lg font-semibold text-ink leading-snug">
                          {isBusinessMode
                            ? (currentQuestion.business_title || currentQuestion.question)
                            : currentQuestion.question}
                        </h2>

                        {isBusinessMode && currentQuestion.business_title && (
                          <p className="mt-1 text-xs text-muted font-medium">
                            {currentQuestion.question}
                          </p>
                        )}
                      </div>

                      {/* Business Impact Card (Why this matters for your business) */}
                      {isBusinessMode ? (
                        <div className="p-3.5 rounded-2xl bg-[rgb(var(--md-sys-color-tertiary-container))] border border-[rgb(var(--md-sys-color-outline-variant))] space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--md-sys-color-on-tertiary-container))] uppercase">
                              <Lightbulb className="w-4 h-4 text-[rgb(var(--md-sys-color-tertiary))] shrink-0" />
                              <span>Why this matters for your launch</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowJargonModal(true)}
                              className="text-[10px] font-semibold underline text-[rgb(var(--md-sys-color-on-tertiary-container))] hover:opacity-80 flex items-center gap-1 cursor-pointer"
                            >
                              <BookOpen className="w-3 h-3" />
                              <span>Plain-English Glossary</span>
                            </button>
                          </div>
                          <p className="text-xs text-[rgb(var(--md-sys-color-on-tertiary-container))] leading-relaxed font-sans">
                            {currentQuestion.business_impact || businessCatInfo?.businessImpact || currentQuestion.why_needed}
                          </p>
                          {(currentQuestion.plain_hint || businessCatInfo?.plainEnglishHint) && (
                            <div className="text-[11px] text-[rgb(var(--md-sys-color-on-tertiary-container))] pt-1.5 border-t border-[rgb(var(--md-sys-color-outline-variant))]/40 font-sans flex items-start gap-1">
                              <span className="font-semibold shrink-0">💡 Founder Tip:</span>
                              <span>{currentQuestion.plain_hint || businessCatInfo?.plainEnglishHint}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-2xl bg-info/10 border border-info/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wide">
                              <Cpu className="w-4 h-4 text-accent shrink-0" />
                              <span>Technical Specification Directive</span>
                            </div>
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-info/10 text-info border border-info/30">
                              SYSTEM ARCHITECTURE
                            </span>
                          </div>
                          <p className="text-xs text-accent leading-relaxed">
                            <strong>Why needed:</strong> {currentQuestion.why_needed}
                          </p>
                          <div className="text-[11px] text-accent pt-1.5 border-t border-info/30 flex items-start gap-1 font-mono">
                            <span className="font-semibold shrink-0">⚙️ Engineering Impact:</span>
                            <span>Directly dictates data model indexing, API endpoint contracts, latency targets, and deployment containers.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Preset Interactive Option Chips */}
                {currentQuestion.options && currentQuestion.options.length > 0 && (
                  <div className="pt-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--md-sys-color-on-surface-variant))] mb-2">
                      <span>
                        {surveyPerspective === 'business'
                          ? 'Select the options that best match your vision:'
                          : 'Select architectural parameters:'}
                      </span>
                      <span className="text-[rgb(var(--md-sys-color-on-surface-variant))] opacity-75 text-[10px] normal-case">
                        {currentQuestion.allow_multiple ? 'Multiple selections allowed' : 'Single choice'}
                      </span>
                    </div>

                    <div className={surveyPerspective === 'business' ? 'grid grid-cols-1 md:grid-cols-2 gap-2.5' : 'grid grid-cols-1 sm:grid-cols-2 gap-2'}>
                      {currentQuestion.options.map((opt) => {
                        const currentAnswer = toSafeString(answers[currentQuestion.id]);
                        const selectedList = currentAnswer
                          .split(/[,;]/)
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const isSelected = selectedList.includes(opt);
                        const optInfo = getBusinessOptionInfo(opt);
                        const techKey = `${currentQuestion.id}_${opt}`;
                        const isTechOpen = expandedTechSpecs[techKey];

                        if (surveyPerspective === 'business') {
                          return (
                            <div
                              key={opt}
                              onClick={() =>
                                handleToggleOption(
                                  currentQuestion.id,
                                  opt,
                                  currentQuestion.allow_multiple
                                )
                              }
                              className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between gap-2 select-none ${
                                isSelected
                                  ? 'bg-warn text-on-ink border-border translate-y-0.5'
                                  : 'bg-panel text-ink border-border hover:-translate-y-0.5'
                              }`}
                            >
                              <div className="flex items-start gap-2.5">
                                <span
                                  className={`w-5 h-5 rounded-md border border-border flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold transition-all ${
                                    isSelected
                                      ? 'bg-ink text-on-ink'
                                      : 'bg-panel'
                                  }`}
                                >
                                  {isSelected ? '✓' : ''}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-semibold text-sm text-ink leading-tight">
                                      {optInfo.label}
                                    </span>
                                    {optInfo.badge && (
                                      <span className="px-2 py-0.5 rounded-md bg-agent-business-improver/10 text-ink border border-border text-[9px] font-semibold uppercase tracking-wider">
                                        {optInfo.badge}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted mt-1 leading-relaxed font-sans">
                                    {optInfo.plainExplanation}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-1 text-[11px]">
                                <span className="text-muted font-sans italic text-[11px]">
                                  <strong>Ideal for:</strong> {optInfo.recommendedFor}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedTechSpecs((prev) => ({
                                      ...prev,
                                      [techKey]: !prev[techKey],
                                    }));
                                  }}
                                  className="text-[10px] font-mono font-semibold text-ink hover:underline cursor-pointer"
                                >
                                  {isTechOpen ? 'Hide Spec' : 'Show Spec'}
                                </button>
                              </div>

                              {isTechOpen && (
                                <div className="p-2 rounded-xl bg-panel-alt border border-border text-[10px] font-mono text-ink break-words mt-1">
                                  <span className="font-semibold text-ink">TECHNICAL SPEC: </span>
                                  {opt}
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Technical view
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              handleToggleOption(
                                currentQuestion.id,
                                opt,
                                currentQuestion.allow_multiple
                              )
                            }
                            className={`p-3 rounded-xl text-xs font-semibold border border-border transition-all text-left flex items-start gap-2.5 cursor-pointer ${
                              isSelected
                                ? 'bg-warn text-on-ink translate-y-0.5'
                                : 'bg-panel text-ink hover:-translate-y-0.5'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-md border border-border flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-semibold ${
                                isSelected
                                  ? 'bg-ink text-on-ink'
                                  : 'bg-panel'
                              }`}
                            >
                              {isSelected ? '✓' : ''}
                            </span>
                            <span className="flex-1 leading-snug">{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Custom Details / Modification Textarea */}
                <div className="pt-2 border-t border-[rgb(var(--md-sys-color-outline-variant))]">
                  <div className="flex flex-wrap items-center justify-between text-[11px] font-semibold uppercase text-[rgb(var(--md-sys-color-on-surface-variant))] mb-2 gap-1.5">
                    <div className="flex items-center gap-2">
                      <span>Custom Specification / Fine-Tuning:</span>
                      <VoiceInputButton
                        id={`voice-wizard-${currentQuestion.id}`}
                        label="Speak Answer"
                        contextHint={currentQuestion.question}
                        currentValue={toSafeString(answers[currentQuestion.id])}
                        onTextCaptured={(newText) => {
                          handleTextChange(currentQuestion.id, newText);
                        }}
                        variant="inline-sm"
                      />
                    </div>
                    {Boolean(toSafeString(currentQuestion.default_answer)) && (
                      <button
                        type="button"
                        onClick={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [currentQuestion.id]: toSafeString(currentQuestion.default_answer),
                          }))
                        }
                        className="text-[rgb(var(--md-sys-color-primary))] hover:underline font-semibold text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        Use Recommended Preset
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    value={toSafeString(answers[currentQuestion.id])}
                    onChange={(e) => handleTextChange(currentQuestion.id, e.target.value)}
                    placeholder={currentQuestion.placeholder || 'Type or speak custom specifications, constraints, or overrides...'}
                    className="w-full text-xs font-medium p-3 rounded-xl border border-[rgb(var(--md-sys-color-outline))] bg-[rgb(var(--md-sys-color-surface))] text-[rgb(var(--md-sys-color-on-surface))] placeholder:text-[rgb(var(--md-sys-color-on-surface-variant))]/50 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--md-sys-color-primary))] resize-none transition-all"
                  />
                  {toSafeString(answers[currentQuestion.id]).length > 0 && (
                    <div className="mt-1 flex justify-end text-[10px] text-[rgb(var(--md-sys-color-on-surface-variant))] font-mono opacity-70">
                      {toSafeString(answers[currentQuestion.id]).length} chars
                    </div>
                  )}
                </div>

                {/* Conditional Branching Controls & AI Follow-Up Trigger (on parent questions) */}
                {!currentQuestion.is_conditional_branch && (
                  <div className="pt-2 border-t border-[rgb(var(--md-sys-color-outline-variant))] flex flex-wrap items-center justify-between gap-2">
                    {/* Unlocked Branch Preview */}
                    {(() => {
                      const childBranches = questions.filter(
                        (q) => q.is_conditional_branch && q.parent_question_id === currentQuestion.id
                      );
                      if (childBranches.length === 0) return null;
                      return (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="m3-chip text-[10px] h-6 px-2.5 bg-[rgb(var(--md-sys-color-tertiary-container))] text-[rgb(var(--md-sys-color-on-tertiary-container))] border-transparent font-semibold uppercase flex items-center gap-1">
                            <GitBranch className="w-3 h-3 text-[rgb(var(--md-sys-color-tertiary))]" />
                            <span>{childBranches.length} Follow-up unlocked</span>
                          </span>
                          <span className="text-[11px] font-semibold text-[rgb(var(--md-sys-color-on-surface-variant))] truncate max-w-xs">
                            ↳ {childBranches[0].category}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => handleGenerateAiFollowUp(currentQuestion)}
                        disabled={isGeneratingAiBranch || !toSafeString(answers[currentQuestion.id]).trim()}
                        className="m3-button-outlined text-xs h-8 px-3 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                        title="Generate a custom AI follow-up question tailored to your current choice"
                      >
                        {isGeneratingAiBranch ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[rgb(var(--md-sys-color-primary))]" />
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-warn" />
                            <span>Ask AI Follow-Up</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Wizard Nav Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t-2 border-border-soft">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={safeCurrentIndex === 0}
                  className="h-9 px-4 rounded-pill border border-border bg-panel text-ink text-xs font-medium disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('full')}
                    className="text-xs font-medium text-muted hover:text-ink underline px-2 cursor-pointer"
                  >
                    View All
                  </button>

                  {safeCurrentIndex < totalCount - 1 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="h-9 px-5 rounded-pill border border-border bg-ink text-on-ink text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:bg-ink/90"
                    >
                      <span>Next</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setViewMode('summary')}
                      className="h-9 px-5 rounded-pill border border-border bg-ok text-on-ink text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:bg-ok/90"
                    >
                      <span>Review Validation Summary</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Live Blueprint Summary in Wizard Mode */}
              <LiveBlueprintSummary
                questions={questions}
                answers={answers}
                additionalNotes={additionalNotes}
                prompt={currentPrompt}
                domain={clarificationData?.inferred_domain}
                isOpen={showLiveSummary}
                onToggle={() => setShowLiveSummary((prev) => !prev)}
                onJumpToQuestion={(idx) => setCurrentStepIndex(idx)}
                onClearAnswer={(qId) =>
                  setAnswers((prev) => {
                    const next = { ...prev };
                    delete next[qId];
                    return next;
                  })
                }
              />
            </div>
          ) : (
            /* ================= FULL / ALL QUESTIONS VIEW ================= */
            <div className="space-y-4">
              {/* Full Mode Progress & Confidence Summary Banner */}
              <div className="m3-card-outlined p-4 flex flex-wrap items-center justify-between gap-2 text-xs bg-[rgb(var(--md-sys-color-surface))] border-[rgb(var(--md-sys-color-outline-variant))]">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-on-primary))] text-[11px] font-semibold uppercase tracking-wider shadow-xs">
                    Requirements Checklist
                  </span>
                  <span className="font-semibold text-[rgb(var(--md-sys-color-on-surface))]">
                    {answeredCount} of {totalCount} Questions Specified
                  </span>
                  {activeBranchCount > 0 && (
                    <span className="m3-chip text-[10px] h-6 px-2.5 bg-[rgb(var(--md-sys-color-tertiary-container))] text-[rgb(var(--md-sys-color-on-tertiary-container))] border-transparent font-semibold uppercase">
                      {activeBranchCount} Tailored Follow-Ups Unlocked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono font-semibold">
                  {remainingCount === 0 ? (
                    <span className="text-ok bg-ok/10 px-2.5 py-0.5 rounded-full border border-ok/30">
                      ✓ All {totalCount} questions answered · Ready to generate plan
                    </span>
                  ) : (
                    <span className="text-warn bg-warn/10 px-2.5 py-0.5 rounded-full border border-warn/30">
                      {remainingCount} question{remainingCount === 1 ? '' : 's'} remaining before plan generation
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const firstUnansweredIndex = questions.findIndex(
                        (q) => !toSafeString(answers[q.id]).trim()
                      );
                      if (firstUnansweredIndex !== -1) {
                        setCurrentStepIndex(firstUnansweredIndex);
                        setViewMode('wizard');
                      }
                    }}
                    className="underline text-[rgb(var(--md-sys-color-primary))] hover:opacity-80 ml-1 font-semibold cursor-pointer"
                  >
                    Jump to next pending →
                  </button>
                </div>
              </div>

              {/* All Questions List with Indented Branches */}
              {questions.map((q, idx) => {
                const currentAnswer = toSafeString(answers[q.id]);
                const isAnswered = Boolean(currentAnswer.trim());
                const isBranch = Boolean(q.is_conditional_branch);
                const selectedList = currentAnswer
                  .split(/[,;]/)
                  .map((s) => s.trim())
                  .filter(Boolean);

                return (
                  <div
                    key={q.id}
                    id={`survey-question-${q.id}`}
                    className={`m3-card-outlined p-5 transition-all bg-[rgb(var(--md-sys-color-surface))] border-[rgb(var(--md-sys-color-outline-variant))] ${
                      isBranch
                        ? 'ml-4 sm:ml-8 border-l-4 border-l-[rgb(var(--md-sys-color-tertiary))] bg-[rgb(var(--md-sys-color-tertiary-container))]/20'
                        : ''
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-on-primary))] text-[10px] font-semibold flex items-center justify-center shrink-0">
                          {isBranch ? '↳' : idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-[rgb(var(--md-sys-color-on-surface))] uppercase">
                          Question {idx + 1} of {totalCount}
                        </span>
                        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[rgb(var(--md-sys-color-surface-container))] border border-[rgb(var(--md-sys-color-outline-variant))] text-[10px] font-semibold uppercase text-[rgb(var(--md-sys-color-on-surface))]">
                          {getCategoryIcon(q.category)}
                          <span>{q.category}</span>
                        </div>
                        {isBranch && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgb(var(--md-sys-color-tertiary-container))] text-[rgb(var(--md-sys-color-on-tertiary-container))] border border-[rgb(var(--md-sys-color-outline-variant))] text-[10px] font-semibold uppercase">
                            <GitBranch className="w-3 h-3 text-[rgb(var(--md-sys-color-tertiary))]" />
                            <span>{q.branch_badge || 'TAILORED BRANCH'}</span>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-1 text-xs">
                        {isBranch && (
                          <button
                            type="button"
                            onClick={() => handleDismissBranch(q.id)}
                            className="px-2 py-0.5 text-[10px] font-medium text-error hover:underline mr-1 cursor-pointer"
                          >
                            Dismiss branch
                          </button>
                        )}
                        {isAnswered ? (
                          <span className="flex items-center gap-1 text-ok font-semibold text-[11px] bg-ok/10 px-2.5 py-0.5 rounded-full border border-ok/30">
                            <CheckCircle2 className="w-3.5 h-3.5 text-ok" />
                            Specified
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-warn font-semibold text-[11px] bg-warn/10 px-2.5 py-0.5 rounded-full border border-warn/30">
                            <AlertCircle className="w-3.5 h-3.5 text-warn" />
                            Pending
                          </span>
                        )}
                      </div>
                    </div>

                    {isBranch && q.branch_reason && (
                      <div className="text-[10px] font-mono font-semibold text-[rgb(var(--md-sys-color-on-tertiary-container))] bg-[rgb(var(--md-sys-color-tertiary-container))] px-2.5 py-1 rounded-lg border border-[rgb(var(--md-sys-color-outline-variant))] inline-block mb-2">
                        ↳ {q.branch_reason}
                      </div>
                    )}

                    {/* Question text & reason */}
                    {(() => {
                      const businessCat = BUSINESS_CATEGORY_MAP[q.category];
                      const isBusiness = surveyPerspective === 'business';

                      return (
                        <div className="mb-3">
                          <h3 className="text-sm sm:text-base font-semibold text-[rgb(var(--md-sys-color-on-surface))] leading-snug mb-1">
                            {isBusiness ? (q.business_title || q.question) : q.question}
                          </h3>
                          {isBusiness && q.business_title && (
                            <p className="text-xs font-semibold text-[rgb(var(--md-sys-color-on-surface-variant))] mb-1">
                              {q.question}
                            </p>
                          )}
                          <p className="text-[11px] text-[rgb(var(--md-sys-color-on-surface-variant))] font-sans">
                            <span className="font-semibold text-[rgb(var(--md-sys-color-on-surface))]">{isBusiness ? 'Business Goal:' : 'Directive:'}</span>{' '}
                            {isBusiness ? (q.business_impact || businessCat?.businessImpact || q.why_needed) : q.why_needed}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Chips */}
                    {q.options && q.options.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--md-sys-color-on-surface-variant))] mb-1.5 flex items-center justify-between">
                          <span>{surveyPerspective === 'business' ? 'Choose recommended presets:' : 'Click presets:'}</span>
                          <span className="text-[rgb(var(--md-sys-color-on-surface-variant))] opacity-70 text-[9px] normal-case">
                            {q.allow_multiple ? 'Multiple allowed' : 'Single choice'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {q.options.map((opt) => {
                            const isSelected = selectedList.includes(opt);
                            const optInfo = getBusinessOptionInfo(opt);

                            if (surveyPerspective === 'business') {
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => handleToggleOption(q.id, opt, q.allow_multiple)}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-all text-left flex items-center gap-2 cursor-pointer ${
                                    isSelected
                                      ? 'bg-[rgb(var(--md-sys-color-secondary-container))] text-[rgb(var(--md-sys-color-on-secondary-container))] border-[rgb(var(--md-sys-color-primary))] shadow-xs'
                                      : 'bg-[rgb(var(--md-sys-color-surface-container-low))] text-[rgb(var(--md-sys-color-on-surface))] border-[rgb(var(--md-sys-color-outline-variant))] hover:bg-[rgb(var(--md-sys-color-surface-container))]'
                                  }`}
                                  title={`${optInfo.plainExplanation} (Tech spec: ${opt})`}
                                >
                                  <span className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center text-[10px] font-semibold ${
                                    isSelected ? 'bg-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-on-primary))] border-[rgb(var(--md-sys-color-primary))]' : 'bg-[rgb(var(--md-sys-color-surface))] border-[rgb(var(--md-sys-color-outline))]'
                                  }`}>
                                    {isSelected ? '✓' : ''}
                                  </span>
                                  <div>
                                    <span className="font-semibold text-xs">{optInfo.label}</span>
                                    {optInfo.badge && (
                                      <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-[rgb(var(--md-sys-color-tertiary-container))] text-[rgb(var(--md-sys-color-on-tertiary-container))] text-[8px] font-semibold uppercase">
                                        {optInfo.badge}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            }

                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleToggleOption(q.id, opt, q.allow_multiple)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-xl border transition-all text-left cursor-pointer ${
                                  isSelected
                                    ? 'bg-[rgb(var(--md-sys-color-secondary-container))] text-[rgb(var(--md-sys-color-on-secondary-container))] border-[rgb(var(--md-sys-color-primary))] shadow-xs'
                                    : 'bg-[rgb(var(--md-sys-color-surface-container-low))] text-[rgb(var(--md-sys-color-on-surface))] border-[rgb(var(--md-sys-color-outline-variant))] hover:bg-[rgb(var(--md-sys-color-surface-container))]'
                                }`}
                              >
                                {isSelected ? '✓ ' : '+ '}
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom Input */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between text-[10px] font-semibold uppercase text-[rgb(var(--md-sys-color-on-surface-variant))] mb-1 gap-1">
                        <div className="flex items-center gap-1.5">
                          <span>Your Specification / Fine-Tuning:</span>
                          <VoiceInputButton
                            id={`voice-all-${q.id}`}
                            label="Speak"
                            contextHint={q.question}
                            currentValue={toSafeString(answers[q.id])}
                            onTextCaptured={(spokenText) => handleTextChange(q.id, spokenText)}
                            variant="inline-sm"
                          />
                        </div>
                        {Boolean(toSafeString(q.default_answer)) && (
                          <button
                            type="button"
                            onClick={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: toSafeString(q.default_answer),
                              }))
                            }
                            className="text-[rgb(var(--md-sys-color-primary))] hover:underline font-semibold cursor-pointer"
                          >
                            Reset to Recommended
                          </button>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        value={toSafeString(answers[q.id])}
                        onChange={(e) => handleTextChange(q.id, e.target.value)}
                        placeholder={q.placeholder || 'Type or speak specific constraints...'}
                        className="w-full text-xs font-medium p-2.5 rounded-xl border border-[rgb(var(--md-sys-color-outline))] bg-[rgb(var(--md-sys-color-surface))] text-[rgb(var(--md-sys-color-on-surface))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--md-sys-color-primary))] resize-none transition-all"
                      />
                    </div>
                  </div>
                );
              })}

              {/* Additional Constraints / Architectural Rules Box */}
              <div className="m3-card-outlined p-5 space-y-2 bg-[rgb(var(--md-sys-color-surface))] border-[rgb(var(--md-sys-color-outline-variant))]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-on-primary))] text-xs font-semibold shrink-0">
                      +
                    </div>
                    <div className="px-2.5 py-0.5 rounded-full bg-[rgb(var(--md-sys-color-surface-container))] border border-[rgb(var(--md-sys-color-outline-variant))] text-[10px] font-semibold uppercase text-[rgb(var(--md-sys-color-on-surface))]">
                      Additional Architectural Directives & Rules
                    </div>
                  </div>
                  <VoiceInputButton
                    id="voice-directives-notes"
                    label="Dictate Directives"
                    currentValue={additionalNotes}
                    onTextCaptured={(spokenText) => setAdditionalNotes(spokenText)}
                    variant="inline-sm"
                  />
                </div>
                <h3 className="text-xs sm:text-sm font-semibold text-[rgb(var(--md-sys-color-on-surface))] mb-1">
                  Existing repositories, database schemas, budget limits, or team capacity?
                </h3>
                <p className="text-[11px] text-[rgb(var(--md-sys-color-on-surface-variant))] italic mb-2 font-sans">
                  The autonomous agents will obey every rule specified here during epic and task generation.
                </p>
                <textarea
                  rows={2}
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="e.g. Existing PostgreSQL 16 schema, must deploy to Google Cloud Run, 3 full-stack engineers on the team..."
                  className="w-full text-xs font-medium p-2.5 rounded-xl border border-[rgb(var(--md-sys-color-outline))] bg-[rgb(var(--md-sys-color-surface))] text-[rgb(var(--md-sys-color-on-surface))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--md-sys-color-primary))] resize-none"
                />
              </div>
            </div>
          )}

          {/* Live Specification Preview Drawer (Redesigned Live Blueprint Summary) */}
          <LiveBlueprintSummary
            questions={questions}
            answers={answers}
            additionalNotes={additionalNotes}
            prompt={currentPrompt}
            domain={clarificationData?.inferred_domain}
            isOpen={showLiveSummary}
            onToggle={() => setShowLiveSummary((prev) => !prev)}
            onJumpToQuestion={(idx) => {
              setCurrentStepIndex(idx);
              setViewMode('wizard');
            }}
            onClearAnswer={(qId) =>
              setAnswers((prev) => {
                const next = { ...prev };
                delete next[qId];
                return next;
              })
            }
          />
        </div>
      )}

        {/* Modal Bottom Footer Actions (Shown in wizard, full, or summary modes) */}
        {viewMode !== 'neural-chat' && (
          <div className="px-4 sm:px-6 py-3 bg-panel border-t-2 border-border flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-tight text-ink">
                {answeredCount} of {totalCount} Requirements Confirmed
              </span>
              <span className="text-xs font-mono font-semibold text-muted hidden md:inline">
                ({progressPercent}% complete)
              </span>
              {lastSavedTime && (
                <span className="text-[11px] text-muted font-mono hidden lg:flex items-center gap-1.5 border-l-2 border-border pl-3">
                  <Clock className="w-3.5 h-3.5 opacity-70" />
                  <span>Saved locally {formatDraftTimestamp(lastSavedTime)}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                id="save-survey-draft-bottom-btn"
                type="button"
                onClick={handleSaveDraft}
                className={`text-xs h-10 px-4 font-medium rounded-xl border border-border transition-all flex items-center gap-1.5 cursor-pointer ${
                  saveSuccessFeedback
                    ? 'bg-ok text-on-ink'
                    : 'bg-panel text-ink hover:bg-ink/5'
                }`}
                title="Save current survey progress to local storage to return later"
              >
                {saveSuccessFeedback ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Draft Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-accent" />
                    <span>Save Draft</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl border border-border bg-panel-alt hover:bg-ink/5 text-ink font-medium text-xs cursor-pointer"
              >
                Cancel
              </button>

              {viewMode !== 'summary' ? (
                <button
                  type="button"
                  onClick={() => setViewMode('summary')}
                  className="h-10 px-5 rounded-pill border border-border bg-ink text-on-ink font-medium text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-ok" />
                  <span>Review Validation Summary</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    id="generate-from-survey-footer-btn"
                    type="button"
                    onClick={handleTriggerGenerate}
                    disabled={isGenerating}
                    className="h-10 sm:h-11 px-5 sm:px-6 rounded-pill bg-ink hover:bg-ink/90 text-on-ink font-medium text-xs sm:text-sm tracking-tight border border-border transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-ink" />
                        <span>Synthesizing Architecture...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-warn" />
                        <span>Generate Architecture Blueprint</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleTriggerGenerate}
                    disabled={isGenerating}
                    className="h-10 sm:h-11 w-10 sm:w-11 rounded-xl bg-info/10 hover:bg-info/20 text-ink border border-border transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                    title="Generate Architecture Blueprint"
                  >
                    <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ================= CONDITIONAL BRANCHING LOGIC MAP MODAL ================= */}
      {showBranchDiagram && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-base/60 backdrop-blur-xs font-mono">
          <div className="w-full max-w-2xl m3-card bg-[rgb(var(--md-sys-color-surface-container-high))] border border-[rgb(var(--md-sys-color-outline-variant))] p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[rgb(var(--md-sys-color-outline-variant))] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[rgb(var(--md-sys-color-tertiary-container))] text-[rgb(var(--md-sys-color-on-tertiary-container))]">
                  <GitBranch className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm uppercase text-[rgb(var(--md-sys-color-on-surface))]">
                  Survey Conditional Branching Logic Matrix
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBranchDiagram(false)}
                className="p-1.5 rounded-full hover:bg-[rgb(var(--md-sys-color-surface-container-highest))] text-[rgb(var(--md-sys-color-on-surface-variant))] cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[rgb(var(--md-sys-color-on-surface-variant))] font-sans">
              Follow-up questions are automatically unlocked when your survey answers match specific technologies, compliance frameworks, or business goals.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {BRANCH_RULES.map((rule) => {
                const parentAnswer = toSafeString(answers[rule.parentQuestionId]).toLowerCase();
                const isMatched = rule.matchKeywords.some((kw) => parentAnswer.includes(kw.toLowerCase()));
                const isDismissed = dismissedBranchIds.has(rule.id);
                const isActive = isMatched && !isDismissed;

                return (
                  <div
                    key={rule.id}
                    className={`rounded-xl border p-3.5 text-xs transition-all ${
                      isActive
                        ? 'border-[rgb(var(--md-sys-color-tertiary))] bg-[rgb(var(--md-sys-color-tertiary-container))]/20'
                        : isDismissed
                        ? 'border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container))] opacity-60'
                        : 'border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container-low))]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[11px] uppercase text-[rgb(var(--md-sys-color-on-surface))]">
                          {rule.branchBadge}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase border ${
                          isActive
                            ? 'bg-ok/15 text-ok border-ok/30'
                            : isDismissed
                            ? 'bg-[rgb(var(--md-sys-color-surface-container-highest))] text-[rgb(var(--md-sys-color-on-surface-variant))] border-[rgb(var(--md-sys-color-outline-variant))]'
                            : 'bg-[rgb(var(--md-sys-color-surface-container))] text-[rgb(var(--md-sys-color-on-surface-variant))] border-[rgb(var(--md-sys-color-outline-variant))]'
                        }`}>
                          {isActive ? 'Active & Unlocked' : isDismissed ? 'Dismissed' : 'Condition Not Met'}
                        </span>
                      </div>

                      {isDismissed ? (
                        <button
                          type="button"
                          onClick={() => handleRestoreBranch(rule.id)}
                          className="text-[10px] font-semibold text-[rgb(var(--md-sys-color-primary))] hover:underline cursor-pointer"
                        >
                          Restore
                        </button>
                      ) : isActive ? (
                        <button
                          type="button"
                          onClick={() => handleDismissBranch(rule.id)}
                          className="text-[10px] font-semibold text-error hover:underline cursor-pointer"
                        >
                          Dismiss
                        </button>
                      ) : null}
                    </div>

                    <div className="text-[11px] font-semibold text-[rgb(var(--md-sys-color-on-surface))]">
                      <strong>Follow-up:</strong> {rule.question}
                    </div>
                    <div className="text-[10px] text-[rgb(var(--md-sys-color-on-surface-variant))] mt-1">
                      <strong>Trigger Keywords:</strong> {rule.matchKeywords.slice(0, 6).join(', ')} in {rule.parentQuestionId.replace(/_/g, ' ')}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-[rgb(var(--md-sys-color-outline-variant))] pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowBranchDiagram(false)}
                className="m3-button-filled text-xs h-9 px-4 cursor-pointer"
              >
                Close Logic Matrix
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= SAVED DRAFTS MANAGER MODAL ================= */}
      {showDraftsModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-base/60 backdrop-blur-xs font-mono">
          <div className="w-full max-w-2xl m3-card bg-[rgb(var(--md-sys-color-surface-container-high))] border border-[rgb(var(--md-sys-color-outline-variant))] p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[rgb(var(--md-sys-color-outline-variant))] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[rgb(var(--md-sys-color-primary-container))] text-[rgb(var(--md-sys-color-on-primary-container))]">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm uppercase text-[rgb(var(--md-sys-color-on-surface))]">
                  Saved Requirements Drafts ({allDrafts.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDraftsModal(false)}
                className="p-1.5 rounded-full hover:bg-[rgb(var(--md-sys-color-surface-container-highest))] text-[rgb(var(--md-sys-color-on-surface-variant))] cursor-pointer transition-colors"
                aria-label="Close Drafts Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[rgb(var(--md-sys-color-on-surface-variant))] font-sans">
              Survey responses saved to browser local storage. Resume an in-progress project plan anytime, or clear old drafts.
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {allDrafts.length === 0 ? (
                <div className="py-12 text-center text-[rgb(var(--md-sys-color-on-surface-variant))] font-mono text-xs">
                  No saved drafts found. Click &ldquo;Save Draft&rdquo; in the survey to preserve your planning state.
                </div>
              ) : (
                allDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className={`rounded-xl border p-3.5 text-xs transition-all ${
                      draft.id === activeDraftId
                        ? 'border-[rgb(var(--md-sys-color-primary))] bg-[rgb(var(--md-sys-color-secondary-container))]'
                        : 'border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container-low))] hover:border-[rgb(var(--md-sys-color-primary))]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-xs text-[rgb(var(--md-sys-color-on-surface))] truncate max-w-sm">
                          &ldquo;{draft.prompt}&rdquo;
                        </span>
                        {draft.id === activeDraftId && (
                          <span className="m3-chip text-[9px] h-5 px-2 bg-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-on-primary))] border-transparent font-semibold uppercase">
                            Currently Active
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[rgb(var(--md-sys-color-on-surface-variant))] font-mono shrink-0">
                        {formatDraftTimestamp(draft.updatedAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px] text-[rgb(var(--md-sys-color-on-surface-variant))] font-sans">
                      <span className="px-2 py-0.5 rounded-md bg-[rgb(var(--md-sys-color-surface-container))] border border-[rgb(var(--md-sys-color-outline-variant))] text-[10px] font-semibold">
                        {draft.answeredCount} of {draft.totalCount} questions answered
                      </span>
                      {draft.domain && (
                        <span className="px-2 py-0.5 rounded-md bg-[rgb(var(--md-sys-color-tertiary-container))] text-[rgb(var(--md-sys-color-on-tertiary-container))] text-[10px] font-semibold uppercase">
                          {draft.domain}
                        </span>
                      )}
                      <span className="opacity-70 text-[10px]">
                        Mode: {draft.viewMode || 'wizard'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[rgb(var(--md-sys-color-outline-variant))]">
                      <button
                        type="button"
                        onClick={() => handleRestoreDraft(draft)}
                        className="m3-button-filled text-[11px] h-8 px-3.5 flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Resume This Draft</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(draft.id)}
                        className="p-1 text-[rgb(var(--md-sys-color-on-surface-variant))] hover:text-error text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                        title="Delete draft from browser storage"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[rgb(var(--md-sys-color-outline-variant))] pt-3 flex items-center justify-between">
              {allDrafts.length > 0 ? (
                <button
                  type="button"
                  onClick={handleClearAllDrafts}
                  className="px-3 py-1.5 rounded-xl text-xs text-error hover:text-error font-medium hover:bg-error/10 cursor-pointer transition-colors"
                >
                  Clear All Drafts
                </button>
              ) : <div />}

              <button
                type="button"
                onClick={() => setShowDraftsModal(false)}
                className="m3-button-outlined text-xs h-9 px-4 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= PLAIN-ENGLISH TECH JARGON GLOSSARY MODAL ================= */}
      {showJargonModal && (
        <div
          id="jargon-glossary-modal"
          className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-base/60 backdrop-blur-xs font-mono"
        >
          <div className="w-full max-w-3xl m3-card bg-[rgb(var(--md-sys-color-surface-container-high))] border border-[rgb(var(--md-sys-color-outline-variant))] p-5 shadow-2xl space-y-4 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[rgb(var(--md-sys-color-outline-variant))] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[rgb(var(--md-sys-color-tertiary-container))] text-[rgb(var(--md-sys-color-on-tertiary-container))] border border-[rgb(var(--md-sys-color-outline-variant))] flex items-center justify-center text-base">
                  📖
                </div>
                <div>
                  <h3 className="font-semibold text-sm sm:text-base uppercase text-[rgb(var(--md-sys-color-on-surface))]">
                    Plain-English Tech Jargon Glossary
                  </h3>
                  <p className="text-[11px] text-[rgb(var(--md-sys-color-on-surface-variant))] font-sans">
                    Clear business explanations for tech stacks, databases, APIs, and security terms.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowJargonModal(false)}
                className="p-1.5 rounded-full hover:bg-[rgb(var(--md-sys-color-surface-container-highest))] text-[rgb(var(--md-sys-color-on-surface-variant))] cursor-pointer transition-colors"
                aria-label="Close Jargon Glossary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input Filter */}
            <div className="relative">
              <Search className="w-4 h-4 text-[rgb(var(--md-sys-color-on-surface-variant))] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={jargonSearchTerm}
                onChange={(e) => setJargonSearchTerm(e.target.value)}
                placeholder="Search jargon (e.g., PostgreSQL, OAuth, SOC2, Latency, Redis)..."
                className="w-full pl-9 pr-8 py-2.5 text-xs font-semibold rounded-xl border border-[rgb(var(--md-sys-color-outline))] bg-[rgb(var(--md-sys-color-surface))] text-[rgb(var(--md-sys-color-on-surface))] placeholder:text-[rgb(var(--md-sys-color-on-surface-variant))]/50 focus:ring-2 focus:ring-[rgb(var(--md-sys-color-primary))] focus:outline-none"
              />
              {jargonSearchTerm && (
                <button
                  type="button"
                  onClick={() => setJargonSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--md-sys-color-on-surface-variant))] hover:text-[rgb(var(--md-sys-color-on-surface))] text-xs font-semibold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Terms List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {filteredJargonList.length === 0 ? (
                <div className="py-12 text-center text-[rgb(var(--md-sys-color-on-surface-variant))] text-xs">
                  No definitions found matching &ldquo;{jargonSearchTerm}&rdquo;.
                </div>
              ) : (
                filteredJargonList.map((item: JargonDefinition) => (
                  <div
                    key={item.term}
                    className="p-4 rounded-xl border border-[rgb(var(--md-sys-color-outline-variant))] bg-[rgb(var(--md-sys-color-surface-container-low))] hover:bg-[rgb(var(--md-sys-color-surface-container))] transition-all space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[rgb(var(--md-sys-color-on-surface))]">
                          {item.term}
                        </span>
                        <span className="m3-chip text-[9px] h-5 px-2 bg-[rgb(var(--md-sys-color-secondary-container))] text-[rgb(var(--md-sys-color-on-secondary-container))] border-transparent font-semibold uppercase">
                          {item.category}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-[rgb(var(--md-sys-color-on-surface))] font-sans leading-relaxed">
                      {item.plainMeaning}
                    </p>

                    <div className="pt-2 border-t border-[rgb(var(--md-sys-color-outline-variant))] text-[11px] font-sans text-[rgb(var(--md-sys-color-on-surface-variant))] space-y-1">
                      <div>
                        <strong className="text-[rgb(var(--md-sys-color-on-surface))]">Why this matters for your business: </strong>
                        <span>{item.whyItMatters}</span>
                      </div>
                      {item.example && (
                        <div className="text-[rgb(var(--md-sys-color-on-surface-variant))] opacity-75 font-mono text-[10px]">
                          <strong>Example:</strong> {item.example}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[rgb(var(--md-sys-color-outline-variant))] pt-3 flex items-center justify-between">
              <span className="text-[11px] text-[rgb(var(--md-sys-color-on-surface-variant))] font-sans">
                Showing {filteredJargonList.length} of {JARGON_LIST.length} terms
              </span>
              <button
                type="button"
                onClick={() => setShowJargonModal(false)}
                className="m3-button-filled text-xs h-9 px-4 cursor-pointer font-medium"
              >
                Got It, Back to Survey
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { ValidationSummary };
export default RequirementsSurvey;
