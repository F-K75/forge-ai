import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Brain,
  Send,
  Sparkles,
  Zap,
  Activity,
  CheckCircle2,
  Info,
  Maximize2,
  Minimize2,
  Terminal,
  Cpu,
  ArrowRight,
  Users,
  Save,
  Check,
  History,
  Copy,
  RotateCcw,
  Download,
  Search,
  Trash2,
  X,
  Bookmark,
  Clock,
  CheckCheck,
  FileText,
} from 'lucide-react';
import {
  chatWithNeuralSurveyGemini,
  NeuralSurveyChatMessage,
  ClarificationQuestion,
} from '../../lib/geminiPM';
import {
  SurveyChatSession,
  getAllSurveyChatSessions,
  saveSurveyChatHistory,
  deleteSurveyChatSession,
  clearSurveyChatHistory,
  exportChatTranscriptAsText,
  formatDraftTimestamp,
} from '../../lib/surveyDraftStorage';
import { VoiceInputButton } from './VoiceInputButton';
import { MixedMediaCard } from './MixedMediaCard';

export interface NeuralNode {
  id: string;
  name: string;
  category: 'input' | 'hidden1' | 'hidden2' | 'output';
  layer: number;
  index: number;
  activation: number; // 0.0 to 1.0
  resolvedDetail?: string;
  iconName: string;
  description: string;
}

export interface NeuralSynapse {
  fromId: string;
  toId: string;
  weight: number; // 0.1 to 1.0
  active: boolean;
}

export interface NeuralSurveyChatbotProps {
  prompt: string;
  answers: Record<string, string>;
  additionalNotes: string;
  onUpdateAnswers: (updatedAnswers: Record<string, string>) => void;
  onUpdateAdditionalNotes: (notes: string) => void;
  onGenerate: () => void;
  isGenerating?: boolean;
  onSaveDraft?: () => void;
  isDraftSaved?: boolean;
  onSwitchToSummary?: () => void;
  chatMessages?: NeuralSurveyChatMessage[];
  onUpdateChatMessages?: (messages: NeuralSurveyChatMessage[]) => void;
  questions?: ClarificationQuestion[];
  domain?: string;
  perspective?: 'business' | 'technical';
  onPerspectiveChange?: (mode: 'business' | 'technical') => void;
}

const INITIAL_NODES: NeuralNode[] = [
  // Layer 0: Sensory Inputs
  { id: 'in_intent', name: 'Core Scope', category: 'input', layer: 0, index: 0, activation: 0.9, iconName: 'Workflow', description: 'Core functional boundaries and problem definition' },
  { id: 'in_scale', name: 'Scale SLA', category: 'input', layer: 0, index: 1, activation: 0.3, iconName: 'Server', description: 'Traffic volume, concurrency, and peak load targets' },
  { id: 'in_sla', name: 'Latency', category: 'input', layer: 0, index: 2, activation: 0.4, iconName: 'Activity', description: 'Response latency benchmarks and uptime SLA' },
  { id: 'in_roles', name: 'Personas', category: 'input', layer: 0, index: 3, activation: 0.5, iconName: 'Users', description: 'Primary actors, permissions, and tenant isolation' },
  { id: 'in_compliance', name: 'Compliance', category: 'input', layer: 0, index: 4, activation: 0.2, iconName: 'ShieldCheck', description: 'Regulatory, audit, and encryption standards' },

  // Layer 1: Architecture Domains (Hidden 1)
  { id: 'hid_auth', name: 'Auth & RBAC', category: 'hidden1', layer: 1, index: 0, activation: 0.3, iconName: 'Lock', description: 'Identity, OAuth2, session handling and ACLs' },
  { id: 'hid_data', name: 'Persistence', category: 'hidden1', layer: 1, index: 1, activation: 0.4, iconName: 'Database', description: 'Relational or vector database schemas and caching' },
  { id: 'hid_api', name: 'API Gateway', category: 'hidden1', layer: 1, index: 2, activation: 0.5, iconName: 'Cpu', description: 'REST / GraphQL endpoints, routing and protocols' },
  { id: 'hid_workers', name: 'Task Queues', category: 'hidden1', layer: 1, index: 3, activation: 0.2, iconName: 'Layers', description: 'Asynchronous workers, queue brokers, and retries' },
  { id: 'hid_frontend', name: 'UI / UX Shell', category: 'hidden1', layer: 1, index: 4, activation: 0.6, iconName: 'Workflow', description: 'Interactive frontend layout, design system, and state' },

  // Layer 2: Reliability & Ops (Hidden 2)
  { id: 'hid_cache', name: 'Edge Cache', category: 'hidden2', layer: 2, index: 0, activation: 0.3, iconName: 'Zap', description: 'Distributed caching and latency minimization' },
  { id: 'hid_telemetry', name: 'Telemetry', category: 'hidden2', layer: 2, index: 1, activation: 0.4, iconName: 'Activity', description: 'Structured logging, APM metrics, and error tracing' },
  { id: 'hid_resilience', name: 'Resilience', category: 'hidden2', layer: 2, index: 2, activation: 0.3, iconName: 'ShieldCheck', description: 'Circuit breakers, failover, and retry backoff' },
  { id: 'hid_ratelimit', name: 'Rate Limiting', category: 'hidden2', layer: 2, index: 3, activation: 0.2, iconName: 'Server', description: 'Token bucket rate limits and abuse prevention' },

  // Layer 3: Specification Deliverables (Outputs)
  { id: 'out_prd', name: 'Product PRD', category: 'output', layer: 3, index: 0, activation: 0.4, iconName: 'Brain', description: 'Complete Product Requirement Document with journey maps' },
  { id: 'out_epics', name: 'INVEST Epics', category: 'output', layer: 3, index: 1, activation: 0.5, iconName: 'Layers', description: '3 to 4 INVEST-compliant epics with point sizing' },
  { id: 'out_tasks', name: 'DAG Tasks', category: 'output', layer: 3, index: 2, activation: 0.4, iconName: 'Workflow', description: 'Topologically sequenced technical task breakdown' },
  { id: 'out_schemas', name: 'DB Schemas', category: 'output', layer: 3, index: 3, activation: 0.3, iconName: 'Database', description: 'Production database tables, relations, and indexes' },
  { id: 'out_sprints', name: 'Sprint Matrix', category: 'output', layer: 3, index: 4, activation: 0.4, iconName: 'Activity', description: 'Iterative sprint allocations and team velocity' },
];

