import type {
  PMInitiative,
  PMPRD,
  PMEpic,
  PMStory,
  PMTask,
  PMSprint,
  PMExecution,
} from './types/api';
import { saveLocalInitiativeDetails, saveLocalInitiative } from './pmData';

export interface InitiativePackage {
  initiative: PMInitiative;
  prd: PMPRD | null;
  epics: PMEpic[];
  stories: PMStory[];
  tasks: PMTask[];
  sprints: PMSprint[];
  executions: PMExecution[];
  is_real_llm?: boolean;
  generated_by?: string;
}

export interface ClarificationQuestion {
  id: string;
  category: string;
  question: string;
  why_needed: string;
  placeholder?: string;
  options: string[];
  default_answer?: string;
  allow_multiple?: boolean;
  // Conditional branching metadata
  is_conditional_branch?: boolean;
  parent_question_id?: string;
  parent_question_label?: string;
  branch_badge?: string;
  branch_reason?: string;
  trigger_matched_value?: string;
  is_ai_generated?: boolean;
  // Business-friendly fields for non-technical users
  business_title?: string;
  business_impact?: string;
  plain_hint?: string;
}

export interface ClarificationPackage {
  product_summary: string;
  inferred_domain: string;
  questions: ClarificationQuestion[];
}

export async function checkGeminiLiveStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/gemini/health');
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.live_mode);
  } catch {
    return false;
  }
}

export async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string = 'audio/webm'
): Promise<string> {
  const res = await fetch('/api/gemini/transcribe-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBase64, mimeType }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Audio transcription failed with status ${res.status}`);
  }

  const data = await res.json();
  return String(data.transcript || '').trim();
}

export async function clarifyInitiativeWithGemini(prompt: string): Promise<ClarificationPackage> {
  const res = await fetch('/api/gemini/clarify-initiative', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Clarification query failed with status ${res.status}`);
  }

  const data = await res.json();
  const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
  const sanitizedQuestions: ClarificationQuestion[] = rawQuestions.map((q: any, idx: number) => {
    let defAnswer = '';
    if (typeof q.default_answer === 'string') {
      defAnswer = q.default_answer;
    } else if (Array.isArray(q.default_answer)) {
      defAnswer = q.default_answer.map(String).join(', ');
    } else if (q.default_answer != null) {
      defAnswer = String(q.default_answer);
    }

    const safeOptions = Array.isArray(q.options)
      ? q.options.map((opt: any) => String(opt || '')).filter(Boolean)
      : [];

    return {
      id: String(q.id || `q_${idx}`),
      category: String(q.category || 'Architecture'),
      question: String(q.question || ''),
      why_needed: String(q.why_needed || ''),
      placeholder: String(q.placeholder || ''),
      options: safeOptions,
      default_answer: defAnswer || (safeOptions.length > 0 ? safeOptions[0] : ''),
      allow_multiple: Boolean(q.allow_multiple),
    };
  });

  return {
    product_summary: String(data.product_summary || prompt),
    inferred_domain: String(data.inferred_domain || 'Modern SaaS Platform'),
    questions: sanitizedQuestions,
  };
}

export async function generateInitiativeWithGemini(
  prompt: string,
  onPhaseChange?: (phase: string) => void,
  clarifications?: Record<string, string>,
  additionalNotes?: string
): Promise<InitiativePackage> {
  if (onPhaseChange) {
    onPhaseChange('Business Analyst Agent: Incorporating user specifications & requirements...');
  }

  // Set up progressive stage notification intervals
  const stages = [
    'Business Analyst Agent: Validating user-specified personas & MVP boundaries...',
    'Architect Agent: Aligning system architecture with chosen tech stack...',
    'PRD Writer Agent: Structuring requirement contracts & compliance constraints...',
    'Epic & Story Generator: Synthesizing INVEST epics tailored to user scope...',
    'Task Generator: Decomposing into real technical tasks with chosen frameworks...',
    'Sprint Planner: Scheduling sprint cadence according to user timeline...',
  ];

  let currentStageIndex = 0;
  const timer = setInterval(() => {
    currentStageIndex++;
    if (currentStageIndex < stages.length && onPhaseChange) {
      onPhaseChange(stages[currentStageIndex]);
    }
  }, 4500);

  try {
    const res = await fetch('/api/gemini/generate-initiative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, clarifications, additionalNotes }),
    });

    clearInterval(timer);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Generation failed with status ${res.status}`);
    }

    const packageData: InitiativePackage = await res.json();

    // Persist to local storage
    saveLocalInitiativeDetails(packageData);
    saveLocalInitiative(packageData.initiative);

    return packageData;
  } catch (err) {
    clearInterval(timer);
    throw err;
  }
}

