import { ClarificationPackage, ClarificationQuestion, NeuralSurveyChatMessage } from './geminiPM';

export interface SurveyDraft {
  id: string;
  prompt: string;
  answers: Record<string, string>;
  additionalNotes: string;
  clarificationData: ClarificationPackage | null;
  customAiQuestions: ClarificationQuestion[];
  dismissedBranchIds: string[];
  viewMode: 'neural-chat' | 'wizard' | 'full' | 'summary';
  currentStepIndex: number;
  answeredCount: number;
  totalCount: number;
  domain?: string;
  updatedAt: number; // Date.now()
  chatMessages?: NeuralSurveyChatMessage[];
}

export interface SurveyChatSession {
  id: string;
  prompt: string;
  title?: string;
  messages: NeuralSurveyChatMessage[];
  summarySnippet?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export const LOCAL_STORAGE_LATEST_DRAFT_KEY = 'forge_pm_survey_latest_draft';
export const LOCAL_STORAGE_DRAFTS_LIST_KEY = 'forge_pm_survey_drafts_list';
export const LOCAL_STORAGE_SURVEY_CHAT_PREFIX = 'forge_pm_survey_chat_';
export const LOCAL_STORAGE_SURVEY_SESSIONS_KEY = 'forge_pm_survey_chat_sessions';
const MAX_SAVED_DRAFTS = 10;
const MAX_SAVED_SESSIONS = 15;

/**
 * Normalizes prompt string into a consistent cache key.
 */
function normalizePromptKey(prompt: string): string {
  return prompt.trim().toLowerCase().slice(0, 80).replace(/[^a-z0-9]/g, '_');
}

/**
 * Persists the current survey state to localStorage.
 * Updates both the latest draft key and the historical drafts list.
 */
export function saveSurveyDraft(
  data: {
    prompt: string;
    answers: Record<string, string>;
    additionalNotes?: string;
    clarificationData?: ClarificationPackage | null;
    customAiQuestions?: ClarificationQuestion[];
    dismissedBranchIds?: string[];
    viewMode?: 'neural-chat' | 'wizard' | 'full' | 'summary';
    currentStepIndex?: number;
    domain?: string;
    chatMessages?: NeuralSurveyChatMessage[];
  },
  existingId?: string
): SurveyDraft | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const answeredCount = Object.values(data.answers || {}).filter(
      (v) => typeof v === 'string' && v.trim().length > 0
    ).length;

    const totalCount =
      (data.clarificationData?.questions?.length || 0) +
      (data.customAiQuestions?.length || 0);