export const NeuralSurveyChatbot: React.FC<NeuralSurveyChatbotProps> = ({
  prompt,
  answers,
  additionalNotes: _additionalNotes,
  onUpdateAnswers,
  onUpdateAdditionalNotes: _onUpdateAdditionalNotes,
  onGenerate,
  isGenerating = false,
  onSaveDraft,
  isDraftSaved = false,
  onSwitchToSummary,
  chatMessages,
  onUpdateChatMessages,
  questions,
  domain,
  perspective = 'business',
  onPerspectiveChange,
}) => {
  const [messages, setMessages] = useState<NeuralSurveyChatMessage[]>(
    chatMessages && chatMessages.length > 0 ? chatMessages : []
  );
  const [inputValue, setInputValue] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>(() => {
    if (questions && questions.length > 0 && Array.isArray(questions[0].options) && questions[0].options.length > 0) {
      return questions[0].options.slice(0, 4);
    }
    if (perspective === 'technical') {
      return [
        'PostgreSQL + Prisma / Drizzle ORM',
        'Supabase / Firebase real-time cluster',
        'Microservices with Redis event broker',
        'FastAPI Python with TimescaleDB',
      ];
    }
    return [
      'Individual consumers & mobile users',
      'B2B teams & workspace administrators',
      'Creators, freelancers & solo pros',
      'Internal enterprise operations',
    ];
  });
  const [convergenceScore, setConvergenceScore] = useState<number>(35);
  const [nodes, setNodes] = useState<NeuralNode[]>(INITIAL_NODES);
  const [selectedNode, setSelectedNode] = useState<NeuralNode | null>(null);
  const [firingNodeIds, setFiringNodeIds] = useState<Set<string>>(new Set(['in_intent']));
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);

  // Chat History Drawer & Session State
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [historyRoleFilter, setHistoryRoleFilter] = useState<'all' | 'user' | 'assistant' | 'media'>('all');
  const [activeHistoryTab, setActiveHistoryTab] = useState<'transcript' | 'sessions'>('transcript');
  const [savedSessions, setSavedSessions] = useState<SurveyChatSession[]>([]);
  const [copiedFullTranscript, setCopiedFullTranscript] = useState<boolean>(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);
  const [showSaveSnapshotModal, setShowSaveSnapshotModal] = useState<boolean>(false);
  const [snapshotTitleInput, setSnapshotTitleInput] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

  // Refresh saved sessions on load or prompt change
  useEffect(() => {
    if (prompt) {
      const sessions = getAllSurveyChatSessions(prompt);
      setSavedSessions(sessions);
    }
  }, [prompt]);

  // Sync state if external chatMessages prop updates
  useEffect(() => {
    if (chatMessages && chatMessages.length > 0) {
      setMessages(chatMessages);
    }
  }, [chatMessages]);

  // Sync initial answers to node activations
  useEffect(() => {
    setNodes((prevNodes) => {
      return prevNodes.map((node) => {
        let act = node.activation;
        let detail = node.resolvedDetail;

        if (node.id === 'in_roles' && answers.target_users) {
          act = Math.max(act, 0.85);
          detail = answers.target_users;
        }
        if (node.id === 'in_intent' && answers.mvp_scope) {
          act = Math.max(act, 0.95);
          detail = answers.mvp_scope;
        }
        if (node.id === 'hid_data' && answers.tech_stack) {
          act = Math.max(act, 0.9);
          detail = answers.tech_stack;
        }
        if (node.id === 'hid_auth' && answers.compliance_security) {
          act = Math.max(act, 0.85);
          detail = answers.compliance_security;
        }
        if (node.id === 'out_sprints' && answers.timeline_cadence) {
          act = Math.max(act, 0.9);
          detail = answers.timeline_cadence;
        }

        return { ...node, activation: act, resolvedDetail: detail };
      });
    });
  }, [answers]);

  // Synchronize quick replies when perspective switches
  useEffect(() => {
    if (perspective === 'technical') {
      setQuickReplies([
        'PostgreSQL + Prisma / Drizzle ORM',
        'Supabase / Firebase real-time cluster',
        'Microservices with Redis event broker',
        'Docker container on Cloud Run (sub-100ms SLA)',
      ]);
    } else {
      setQuickReplies([
        'Individual consumers & mobile users',
        'B2B teams & workspace administrators',
        'Creators, freelancers & solo pros',
        'Fast 4-week MVP launch sprint',
      ]);
    }
  }, [perspective]);

  // Initial welcome greeting on load if completely empty
  useEffect(() => {
    if ((!chatMessages || chatMessages.length === 0) && messages.length === 0 && prompt) {
      const q0 = questions && questions.length > 0 ? questions[0] : null;
      let initialQuestionText = '';
      let initialOptions: string[] = [];

      const isBiz = perspective === 'business';
      if (q0) {
        initialQuestionText = isBiz
          ? `Neural specification mesh initialized for "${prompt.slice(0, 65)}". I am your Lead Product Strategist. To shape your launch blueprint: ${q0.business_title || q0.question}`
          : `Neural specification mesh initialized for "${prompt.slice(0, 65)}". I am your Lead Systems Architect. To calibrate our architecture parameters: ${q0.question}`;
        if (Array.isArray(q0.options) && q0.options.length > 0) {
          initialOptions = q0.options.slice(0, 4);
        }
      } else {
        initialQuestionText = isBiz
          ? `Neural specification mesh initialized for "${prompt.slice(0, 65)}". I am your Lead Product Strategist. To shape your launch blueprint, who are your target customers and what core problem will this solve for them on Day 1?`
          : `Neural specification mesh initialized for "${prompt.slice(0, 65)}". I am your Lead Systems Architect. To calibrate our architecture parameters, what primary tech stack and database topology are you targeting?`;
        initialOptions = isBiz
          ? [
              'Individual consumers & mobile users',
              'B2B teams & workspace administrators',
              'Creators, freelancers & solo pros',
              'Internal enterprise operations',
            ]
          : [
              'PostgreSQL + Prisma / Drizzle ORM',
              'Supabase / Firebase real-time cluster',
              'High-concurrency microservices + Redis',
              'Python FastAPI + TimescaleDB',
            ];
      }

      if (initialOptions.length > 0) {
        setQuickReplies(initialOptions);
      }

      const initialAssistantMessage: NeuralSurveyChatMessage = {
        id: `msg-init-${Date.now()}`,
        role: 'assistant',
        content: initialQuestionText,
        timestamp: Date.now(),
        suggestions: initialOptions,
        mixedMedia: {
          audioBriefing: {
            title: isBiz ? 'Product Strategy & Launch Brief' : 'Neural Architecture Calibration Brief',
            duration: '0:38',
            narrator: isBiz ? 'Product Strategy Advisor' : 'Lead Systems Architect',
            script: isBiz
              ? `Neural specification mesh active for ${prompt.slice(0, 60)}. Calibrating user journeys, monetization models, and launch milestones.`
              : `Neural specification mesh active for ${prompt.slice(0, 60)}. Calibrating technical boundaries and non-functional requirements.`,
            audioFrequencies: [25, 45, 65, 80, 95, 70, 45, 65, 85, 75, 55, 35, 60, 80, 65, 45, 25, 15],
          },
        },
      };
      setMessages([initialAssistantMessage]);
      onUpdateChatMessages?.([initialAssistantMessage]);
    }
  }, [prompt, chatMessages, messages.length, questions, perspective, onUpdateChatMessages]);

  // Scroll chat to bottom
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAiThinking]);

  // Generate synapses dynamically based on node layers
  const synapses = useMemo(() => {
    const list: NeuralSynapse[] = [];
    const layers = [
      nodes.filter((n) => n.layer === 0),
      nodes.filter((n) => n.layer === 1),
      nodes.filter((n) => n.layer === 2),
      nodes.filter((n) => n.layer === 3),
    ];

    for (let l = 0; l < layers.length - 1; l++) {
      const currentLayer = layers[l];
      const nextLayer = layers[l + 1];

      currentLayer.forEach((fromNode) => {
        nextLayer.forEach((toNode) => {
          const weight = (fromNode.activation + toNode.activation) / 2;
          const active = firingNodeIds.has(fromNode.id) || firingNodeIds.has(toNode.id);
          list.push({
            fromId: fromNode.id,
            toId: toNode.id,
            weight: Math.max(0.15, weight),
            active,
          });
        });
      });
    }
    return list;
  }, [nodes, firingNodeIds]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isAiThinking) return;

    const userMessage: NeuralSurveyChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    onUpdateChatMessages?.(newMessages);
    setInputValue('');
    setIsAiThinking(true);

    // Animate firing nodes
    const randomFired = new Set(['in_intent', 'hid_data', 'out_prd']);
    setFiringNodeIds(randomFired);

    try {
      const historyPayload = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await chatWithNeuralSurveyGemini({
        prompt,
        message: text,
        history: historyPayload,
        currentAnswers: answers,
        questions,
        domain,
        perspective,
      });

      // Update answers with any extracted requirements
      if (res.extracted_requirements && Object.keys(res.extracted_requirements).length > 0) {
        onUpdateAnswers({
          ...answers,
          ...res.extracted_requirements,
        });
      }

      // Update convergence
      if (typeof res.convergence_score === 'number') {
        setConvergenceScore(res.convergence_score);
      }

      // Update quick replies
      if (Array.isArray(res.quick_replies) && res.quick_replies.length > 0) {
        setQuickReplies(res.quick_replies);
      }

      // Animate and update node activations
      if (Array.isArray(res.activated_nodes)) {
        const activatedSet = new Set(res.activated_nodes);
        setFiringNodeIds(activatedSet);

        setNodes((prev) =>
          prev.map((n) => {
            if (activatedSet.has(n.id)) {
              const detail = res.node_details?.[n.id] || n.resolvedDetail || text.slice(0, 40);
              return {
                ...n,
                activation: Math.min(1.0, Math.max(n.activation + 0.25, 0.8)),
                resolvedDetail: detail,
              };
            }
            return n;
          })
        );

        // Turn off pulse after 2 seconds
        setTimeout(() => {
          setFiringNodeIds(new Set());
        }, 2200);
      }

      // Append assistant message
      const assistantMessage: NeuralSurveyChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: res.reply,
        timestamp: Date.now(),
        suggestions: res.quick_replies || [],
        mixedMedia: res.mixedMedia || {
          diagram: {
            title: perspective === 'business' ? 'Customer Journey & Value Stream' : 'Active Service Topology Calibration',
            description: perspective === 'business' ? 'Inferred business value loop and launch stages' : 'Inferred microservices and boundary layers',
            nodes: perspective === 'business'
              ? [
                  { id: 'client', label: 'User Persona', type: 'client', tech: 'Acquisition & Onboarding' },
                  { id: 'gateway', label: 'Core Value', type: 'gateway', tech: 'Day-1 Feature Delivery' },
                  { id: 'service', label: 'Monetization', type: 'service', tech: 'Subscriptions & Billing' },
                  { id: 'db', label: 'Retention', type: 'storage', tech: 'Customer Trust & Growth' },
                ]
              : [
                  { id: 'client', label: 'Web Shell', type: 'client', tech: 'React / Next.js' },
                  { id: 'gateway', label: 'API Mesh', type: 'gateway', tech: 'Edge Proxy' },
                  { id: 'service', label: 'Core Agents', type: 'service', tech: 'FastAPI / Node' },
                  { id: 'db', label: 'Persistence', type: 'storage', tech: 'PostgreSQL' },
                ],
            edges: [
              { from: 'client', to: 'gateway', label: 'HTTPS' },
              { from: 'gateway', to: 'service', label: 'gRPC' },
              { from: 'service', to: 'db', label: 'SQL Pool' },
            ],
          },
        },
      };
      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);
      onUpdateChatMessages?.(finalMessages);
    } catch (_err: unknown) {
      // Fallback friendly assistant reply with synchronized suggestions
      const isBiz = perspective === 'business';
      const fallbackSuggestions = isBiz
        ? [
            'Fast 4-week MVP launch sprint',
            'Standard 8-week launch cadence (4 sprints)',
            'Phased milestone rollout (beta in 3 weeks)',
            'Flexible milestone-driven timeline',
          ]
        : [
            'PostgreSQL + Prisma / Drizzle ORM',
            'Microservices with Redis event broker',
            'OAuth2.0 + Role-Based Access Control',
            'Docker container deployment on Cloud Run',
          ];
      setQuickReplies(fallbackSuggestions);

      const fallbackMsg: NeuralSurveyChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: isBiz
          ? `Got it! I have adjusted our product launch blueprint with: "${text}". From a business perspective, what are your target launch timelines and release cadence?`
          : `Got it! I have adjusted our architecture parameters with: "${text}". What are your target delivery timelines and sprint cadence?`,
        timestamp: Date.now(),
        suggestions: fallbackSuggestions,
        mixedMedia: {
          storyCard: {
            id: 'US-REQ-CALIBRATE',
            title: `Calibrate architecture constraints: ${text.slice(0, 45)}`,
            epic: 'Technical Architecture Discovery',
            points: 3,
            priority: 'high',
            investScore: 95,
            acceptanceCriteria: [
              'System limits defined according to user requirements',
              'Database partition strategy aligns with target traffic',
              'Automated validation checks execute during synthesis',
            ],
          },
        },
      };
      const finalFallback = [...newMessages, fallbackMsg];
      setMessages(finalFallback);
      onUpdateChatMessages?.(finalFallback);
      setConvergenceScore((c) => Math.min(95, c + 15));
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleQuickReplyClick = (replyText: string) => {
    handleSendMessage(replyText);
  };

  const handleVoiceTranscript = (transcript: string) => {
    if (transcript && transcript.trim()) {
      handleSendMessage(transcript.trim());
    }
  };

  // Chat History Utility Actions
  const handleCopyTranscript = () => {
    const text = exportChatTranscriptAsText(messages, prompt);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedFullTranscript(true);
      setTimeout(() => setCopiedFullTranscript(false), 2500);
    }
  };

  const handleCopySingleMessage = (msgId: string, content: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(content);
      setCopiedMessageId(msgId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }
  };

  const handleDownloadTranscript = () => {
    const text = exportChatTranscriptAsText(messages, prompt);
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `requirement-chat-history-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = () => {
    clearSurveyChatHistory(prompt);
    const resetInitial: NeuralSurveyChatMessage = {
      id: `msg-init-${Date.now()}`,
      role: 'assistant',
      content: `Conversation reset. Neural specification mesh re-initialized for "${prompt.slice(0, 70)}...". What architectural requirements or technology constraints should we prioritize?`,
      timestamp: Date.now(),
    };
    setMessages([resetInitial]);
    onUpdateChatMessages?.([resetInitial]);
    setShowClearConfirmModal(false);
    setShowHistoryDrawer(false);
  };

  const handleSaveSnapshot = () => {
    const title = snapshotTitleInput.trim() || `Calibration Snapshot ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    saveSurveyChatHistory(prompt, messages, undefined, title);
    const updated = getAllSurveyChatSessions(prompt);
    setSavedSessions(updated);
    setShowSaveSnapshotModal(false);
    setSnapshotTitleInput('');
  };

  const handleLoadSession = (session: SurveyChatSession) => {
    setMessages(session.messages);
    onUpdateChatMessages?.(session.messages);
    setShowHistoryDrawer(false);
  };

  const handleDeleteSession = (sessionId: string) => {
    deleteSurveyChatSession(sessionId);
    const updated = getAllSurveyChatSessions(prompt);
    setSavedSessions(updated);
  };

  // Filtered messages for History View
  const filteredHistoryMessages = useMemo(() => {
    return messages.filter((m) => {
      if (historyRoleFilter === 'user' && m.role !== 'user') return false;
      if (historyRoleFilter === 'assistant' && m.role !== 'assistant') return false;
      if (historyRoleFilter === 'media' && !m.mixedMedia) return false;
      if (historySearchQuery.trim()) {
        const q = historySearchQuery.toLowerCase();
        return m.content.toLowerCase().includes(q);
      }
      return true;
    });
  }, [messages, historyRoleFilter, historySearchQuery]);

  const userMessageCount = useMemo(() => messages.filter((m) => m.role === 'user').length, [messages]);
  const assistantMessageCount = useMemo(() => messages.filter((m) => m.role === 'assistant').length, [messages]);

  // Node position calculations for SVG Canvas
  const svgWidth = 640;
  const svgHeight = 280;
  const layerX = [60, 220, 400, 570];

  const getNodeCoords = (node: NeuralNode) => {
    const x = layerX[node.layer];
    const totalInLayer = nodes.filter((n) => n.layer === node.layer).length;
    const spacing = svgHeight / (totalInLayer + 1);
    const y = spacing * (node.index + 1);
    return { x, y };
  };

  const getNodeColor = (node: NeuralNode) => {
    if (node.activation >= 0.8) return '#10B981'; // Emerald
    if (node.activation >= 0.5) return '#06B6D4'; // Cyan
    if (node.activation >= 0.3) return '#F59E0B'; // Amber
    return '#64748B'; // Slate
  };

  return (
    <div className="flex flex-col h-full overflow-hidden font-sans rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm">
      {/* Top Neural Telemetry Bar */}
      <div className="px-4 py-2.5 bg-neutral-50/90 dark:bg-neutral-900/90 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Brain className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-900 dark:text-white">
              Neural Requirements Graph
            </span>
            <span className="px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-700 dark:text-teal-300 text-[10px] font-medium border border-teal-500/20">
              Live
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
            <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Convergence</span>
            <div className="w-20 h-1.5 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 transition-all duration-500"
                style={{ width: `${convergenceScore}%` }}
              />
            </div>
            <span className="font-semibold text-teal-700 dark:text-teal-400 font-mono text-[11px]">{convergenceScore}%</span>
          </div>

          <button
            type="button"
            onClick={() => setIsGraphExpanded(!isGraphExpanded)}
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            title={isGraphExpanded ? 'Compact Topology Graph' : 'Expand Topology Graph'}
          >
            {isGraphExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Container: Split View between Neural Topology Visualizer & Interactive Chat Stream */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left / Top: Interactive Neural Network Canvas */}
        <div
          className={`border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 bg-[#0B1120] flex flex-col transition-all duration-300 ${
            isGraphExpanded ? 'h-72 md:h-auto md:w-3/5' : 'h-56 md:h-auto md:w-1/2'
          }`}
        >
          {/* Visualizer Header */}
          <div className="px-4 py-2 bg-[#0B1120] border-b border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-300">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-teal-400" />
              <span className="font-medium text-neutral-200">
                Network Topology
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-neutral-400 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Calibrated
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Active
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" /> Pending
              </span>
            </div>
          </div>

          {/* SVG Neural Graph */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center p-2">
            <svg
              className="w-full h-full max-h-[360px]"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="synapse-grad-active" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="synapse-grad-idle" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#334155" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#1E293B" stopOpacity="0.15" />
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Layer Title Headers */}
              <text x={layerX[0]} y={18} fill="#64748B" fontSize="9" fontWeight="600" textAnchor="middle" letterSpacing="0.05em">
                SENSORY
              </text>
              <text x={layerX[1]} y={18} fill="#64748B" fontSize="9" fontWeight="600" textAnchor="middle" letterSpacing="0.05em">
                CORE DOMAIN
              </text>
              <text x={layerX[2]} y={18} fill="#64748B" fontSize="9" fontWeight="600" textAnchor="middle" letterSpacing="0.05em">
                RELIABILITY
              </text>
              <text x={layerX[3]} y={18} fill="#64748B" fontSize="9" fontWeight="600" textAnchor="middle" letterSpacing="0.05em">
                ARTIFACTS
              </text>

              {/* Synapses (Connections) */}
              {synapses.map((syn, idx) => {
                const fromNode = nodes.find((n) => n.id === syn.fromId);
                const toNode = nodes.find((n) => n.id === syn.toId);
                if (!fromNode || !toNode) return null;

                const fromCoords = getNodeCoords(fromNode);
                const toCoords = getNodeCoords(toNode);

                return (
                  <g key={`syn-${idx}`}>
                    <path
                      d={`M ${fromCoords.x} ${fromCoords.y} C ${(fromCoords.x + toCoords.x) / 2} ${fromCoords.y}, ${(fromCoords.x + toCoords.x) / 2} ${toCoords.y}, ${toCoords.x} ${toCoords.y}`}
                      fill="none"
                      stroke={syn.active ? 'url(#synapse-grad-active)' : 'url(#synapse-grad-idle)'}
                      strokeWidth={syn.active ? Math.max(1.5, syn.weight * 2.5) : 0.8}
                    />
                    {syn.active && (
                      <circle r="2" fill="#2DD4BF">
                        <animateMotion
                          path={`M ${fromCoords.x} ${fromCoords.y} C ${(fromCoords.x + toCoords.x) / 2} ${fromCoords.y}, ${(fromCoords.x + toCoords.x) / 2} ${toCoords.y}, ${toCoords.x} ${toCoords.y}`}
                          dur="1.4s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map((node) => {
                const { x, y } = getNodeCoords(node);
                const isFiring = firingNodeIds.has(node.id);
                const isSelected = selectedNode?.id === node.id;
                const nodeColor = getNodeColor(node);

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer transition-transform duration-150 hover:scale-105"
                    onClick={() => setSelectedNode(node)}
                  >
                    {/* Pulsing halo if firing */}
                    {isFiring && (
                      <circle
                        cx={x}
                        cy={y}
                        r="14"
                        fill="none"
                        stroke="#2DD4BF"
                        strokeWidth="1.5"
                        className="animate-ping"
                      />
                    )}

                    {/* Outer border circle */}
                    <circle
                      cx={x}
                      cy={y}
                      r="10"
                      fill="#0F172A"
                      stroke={isSelected ? '#2DD4BF' : nodeColor}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      filter={isFiring ? 'url(#glow)' : undefined}
                    />

                    {/* Activation Fill Core */}
                    <circle
                      cx={x}
                      cy={y}
                      r={node.activation * 7}
                      fill={nodeColor}
                      opacity={0.9}
                    />

                    {/* Node Text Label */}
                    <text
                      x={x}
                      y={y + 17}
                      fill={isSelected ? '#2DD4BF' : '#CBD5E1'}
                      fontSize="8.5"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {node.name}
                    </text>

                    {/* Percentage activation badge */}
                    <text
                      x={x}
                      y={y + 26}
                      fill={nodeColor}
                      fontSize="7"
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {Math.round(node.activation * 100)}%
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Node Inspector Drawer */}
          {selectedNode && (
            <div className="p-3 bg-[#080E1A] border-t border-neutral-800 text-xs text-neutral-300 flex items-start justify-between gap-3 shrink-0">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-teal-300 text-[9px] font-mono font-medium border border-neutral-700">
                    {selectedNode.id}
                  </span>
                  <span className="font-semibold text-white">{selectedNode.name}</span>
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      color: getNodeColor(selectedNode),
                      backgroundColor: `${getNodeColor(selectedNode)}20`,
                    }}
                  >
                    {Math.round(selectedNode.activation * 100)}% Calibrated
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 font-sans">{selectedNode.description}</p>
                {selectedNode.resolvedDetail ? (
                  <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5 truncate font-sans">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Inferred: {selectedNode.resolvedDetail}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-neutral-400 italic flex items-center gap-1.5 font-sans">
                    <Info className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                    <span>Discuss details in chat to calibrate this node.</span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="text-neutral-400 hover:text-white text-xs px-2 py-1 rounded border border-neutral-800 hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Right / Bottom: Neural Chatbot Stream */}
        <div className="flex-1 flex flex-col min-h-0 bg-neutral-50/40 dark:bg-neutral-900/40 relative">
          {/* Chat Stream Header with Clean History Controls */}
          <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span className="font-semibold text-neutral-900 dark:text-white">
                Conversation Stream
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-mono font-medium border border-neutral-200 dark:border-neutral-700">
                {messages.length} msgs
              </span>
              {perspective === 'business' ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                  <span>💼</span>
                  <span className="hidden xs:inline">Business</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30 text-[10px] font-bold flex items-center gap-1">
                  <span>⚙️</span>
                  <span className="hidden xs:inline">Technical</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Chat History Drawer Toggle Button */}
              <button
                id="neural-chat-history-btn"
                type="button"
                onClick={() => setShowHistoryDrawer((prev) => !prev)}
                className={`h-7 px-2.5 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  showHistoryDrawer
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-transparent shadow-xs'
                    : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50'
                }`}
                title="View full requirement conversation history and snapshots"
              >
                <History className="w-3.5 h-3.5" />
                <span>History</span>
              </button>

              {/* Quick Copy Transcript Button */}
              <button
                type="button"
                onClick={handleCopyTranscript}
                className="h-7 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 flex items-center gap-1 cursor-pointer"
                title="Copy full chat transcript to clipboard"
              >
                {copiedFullTranscript ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-neutral-500" />
                    <span className="hidden sm:inline">Copy</span>
                  </>
                )}
              </button>

              {/* Save Snapshot Button */}
              <button
                type="button"
                onClick={() => setShowSaveSnapshotModal(true)}
                className="h-7 w-7 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Save current chat as a named snapshot"
              >
                <Bookmark className="w-3.5 h-3.5" />
              </button>

              {/* Clear / Reset Chat Button */}
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(true)}
                className="h-7 w-7 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                title="Reset conversation and start fresh calibration"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Active Perspective Awareness Ribbon */}
          <div
            className={`px-4 py-2 border-b text-xs flex flex-wrap items-center justify-between gap-2 shrink-0 transition-colors ${
              perspective === 'business'
                ? 'bg-amber-500/10 dark:bg-amber-950/30 border-amber-500/20 text-amber-950 dark:text-amber-200'
                : 'bg-blue-500/10 dark:bg-blue-950/30 border-blue-500/20 text-blue-950 dark:text-blue-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">{perspective === 'business' ? '💼' : '⚙️'}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold uppercase tracking-wider text-[11px]">
                    {perspective === 'business' ? 'Business Perspective' : 'Technical Perspective'}
                  </span>
                  <span className="text-[10px] opacity-75 font-medium">
                    ({perspective === 'business' ? 'Plain English · ROI & User Outcomes' : 'Architecture Specs · Schemas & APIs'})
                  </span>
                </div>
                <p className="text-[11px] opacity-80 hidden sm:block truncate">
                  {perspective === 'business'
                    ? 'AI inquiries focus on user personas, monetization, launch speed, and business viability.'
                    : 'AI inquiries focus on technical stack, databases, auth protocols, and system scaling.'}
                </p>
              </div>
            </div>

            {onPerspectiveChange && (
              <button
                type="button"
                onClick={() => onPerspectiveChange(perspective === 'business' ? 'technical' : 'business')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-2xs shrink-0 active:scale-95 ${
                  perspective === 'business'
                    ? 'bg-white dark:bg-neutral-800 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/40 text-amber-950 dark:text-amber-200'
                    : 'bg-white dark:bg-neutral-800 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-blue-950 dark:text-blue-200'
                }`}
                title={`Click to switch to ${perspective === 'business' ? 'Technical' : 'Business'} mode`}
              >
                Switch to {perspective === 'business' ? '⚙️ Technical View' : '💼 Business View'}
              </button>
            )}
          </div>

          {/* Messages Scroll Area */}
          <div
            ref={chatScrollContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50/50 dark:bg-neutral-950/20"
          >
            {messages.map((msg, idx) => {
              const isAssistant = msg.role === 'assistant';
              const isCopied = copiedMessageId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[78%] p-3.5 rounded-2xl text-xs leading-relaxed transition-all ${
                      isAssistant
                        ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-200/90 dark:border-neutral-700/80 shadow-xs'
                        : 'bg-neutral-900 text-white dark:bg-teal-600 dark:text-white rounded-tr-xs shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5 pb-1.5 border-b border-black/5 dark:border-white/10">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[10px] uppercase flex items-center gap-1.5">
                          {isAssistant ? (
                            <>
                              <Brain className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                              <span className="text-neutral-700 dark:text-neutral-200">AI Architect</span>
                            </>
                          ) : (
                            <>
                              <Users className="w-3.5 h-3.5 text-neutral-400 dark:text-teal-200" />
                              <span className="text-neutral-200">You</span>
                            </>
                          )}
                        </span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 font-mono text-neutral-500 dark:text-neutral-300">
                          #{idx + 1}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] opacity-60 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5 inline" />
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopySingleMessage(msg.id, msg.content)}
                          className="text-[9px] p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                          title="Copy this message"
                        >
                          {isCopied ? (
                            <CheckCheck className="w-3 h-3 text-emerald-500 stroke-[2.5]" />
                          ) : (
                            <Copy className="w-3 h-3 opacity-50 hover:opacity-100" />
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
                      {msg.content}
                    </p>

                    {/* Mixed Media Card Render */}
                    {isAssistant && msg.mixedMedia && (
                      <div className="mt-3 text-neutral-900 dark:text-neutral-100">
                        <MixedMediaCard media={msg.mixedMedia} />
                      </div>
                    )}

                    {/* Contextual Suggestion Chips directly under Assistant Message */}
                    {isAssistant && (msg.suggestions && msg.suggestions.length > 0 ? msg.suggestions : (idx === messages.length - 1 ? quickReplies : [])).length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-neutral-200/60 dark:border-neutral-700/60">
                        <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider">
                          <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                          <span>Suggested Answers:</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(msg.suggestions && msg.suggestions.length > 0 ? msg.suggestions : (idx === messages.length - 1 ? quickReplies : [])).map((suggestion, sIdx) => (
                            <button
                              key={`${suggestion}-${sIdx}`}
                              type="button"
                              onClick={() => handleQuickReplyClick(suggestion)}
                              disabled={isAiThinking}
                              className="px-2.5 py-1 rounded-lg border border-teal-200 dark:border-teal-800/80 bg-teal-50/90 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-900 dark:text-teal-200 text-xs font-semibold transition-all text-left cursor-pointer active:scale-95 disabled:opacity-50 shadow-2xs"
                              title={`Answer: "${suggestion}"`}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isAiThinking && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center gap-2 text-xs shadow-xs">
                  <Cpu className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 animate-spin" />
                  <span className="font-medium text-neutral-600 dark:text-neutral-400 text-xs">
                    Analyzing constraints & mapping topology...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ================= CHAT HISTORY SLIDE-OVER DRAWER ================= */}
          {showHistoryDrawer && (
            <div
              id="survey-chat-history-drawer"
              className="absolute inset-0 z-30 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md flex flex-col font-sans animate-in fade-in duration-150"
            >
              {/* Drawer Top Header */}
              <div className="px-4 py-2.5 bg-neutral-50/90 dark:bg-neutral-900/90 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0 text-teal-600 dark:text-teal-400">
                    <History className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <h3 className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Conversation History
                    </h3>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                      {messages.length} messages &bull; {userMessageCount} user / {assistantMessageCount} AI
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyTranscript}
                    className="h-7 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedFullTranscript ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadTranscript}
                    className="h-7 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 flex items-center gap-1 cursor-pointer"
                    title="Download transcript as Markdown file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Export</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowHistoryDrawer(false)}
                    className="h-7 w-7 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                    title="Close History Drawer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Sub-Tabs: Live Transcript vs Saved Sessions */}
              <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2 shrink-0 text-xs bg-white dark:bg-neutral-900">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveHistoryTab('transcript')}
                    className={`px-3 py-1 rounded-lg font-medium text-xs transition-all cursor-pointer ${
                      activeHistoryTab === 'transcript'
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
                        : 'border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    Transcript ({filteredHistoryMessages.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveHistoryTab('sessions')}
                    className={`px-3 py-1 rounded-lg font-medium text-xs transition-all cursor-pointer ${
                      activeHistoryTab === 'sessions'
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
                        : 'border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    Saved ({savedSessions.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSaveSnapshotModal(true)}
                  className="h-7 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 flex items-center gap-1 cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>Save Snapshot</span>
                </button>
              </div>

              {/* Active Tab Content Area */}
              {activeHistoryTab === 'transcript' ? (
                <div className="flex-1 flex flex-col min-h-0 bg-transparent">
                  {/* Search and Role Filter Bar */}
                  <div className="p-3 border-b border-neutral-200/70 dark:border-neutral-800/70 bg-white/40 dark:bg-neutral-900/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        placeholder="Search conversation history..."
                        className="w-full pl-9 pr-7 py-1.5 text-xs rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                      />
                      {historySearchQuery && (
                        <button
                          type="button"
                          onClick={() => setHistorySearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-800 dark:hover:text-white text-xs font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[10px] shrink-0">
                      <span className="font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mr-1">Filter:</span>
                      {(['all', 'user', 'assistant', 'media'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setHistoryRoleFilter(mode)}
                          className={`px-2.5 py-1 rounded-lg uppercase font-bold transition-all cursor-pointer ${
                            historyRoleFilter === mode
                              ? 'bg-teal-600 text-white shadow-xs'
                              : 'glass-button-secondary text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {mode === 'all'
                            ? 'All'
                            : mode === 'user'
                            ? 'User'
                            : mode === 'assistant'
                            ? 'Architect'
                            : 'Deliverables'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Messages List */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {filteredHistoryMessages.length === 0 ? (
                      <div className="p-8 text-center text-neutral-500 dark:text-neutral-400 space-y-2">
                        <FileText className="w-8 h-8 mx-auto text-neutral-400" />
                        <p className="font-bold text-xs">No matching messages found.</p>
                        <p className="text-[11px] text-neutral-400">
                          Try searching for a different keyword or reset role filters.
                        </p>
                      </div>
                    ) : (
                      filteredHistoryMessages.map((m, idx) => {
                        const isAssistant = m.role === 'assistant';
                        const isCopied = copiedMessageId === m.id;

                        return (
                          <div
                            key={m.id}
                            className="p-4 rounded-2xl glass-card bg-white/70 dark:bg-neutral-800/70 border border-neutral-200/80 dark:border-neutral-700/80 space-y-2 transition-all"
                          >
                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-neutral-200/60 dark:border-neutral-700/60 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[9px] font-bold uppercase font-mono">
                                  Turn #{idx + 1}
                                </span>
                                <span className="font-bold uppercase flex items-center gap-1.5 text-neutral-900 dark:text-white">
                                  {isAssistant ? (
                                    <>
                                      <Brain className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                      <span>Neural PM Architect</span>
                                    </>
                                  ) : (
                                    <>
                                      <Users className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                      <span className="text-teal-700 dark:text-teal-300">User Input</span>
                                    </>
                                  )}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                  {new Date(m.timestamp).toLocaleString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopySingleMessage(m.id, m.content)}
                                  className="px-2.5 py-1 rounded-lg glass-button-secondary text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  {isCopied ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                                      <span className="text-emerald-700 dark:text-emerald-400">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            <p className="font-sans text-xs text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap leading-relaxed">
                              {m.content}
                            </p>

                            {/* Mixed Media Preview Snippet in History */}
                            {m.mixedMedia && (
                              <div className="mt-2 pt-2 border-t border-neutral-200/70 dark:border-neutral-700/70 rounded-xl bg-teal-500/5 p-3 border border-teal-500/20 text-xs space-y-1">
                                <div className="flex items-center gap-1.5 font-bold text-[11px] text-teal-900 dark:text-teal-200 uppercase">
                                  <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                  <span>Attached Calibration Deliverable</span>
                                </div>
                                {m.mixedMedia.diagram && (
                                  <p className="text-[11px] text-neutral-700 dark:text-neutral-300">
                                    📐 <strong>Topology Diagram:</strong> {m.mixedMedia.diagram.title} ({m.mixedMedia.diagram.nodes.length} nodes)
                                  </p>
                                )}
                                {m.mixedMedia.storyCard && (
                                  <p className="text-[11px] text-neutral-700 dark:text-neutral-300">
                                    📋 <strong>INVEST Story:</strong> [{m.mixedMedia.storyCard.id}] {m.mixedMedia.storyCard.title} ({m.mixedMedia.storyCard.points} pts)
                                  </p>
                                )}
                                {m.mixedMedia.audioBriefing && (
                                  <p className="text-[11px] text-neutral-700 dark:text-neutral-300">
                                    🎙️ <strong>Audio Brief:</strong> {m.mixedMedia.audioBriefing.title} ({m.mixedMedia.audioBriefing.duration})
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* Saved Sessions View */
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-transparent">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-200/80 dark:border-neutral-800/80">
                    <div>
                      <h4 className="font-bold text-xs uppercase text-neutral-900 dark:text-white">
                        Archived Discovery Sessions
                      </h4>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Saved dialogue transcripts and checkpoints for this prompt.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowSaveSnapshotModal(true)}
                      className="px-3 py-1.5 rounded-xl glass-button-primary text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Save Current Chat</span>
                    </button>
                  </div>

                  {savedSessions.length === 0 ? (
                    <div className="p-8 rounded-2xl glass-card text-center space-y-2">
                      <Bookmark className="w-8 h-8 mx-auto text-neutral-400" />
                      <p className="font-bold text-xs uppercase text-neutral-800 dark:text-neutral-200">No Saved Sessions Yet</p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                        Click &ldquo;Save Current Chat&rdquo; above to snapshot your ongoing architectural conversation for future reference or comparison.
                      </p>
                    </div>
                  ) : (
                    savedSessions.map((s) => (
                      <div
                        key={s.id}
                        className="p-4 rounded-2xl glass-card bg-white/70 dark:bg-neutral-800/70 border border-neutral-200/80 dark:border-neutral-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-neutral-900 dark:text-white uppercase truncate">
                              {s.title || s.prompt.slice(0, 40)}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-[9px] font-bold font-mono">
                              {s.messageCount || s.messages.length} messages
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate font-sans">
                            {s.summarySnippet || 'Conversation snapshot'}
                          </p>
                          <p className="text-[9px] text-neutral-400 font-mono">
                            Saved {formatDraftTimestamp(s.updatedAt)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleLoadSession(s)}
                            className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                            title="Restore this session into active chat"
                          >
                            <RotateCcw className="w-3 h-3 stroke-[3]" />
                            <span>Load Session</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteSession(s.id)}
                            className="p-1.5 rounded-xl glass-button-secondary text-neutral-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Delete this saved session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Drawer Bottom Bar */}
              <div className="p-3.5 glass-card border-t border-neutral-200/80 dark:border-neutral-800/80 flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowClearConfirmModal(true)}
                  className="px-3.5 py-1.5 rounded-xl glass-button-secondary text-rose-600 dark:text-rose-400 text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Chat</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowHistoryDrawer(false)}
                  className="px-4 py-2 rounded-xl glass-button-primary text-xs font-bold uppercase cursor-pointer"
                >
                  Back to Live Chat
                </button>
              </div>
            </div>
          )}

          {/* ================= CLEAR CONFIRMATION MODAL ================= */}
          {showClearConfirmModal && (
            <div className="absolute inset-0 z-40 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="w-full max-w-sm rounded-2xl glass-card bg-white/95 dark:bg-neutral-900/95 border border-neutral-200/80 dark:border-neutral-700/80 p-5 shadow-xl space-y-3 font-sans">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-xs uppercase tracking-wider">
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset Conversation History?</span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 font-sans leading-relaxed">
                  This will reset the active chat transcript for this initiative. Any calibrated parameters already recorded in the matrix will be retained.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowClearConfirmModal(false)}
                    className="px-3.5 py-1.5 rounded-xl glass-button-secondary text-neutral-700 dark:text-neutral-300 font-bold text-xs uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase cursor-pointer shadow-xs"
                  >
                    Yes, Reset Chat
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= SAVE SNAPSHOT MODAL ================= */}
          {showSaveSnapshotModal && (
            <div className="absolute inset-0 z-40 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="w-full max-w-sm rounded-2xl glass-card bg-white/95 dark:bg-neutral-900/95 border border-neutral-200/80 dark:border-neutral-700/80 p-5 shadow-xl space-y-3 font-sans">
                <div className="flex items-center gap-2 text-neutral-900 dark:text-white font-bold text-xs uppercase tracking-wider">
                  <Bookmark className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>Save Chat History Snapshot</span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 font-sans leading-relaxed">
                  Give this conversation snapshot a label to easily retrieve it later:
                </p>
                <input
                  type="text"
                  value={snapshotTitleInput}
                  onChange={(e) => setSnapshotTitleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveSnapshot()}
                  placeholder="e.g. Microservices vs Monolith Discussion"
                  className="w-full rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 p-2.5 text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowSaveSnapshotModal(false)}
                    className="px-3.5 py-1.5 rounded-xl glass-button-secondary text-neutral-700 dark:text-neutral-300 font-bold text-xs uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSnapshot}
                    className="px-4 py-1.5 rounded-xl glass-button-primary font-bold text-xs uppercase cursor-pointer"
                  >
                    Save Snapshot
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Context-Aware Suggested Answers Bar (Strictly based on chat questions) */}
          {quickReplies.length > 0 && (
            <div className="px-3.5 py-2 border-t border-neutral-200 dark:border-neutral-800 bg-teal-50/50 dark:bg-teal-950/20 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
              <span className="text-[10px] font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>Suggested Answers:</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {quickReplies.map((reply, i) => (
                  <button
                    key={`${reply}-${i}`}
                    type="button"
                    onClick={() => handleQuickReplyClick(reply)}
                    disabled={isAiThinking}
                    className="px-2.5 py-1 rounded-lg border border-teal-300/80 dark:border-teal-700/70 bg-white dark:bg-neutral-800 text-teal-900 dark:text-teal-200 text-xs font-semibold hover:bg-teal-50 dark:hover:bg-teal-900/50 hover:border-teal-400 cursor-pointer disabled:opacity-50 transition-all shadow-2xs whitespace-nowrap active:scale-95"
                    title={`Click to answer: "${reply}"`}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Artifact Deck Ribbon (Explicit analysis triggers) */}
          <div className="px-3.5 py-1.5 border-t border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/70 dark:bg-neutral-900/40 flex items-center justify-between text-[11px] shrink-0">
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium">
              Artifact Triggers:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleSendMessage('Give me an audio briefing summarizing the architecture so far.')}
                disabled={isAiThinking}
                className="px-2 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-teal-600 dark:hover:text-teal-400 text-[10px] font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                Audio Brief
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage('Map the microservices and database topology for this architecture.')}
                disabled={isAiThinking}
                className="px-2 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-teal-600 dark:hover:text-teal-400 text-[10px] font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                System Topology
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage('Draft an INVEST user story with acceptance criteria.')}
                disabled={isAiThinking}
                className="px-2 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-teal-600 dark:hover:text-teal-400 text-[10px] font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                INVEST Story
              </button>
            </div>
          </div>

          {/* Chat Input & Voice Trigger */}
          <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Clarify architectural scope, tech stack, constraints..."
              disabled={isAiThinking}
              className="flex-1 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 disabled:opacity-50 shadow-2xs"
            />

            <VoiceInputButton
              id="neural-voice-input-btn"
              currentValue={inputValue}
              onTextCaptured={(transcript) => handleVoiceTranscript(transcript)}
              variant="inline-sm"
            />

            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputValue.trim() || isAiThinking}
              className="h-8 px-3.5 rounded-xl bg-neutral-900 hover:bg-black dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold shadow-xs active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Action Footer with Direct Synthesis Trigger & Draft Controls */}
      <div className="px-4 py-2.5 bg-neutral-50/90 dark:bg-neutral-900/90 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
              Calibration State:
            </span>
            <span className="font-medium text-teal-700 dark:text-teal-300 bg-teal-500/10 px-2.5 py-0.5 rounded-md border border-teal-500/20 text-xs">
              {Object.keys(answers).length} Calibrated
            </span>
            <span className="text-[11px] text-neutral-400 font-mono hidden sm:inline">
              ({convergenceScore}% converged)
            </span>
          </div>

          {onSaveDraft && (
            <button
              id="neural-save-draft-btn"
              type="button"
              onClick={onSaveDraft}
              className={`h-7 px-3 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border ${
                isDraftSaved
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50'
              }`}
              title="Save current survey progress"
            >
              {isDraftSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Draft Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Save Draft</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onSwitchToSummary && (
            <button
              type="button"
              onClick={onSwitchToSummary}
              className="h-8 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 text-xs font-semibold flex items-center gap-1.5 text-neutral-800 dark:text-neutral-200 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Review Matrix</span>
            </button>
          )}

          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="h-8 px-4 rounded-xl bg-neutral-900 hover:bg-black dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold shadow-xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Zap className="w-3.5 h-3.5 animate-spin text-amber-300" />
                <span>Synthesizing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Synthesize Agile Board</span>
                <ArrowRight className="w-3 h-3 ml-0.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