export async function executeTaskWithGemini(
  task: PMTask,
  techStack: string[] = []
): Promise<{
  status: string;
  thought: string;
  logs: string[];
  files: Array<{ path: string; code: string }>;
  summary: string;
  tokens_used: number;
  cost_usd: number;
  duration_seconds: number;
}> {
  const res = await fetch('/api/gemini/execute-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.description,
      assignedAgent: task.assigned_agent,
      techStack,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Task execution failed (${res.status})`);
  }

  return res.json();
}

export async function runScrumStandupWithGemini(
  sprint: PMSprint,
  tasks: PMTask[]
): Promise<{
  date: string;
  summary: string;
  blockers: string[];
  risks: string[];
  confidence_score: number;
}> {
  const res = await fetch('/api/gemini/scrum-standup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sprintId: sprint.id,
      sprintName: sprint.name,
      sprintGoal: sprint.goal,
      tasks,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Scrum standup failed (${res.status})`);
  }

  return res.json();
}

export interface AudioBriefingMedia {
  title: string;
  duration: string;
  narrator: string;
  script: string;
  audioFrequencies: number[];
}

export interface ChartMedia {
  type: 'burndown' | 'points_distribution' | 'velocity_risk';
  title: string;
  description: string;
  data: Array<Record<string, any>>;
}

export interface StoryCardMedia {
  id: string;
  title: string;
  epic: string;
  points: number;
  priority: 'high' | 'medium' | 'low';
  investScore: number;
  acceptanceCriteria: string[];
}

export interface DiagramMedia {
  title: string;
  description: string;
  nodes: Array<{ id: string; label: string; type: 'client' | 'gateway' | 'service' | 'storage'; tech?: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
}

export interface CodeSnippetMedia {
  title: string;
  language: string;
  code: string;
  description: string;
}

export interface MixedMediaPayload {
  audioBriefing?: AudioBriefingMedia;
  chart?: ChartMedia;
  storyCard?: StoryCardMedia;
  diagram?: DiagramMedia;
  codeSnippet?: CodeSnippetMedia;
  attachments?: Array<{ name: string; size: string; type: string }>;
}

export interface NeuralSurveyChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  mixedMedia?: MixedMediaPayload;
  attachments?: Array<{ name: string; size: string; type: string }>;
  suggestions?: string[];
}

export interface NeuralSurveyResponse {
  reply: string;
  extracted_requirements: Record<string, string>;
  activated_nodes: string[];
  node_details: Record<string, string>;
  quick_replies: string[];
  convergence_score: number;
  synthesis_ready: boolean;
  mixedMedia?: MixedMediaPayload;
}

export interface InitiativeCopilotChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  mixedMedia?: MixedMediaPayload;
  attachments?: Array<{ name: string; size: string; type: string }>;
}

export interface InitiativeCopilotResponse {
  reply: string;
  mixedMedia?: MixedMediaPayload;
  quickReplies: string[];
}

export async function chatWithNeuralSurveyGemini(params: {
  prompt: string;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentAnswers: Record<string, string>;
  questions?: ClarificationQuestion[];
  domain?: string;
  perspective?: 'business' | 'technical';
}): Promise<NeuralSurveyResponse> {
  const res = await fetch('/api/gemini/neural-survey-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Neural survey chat failed (${res.status})`);
  }

  return res.json();
}

export async function chatWithInitiativeCopilot(params: {
  initiativeId: string;
  initiativeName: string;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: {
    techStack?: string[];
    epics?: Array<{ id: string; title: string; story_points?: number }>;
    stories?: Array<{ id: string; title: string; points?: number; priority?: string }>;
    sprints?: Array<{ id: string; name?: string; goal?: string }>;
  };
}): Promise<InitiativeCopilotResponse> {
  const res = await fetch('/api/gemini/initiative-copilot-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Initiative Copilot chat failed (${res.status})`);
  }

  return res.json();
}