    const draftId =
      existingId ||
      `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const draft: SurveyDraft = {
      id: draftId,
      prompt: data.prompt,
      answers: data.answers || {},
      additionalNotes: data.additionalNotes || '',
      clarificationData: data.clarificationData ?? null,
      customAiQuestions: data.customAiQuestions || [],
      dismissedBranchIds: data.dismissedBranchIds || [],
      viewMode: data.viewMode || 'wizard',
      currentStepIndex: data.currentStepIndex || 0,
      answeredCount,
      totalCount,
      domain: data.domain || data.clarificationData?.inferred_domain,
      updatedAt: Date.now(),
      chatMessages: data.chatMessages || [],
    };

    // 1. Save latest draft
    localStorage.setItem(LOCAL_STORAGE_LATEST_DRAFT_KEY, JSON.stringify(draft));

    // 2. Add or update in drafts list
    const existingList = getAllSurveyDrafts();
    const filtered = existingList.filter(
      (d) => d.id !== draft.id && d.prompt.toLowerCase() !== draft.prompt.toLowerCase()
    );
    const updatedList = [draft, ...filtered].slice(0, MAX_SAVED_DRAFTS);
    localStorage.setItem(LOCAL_STORAGE_DRAFTS_LIST_KEY, JSON.stringify(updatedList));

    // 3. Also update chat history storage if messages exist
    if (data.chatMessages && data.chatMessages.length > 0) {
      saveSurveyChatHistory(data.prompt, data.chatMessages);
    }

    return draft;
  } catch (err) {
    console.error('Failed to save survey draft to localStorage:', err);
    return null;
  }
}

/**
 * Retrieves the most recently saved survey draft from localStorage.
 */
export function getLatestSurveyDraft(): SurveyDraft | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_LATEST_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SurveyDraft;
  } catch (err) {
    console.warn('Failed to parse latest survey draft:', err);
    return null;
  }
}

/**
 * Finds a saved draft matching a specific prompt (case-insensitive substring or exact match).
 */
export function getSurveyDraftForPrompt(prompt: string): SurveyDraft | null {
  if (!prompt.trim()) return null;
  const list = getAllSurveyDrafts();
  const normalized = prompt.trim().toLowerCase();

  return (
    list.find((d) => d.prompt.trim().toLowerCase() === normalized) ||
    list.find(
      (d) =>
        d.prompt.trim().toLowerCase().includes(normalized) ||
        normalized.includes(d.prompt.trim().toLowerCase())
    ) ||
    null
  );
}

/**
 * Retrieves all saved drafts ordered by most recent first.
 */
export function getAllSurveyDrafts(): SurveyDraft[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DRAFTS_LIST_KEY);
    if (!raw) {
      // Fallback: check latest draft
      const single = getLatestSurveyDraft();
      return single ? [single] : [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.warn('Failed to parse survey drafts list:', err);
    return [];
  }
}

/**
 * Deletes a draft by ID.
 */
export function deleteSurveyDraft(id: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const list = getAllSurveyDrafts().filter((d) => d.id !== id);
    localStorage.setItem(LOCAL_STORAGE_DRAFTS_LIST_KEY, JSON.stringify(list));

    const latest = getLatestSurveyDraft();
    if (latest && latest.id === id) {
      if (list.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_LATEST_DRAFT_KEY, JSON.stringify(list[0]));
      } else {
        localStorage.removeItem(LOCAL_STORAGE_LATEST_DRAFT_KEY);
      }
    }
  } catch (err) {
    console.error('Failed to delete draft:', err);
  }
}

/**
 * Removes all survey drafts from localStorage.
 */
export function clearAllSurveyDrafts(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.removeItem(LOCAL_STORAGE_LATEST_DRAFT_KEY);
    localStorage.removeItem(LOCAL_STORAGE_DRAFTS_LIST_KEY);
  } catch (err) {
    console.error('Failed to clear survey drafts:', err);
  }
}

/**
 * Formats a timestamp into a friendly relative or date-time string.
 */
export function formatDraftTimestamp(timestamp: number): string {
  if (!timestamp) return 'Recently';
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Saves chat messages for a specific prompt and updates historical chat sessions list.
 */
export function saveSurveyChatHistory(
  prompt: string,
  messages: NeuralSurveyChatMessage[],
  sessionId?: string,
  title?: string
): SurveyChatSession | null {
  if (typeof window === 'undefined' || !window.localStorage || !prompt.trim() || messages.length === 0) {
    return null;
  }

  try {
    const key = `${LOCAL_STORAGE_SURVEY_CHAT_PREFIX}${normalizePromptKey(prompt)}`;
    localStorage.setItem(key, JSON.stringify(messages));

    const id = sessionId || `session_${normalizePromptKey(prompt)}_${Date.now()}`;
    const userMsgs = messages.filter((m) => m.role === 'user');
    const lastMsg = messages[messages.length - 1];
    const generatedTitle =
      title ||
      (userMsgs.length > 0 ? userMsgs[0].content.slice(0, 45) : prompt.slice(0, 45));

    const session: SurveyChatSession = {
      id,
      prompt,
      title: generatedTitle,
      messages,
      summarySnippet: lastMsg?.content.slice(0, 100) || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: messages.length,
    };

    const existingSessions = getAllSurveyChatSessions();
    const filtered = existingSessions.filter(
      (s) => s.id !== session.id && (s.prompt.toLowerCase() !== prompt.toLowerCase() || s.id === sessionId)
    );
    const updated = [session, ...filtered].slice(0, MAX_SAVED_SESSIONS);
    localStorage.setItem(LOCAL_STORAGE_SURVEY_SESSIONS_KEY, JSON.stringify(updated));

    return session;
  } catch (err) {
    console.error('Failed to save survey chat history:', err);
    return null;
  }
}

/**
 * Retrieves the stored chat history messages for a specific prompt.
 */
export function getSurveyChatHistory(prompt: string): NeuralSurveyChatMessage[] {
  if (typeof window === 'undefined' || !window.localStorage || !prompt.trim()) {
    return [];
  }

  try {
    const key = `${LOCAL_STORAGE_SURVEY_CHAT_PREFIX}${normalizePromptKey(prompt)}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }

    // Fallback: check session list for matching prompt
    const sessions = getAllSurveyChatSessions(prompt);
    if (sessions.length > 0) {
      return sessions[0].messages || [];
    }

    // Fallback: check latest draft
    const latestDraft = getSurveyDraftForPrompt(prompt);
    if (latestDraft && latestDraft.chatMessages && latestDraft.chatMessages.length > 0) {
      return latestDraft.chatMessages;
    }

    return [];
  } catch (err) {
    console.warn('Failed to retrieve survey chat history:', err);
    return [];
  }
}

/**
 * Retrieves all saved survey chat sessions, optionally filtered by prompt.
 */
export function getAllSurveyChatSessions(promptFilter?: string): SurveyChatSession[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SURVEY_SESSIONS_KEY);
    if (!raw) return [];
    const list: SurveyChatSession[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    if (promptFilter && promptFilter.trim()) {
      const norm = promptFilter.trim().toLowerCase();
      return list.filter(
        (s) =>
          s.prompt.toLowerCase() === norm ||
          s.prompt.toLowerCase().includes(norm) ||
          norm.includes(s.prompt.toLowerCase())
      );
    }

    return list;
  } catch (err) {
    console.warn('Failed to retrieve survey chat sessions:', err);
    return [];
  }
}

/**
 * Deletes a specific chat session by ID.
 */
export function deleteSurveyChatSession(sessionId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const sessions = getAllSurveyChatSessions().filter((s) => s.id !== sessionId);
    localStorage.setItem(LOCAL_STORAGE_SURVEY_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.error('Failed to delete survey chat session:', err);
  }
}

/**
 * Clears chat history for a specific prompt or all survey chat history.
 */
export function clearSurveyChatHistory(prompt?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (prompt && prompt.trim()) {
      const key = `${LOCAL_STORAGE_SURVEY_CHAT_PREFIX}${normalizePromptKey(prompt)}`;
      localStorage.removeItem(key);

      const norm = prompt.trim().toLowerCase();
      const sessions = getAllSurveyChatSessions().filter(
        (s) => s.prompt.toLowerCase() !== norm
      );
      localStorage.setItem(LOCAL_STORAGE_SURVEY_SESSIONS_KEY, JSON.stringify(sessions));
    } else {
      // Clear all
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LOCAL_STORAGE_SURVEY_CHAT_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem(LOCAL_STORAGE_SURVEY_SESSIONS_KEY);
    }
  } catch (err) {
    console.error('Failed to clear survey chat history:', err);
  }
}

/**
 * Exports the chat history as a clean markdown formatted transcript string.
 */
export function exportChatTranscriptAsText(
  messages: NeuralSurveyChatMessage[],
  prompt: string
): string {
  if (!messages || messages.length === 0) {
    return `Requirement Discovery Chat Transcript\nInitiative: ${prompt}\n(No conversation turns recorded)`;
  }

  const lines: string[] = [
    `# Requirement Discovery & Calibration Chat Transcript`,
    `**Initiative Concept:** ${prompt}`,
    `**Date:** ${new Date().toLocaleString()}`,
    `**Total Exchanges:** ${messages.length}`,
    `----------------------------------------\n`,
  ];

  messages.forEach((m, idx) => {
    const roleLabel = m.role === 'assistant' ? '🤖 Lead Architect' : '👤 User';
    const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : `Turn #${idx + 1}`;
    lines.push(`### [${timeStr}] ${roleLabel}`);
    lines.push(`${m.content}\n`);

    if (m.mixedMedia) {
      if (m.mixedMedia.diagram) {
        lines.push(`> 📐 **Topology Diagram Inferred:** ${m.mixedMedia.diagram.title}`);
        lines.push(`> *${m.mixedMedia.diagram.description}*\n`);
      }
      if (m.mixedMedia.storyCard) {
        lines.push(`> 📋 **INVEST Story:** [${m.mixedMedia.storyCard.id}] ${m.mixedMedia.storyCard.title} (${m.mixedMedia.storyCard.points} pts)`);
      }
    }
    lines.push('');
  });

  return lines.join('\n');
}

