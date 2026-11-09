import { ClarificationQuestion } from './geminiPM';

export interface BranchRuleDefinition {
  id: string;
  parentQuestionId: string;
  category: string;
  branchBadge: string;
  branchReason: string;
  matchKeywords: string[];
  question: string;
  why_needed: string;
  options: string[];
  default_answer: string;
  placeholder: string;
  allow_multiple: boolean;
}

export const BRANCH_RULES: BranchRuleDefinition[] = [
  // 1. AI, LLM & RAG Architecture
  {
    id: 'branch_ai_rag_vector',
    parentQuestionId: 'tech_stack',
    category: 'Tech Stack: AI & Vector Architecture',
    branchBadge: 'AI & RAG ARCHITECTURE BRANCH',
    branchReason: 'Triggered by AI / LLM / RAG stack specification',
    matchKeywords: ['ai', 'llm', 'gemini', 'openai', 'rag', 'embeddings', 'anthropic', 'vector', 'machine learning', 'langchain', 'llama'],
    question: 'What vector database, embedding model, and RAG retrieval architecture will you deploy?',
    why_needed: 'AI applications fail if vector chunking, indexing strategy, and hybrid retrieval latency are not architected upfront.',
    options: [
      'pgvector (PostgreSQL extension with HNSW indexing)',
      'Pinecone Serverless (Managed vector index with metadata filtering)',
      'Qdrant Cloud (High-throughput Rust vector database)',
      'Chroma DB (Lightweight local embedded vector store)',
      'Hybrid BM25 Keyword + Dense Vector Search (Reciprocal Rank Fusion)',
      'Direct Context Window (No vector DB; Gemini 1M+ token context)',
    ],
    default_answer: 'pgvector (PostgreSQL extension with HNSW indexing)',
    placeholder: 'e.g. pgvector with text-embedding-3-small and hybrid search',
    allow_multiple: false,
  },

  // 2. Relational Database, ORM & Migrations
  {
    id: 'branch_sql_orm_migrations',
    parentQuestionId: 'tech_stack',
    category: 'Tech Stack: SQL & Migrations',
    branchBadge: 'RELATIONAL DB BRANCH',
    branchReason: 'Triggered by Relational Database (Postgres / MySQL) choice',
    matchKeywords: ['postgres', 'postgresql', 'mysql', 'sql', 'drizzle', 'prisma', 'relational'],
    question: 'Which ORM, query builder, and database migration pipeline will you use?',
    why_needed: 'Ensures generated database tasks and schema contracts align with your migration CI/CD tooling.',
    options: [
      'Drizzle ORM with TypeScript automated schema migrations',
      'Prisma ORM with schema-first modeling & Prisma Studio',
      'TypeORM / Sequelize with declarative Active Record entities',
      'Kysely / Knex.js type-safe SQL query builder',
      'Raw SQL migrations with Flyway or Goose',
    ],
    default_answer: 'Drizzle ORM with TypeScript automated schema migrations',
    placeholder: 'e.g. Drizzle ORM with pg-node connection pooling',
    allow_multiple: false,
  },

  // 3. NoSQL & Document Schemas
  {
    id: 'branch_nosql_validation',
    parentQuestionId: 'tech_stack',
    category: 'Tech Stack: NoSQL & Schemas',
    branchBadge: 'NOSQL ARCHITECTURE BRANCH',
    branchReason: 'Triggered by NoSQL / Document DB selection',
    matchKeywords: ['mongo', 'mongodb', 'dynamodb', 'cosmos', 'cassandra', 'couchbase', 'nosql'],
    question: 'How will document schemas be validated and partitioned for high-concurrency throughput?',
    why_needed: 'NoSQL architectures require strict runtime validation (Zod/Mongoose) and explicit partition key design.',
    options: [
      'Strict JSON schema validation via Zod & Mongoose middleware',
      'DynamoDB Single-Table Design with composite partition keys & GSI',
      'Time-series bucketed sharding by tenant_id and timestamp',
      'Document-level optimistic concurrency with version tags (_v)',
    ],
    default_answer: 'Strict JSON schema validation via Zod & Mongoose middleware',
    placeholder: 'e.g. Zod runtime validation with Mongoose indexes',
    allow_multiple: false,
  },

  // 4. Mobile & Cross-Platform Strategy
  {
    id: 'branch_mobile_sync',
    parentQuestionId: 'tech_stack',
    category: 'Tech Stack: Mobile & Device Strategy',
    branchBadge: 'MOBILE RUNTIME BRANCH',
    branchReason: 'Triggered by Mobile runtime (React Native / Flutter / iOS / Android) selection',
    matchKeywords: ['react native', 'flutter', 'mobile', 'ios', 'android', 'expo', 'swift', 'kotlin'],
    question: 'What is your mobile hardware integration and offline sync strategy?',
    why_needed: 'Mobile user stories require concrete hardware permission handling (camera, biometrics, notifications) and offline state reconciliation.',
    options: [
      'Expo managed workflow with offline SQLite persistence & background sync',
      'React Native CLI with native push notifications (APNs / FCM)',
      'Flutter with WatermelonDB local reactive sync',
      'Progressive Web App (PWA) with Service Workers & IndexedDB',
    ],
    default_answer: 'Expo managed workflow with offline SQLite persistence & background sync',
    placeholder: 'e.g. Expo with WatermelonDB and biometrics login',
    allow_multiple: false,
  },

  // 5. Python & Async Execution
  {
    id: 'branch_python_concurrency',
    parentQuestionId: 'tech_stack',
    category: 'Tech Stack: Python Concurrency',
    branchBadge: 'PYTHON ENGINE BRANCH',
    branchReason: 'Triggered by Python / FastAPI backend selection',
    matchKeywords: ['python', 'fastapi', 'django', 'flask'],
    question: 'Which asynchronous execution and background worker framework will handle compute tasks?',
    why_needed: 'Prevents blocking the Python event loop on IO-heavy or compute-heavy operations.',
    options: [
      'Celery with Redis Broker & flower monitoring',
      'FastAPI async background tasks for lightweight IO operations',
      'Temporal.io durable execution workflows',
      'RQ (Redis Queue) with exponential backoff retries',
    ],
    default_answer: 'Celery with Redis Broker & flower monitoring',
    placeholder: 'e.g. Celery workers on Redis with Flower dashboard',
    allow_multiple: false,
  },

  // 6. Microservices & Event Streaming
  {
    id: 'branch_event_streaming',
    parentQuestionId: 'tech_stack',
    category: 'Tech Stack: Event Streaming',
    branchBadge: 'EVENT STREAMING BRANCH',
    branchReason: 'Triggered by Microservices / Event-Driven architecture selection',
    matchKeywords: ['microservice', 'kubernetes', 'k8s', 'kafka', 'rabbitmq', 'event-driven', 'grpc'],
    question: 'What messaging protocol and schema registry will govern inter-service communication?',
    why_needed: 'Distributed systems require explicit message persistence guarantees, dead-letter queues, and schema evolution contracts.',
    options: [
      'Apache Kafka event stream with Avro schema registry',
      'RabbitMQ topic exchanges with dead-letter queue (DLQ)',
      'gRPC with Protobuf service contracts & code generation',
      'NATS JetStream for ultra-low-latency edge pub/sub',
    ],
    default_answer: 'Apache Kafka event stream with Avro schema registry',
    placeholder: 'e.g. Apache Kafka with Confluent Schema Registry',
    allow_multiple: false,
  },

  // 7. HIPAA Healthcare Compliance
  {
    id: 'branch_hipaa_security',
    parentQuestionId: 'compliance_security',
    category: 'Compliance: HIPAA & ePHI Controls',
    branchBadge: 'HIPAA PROTOCOL BRANCH',
    branchReason: 'Triggered by HIPAA / Healthcare compliance selection',
    matchKeywords: ['hipaa', 'ephi', 'healthcare', 'patient', 'medical', 'clinical', 'ehr', 'fhir'],
    question: 'Which ePHI encryption, immutable audit logging, and BAA safeguards must be architected?',
    why_needed: 'HIPAA mandates cryptographic protection of patient data at rest and audit retention for 7 years.',
    options: [
      'Field-level AES-GCM-256 encryption with AWS KMS / Cloud KMS envelope keys',
      'Immutable append-only audit trail logging with 7-year retention',
      'Row-level tenant isolation with signed Business Associate Agreements (BAA)',
      'Automated de-identification & PII/ePHI redaction pipeline',
    ],
    default_answer: 'Field-level AES-GCM-256 encryption with AWS KMS / Cloud KMS envelope keys',
    placeholder: 'e.g. AES-256 envelope encryption and BAA signed datastores',
    allow_multiple: true,
  },

  // 8. SOC 2 Type II Compliance
  {
    id: 'branch_soc2_controls',
    parentQuestionId: 'compliance_security',
    category: 'Compliance: SOC 2 Controls',
    branchBadge: 'SOC 2 TYPE II BRANCH',
    branchReason: 'Triggered by SOC 2 compliance requirement',
    matchKeywords: ['soc 2', 'soc2', 'iso 27001', 'audit trail'],
    question: 'What continuous compliance automation and CI/CD security gates must be enforced?',
    why_needed: 'SOC 2 audits require automated evidence collection and strict commit protection policies.',
    options: [
      'Vanta / Drata continuous compliance automated collectors',
      'Branch protection with required signed commits & 2-person pull request approvals',
      'Automated SAST & container vulnerability scanning in CI/CD pipeline',
      'Quarterly access reviews with SCIM automated employee deprovisioning',
    ],
    default_answer: 'Vanta / Drata continuous compliance automated collectors',
    placeholder: 'e.g. Vanta continuous audit tracking with GitHub branch protections',
    allow_multiple: true,
  },

  // 9. Privacy (GDPR / CCPA)
  {
    id: 'branch_gdpr_privacy',
    parentQuestionId: 'compliance_security',
    category: 'Compliance: Privacy & Data Rights',
    branchBadge: 'GDPR PRIVACY BRANCH',
    branchReason: 'Triggered by GDPR / Privacy regulation selection',
    matchKeywords: ['gdpr', 'ccpa', 'privacy', 'consent', 'right to be forgotten'],
    question: 'What data erasure ("Right to be Forgotten") and consent logging mechanism is required?',
    why_needed: 'European privacy law requires cascading deletion across all relational stores, vector caches, and cold backups.',
    options: [
      'Automated cryptographic erasure (Crypto-Shredding) across all backups',
      'Self-service GDPR data export (JSON/CSV) and automated deletion request portal',
      'Granular cookie & marketing consent ledger with zero-tracking before opt-in',
      'Regional EU data residency with isolated cloud regions',
    ],
    default_answer: 'Automated cryptographic erasure (Crypto-Shredding) across all backups',
    placeholder: 'e.g. Crypto-shredding keys with self-serve export portal',
    allow_multiple: true,
  },

  // 10. Payment Processing & Stripe Monetization
  {
    id: 'branch_payments_billing',
    parentQuestionId: 'integrations',
    category: 'Integrations: Payments & Billing',
    branchBadge: 'PAYMENTS ARCHITECTURE BRANCH',
    branchReason: 'Triggered by Payment / Stripe integration',
    matchKeywords: ['stripe', 'payment', 'billing', 'lemon squeezy', 'paddle', 'subscription', 'metered'],
    question: 'What billing lifecycle, proration logic, and webhook idempotency strategy will you enforce?',
    why_needed: 'Payment webhooks can arrive out-of-order or duplicate; prevents double-billing and ensures automated recovery.',
    options: [
      'Usage-based metered billing with Stripe Meter events & invoice proration',
      'Tiered subscription with automated upgrade/downgrade and dunning grace period',
      'Stripe Connect multi-party marketplace with split payouts & escrow holds',
      'Webhook signature verification with Redis idempotency cache and DLQ',
    ],
    default_answer: 'Tiered subscription with automated upgrade/downgrade and dunning grace period',
    placeholder: 'e.g. Tiered Stripe subscriptions with webhook signature checks',
    allow_multiple: false,
  },

  // 11. Authentication & Enterprise SSO
  {
    id: 'branch_auth_sso',
    parentQuestionId: 'integrations',
    category: 'Integrations: Auth & Enterprise SSO',
    branchBadge: 'AUTHENTICATION BRANCH',
    branchReason: 'Triggered by Authentication / SSO integration',
    matchKeywords: ['clerk', 'auth0', 'supabase auth', 'firebase auth', 'oauth', 'sso', 'saml', 'okta', 'nextauth'],
    question: 'What identity protocols, multi-factor auth (MFA), and enterprise SSO providers must be supported?',
    why_needed: 'Enterprise deals require SAML/OIDC SSO and enforceable session rotation policies.',
    options: [
      'Enterprise SAML / OIDC Single Sign-On (Okta, Azure AD, Google Workspace)',
      'Mandatory TOTP & WebAuthn / Passkeys MFA for sensitive actions',
      'Granular Role-Based Access Control (RBAC) with hierarchical permissions',
      'Passwordless magic links with short-lived session tokens and refresh rotation',
    ],
    default_answer: 'Enterprise SAML / OIDC Single Sign-On (Okta, Azure AD, Google Workspace)',
    placeholder: 'e.g. SAML SSO via WorkOS/Clerk with WebAuthn MFA',
    allow_multiple: true,
  },

  // 12. Real-Time Collaboration & Streaming
  {
    id: 'branch_realtime_scaling',
    parentQuestionId: 'integrations',
    category: 'Integrations: Real-Time Engine',
    branchBadge: 'REAL-TIME PROTOCOL BRANCH',
    branchReason: 'Triggered by Real-Time / WebSocket integration',
    matchKeywords: ['websocket', 'realtime', 'real-time', 'socket.io', 'pusher', 'live', 'streaming'],
    question: 'Which real-time connection cluster and presence synchronization protocol will power live updates?',
    why_needed: 'Persistent WebSocket connections require horizontal scaling and automatic fallback under network drops.',
    options: [
      'Redis Pub/Sub with WebSocket clusters, heartbeat ping, and auto-reconnect',
      'Server-Sent Events (SSE) for unidirectional streaming updates & AI tokens',
      'Pusher / Ably managed channels with presence indicators & room multiplexing',
      'WebRTC data channels for ultra-low-latency peer-to-peer data sync',
    ],
    default_answer: 'Redis Pub/Sub with WebSocket clusters, heartbeat ping, and auto-reconnect',
    placeholder: 'e.g. Redis Pub/Sub WebSocket cluster with automatic reconnect',
    allow_multiple: false,
  },

  // 13. Multi-Tenant B2B SaaS Scope
  {
    id: 'branch_multitenant_isolation',
    parentQuestionId: 'mvp_scope',
    category: 'Architecture: Multi-Tenancy Strategy',
    branchBadge: 'MULTI-TENANT SAAS BRANCH',
    branchReason: 'Triggered by B2B SaaS / Multi-tenant scope',
    matchKeywords: ['b2b', 'multi-tenant', 'enterprise saas', 'organization', 'workspace', 'tenant'],
    question: 'What tenant data isolation pattern and organization hierarchy will be implemented?',
    why_needed: 'Guarantees zero cross-tenant data leakage while keeping infrastructure costs manageable.',
    options: [
      'Row-Level Security (RLS) with tenant_id session enforcement on every query',
      'Schema-per-tenant for enterprise data isolation and compliance guarantees',
      'Subdomain routing (e.g. tenant.domain.com) with custom domain CNAME support',
      'Organization workspace hierarchy with member roles & invitation links',
    ],
    default_answer: 'Row-Level Security (RLS) with tenant_id session enforcement on every query',
    placeholder: 'e.g. PostgreSQL RLS with workspace organization hierarchy',
    allow_multiple: false,
  },

  // 14. Fast MVP / Rapid Prototype Timeline
  {
    id: 'branch_rapid_velocity',
    parentQuestionId: 'timeline_cadence',
    category: 'Delivery: Velocity Acceleration',
    branchBadge: 'RAPID VELOCITY BRANCH',
    branchReason: 'Triggered by Fast MVP / Accelerated timeline',
    matchKeywords: ['fast mvp', '2 sprints', 'prototype', 'hackathon', 'rapid prototype', '4 weeks'],
    question: 'Which Backend-as-a-Service (BaaS) and scaffolding accelerators will keep sprint velocity high?',
    why_needed: 'Focuses engineering hours on differentiated domain logic rather than boilerplate infrastructure.',
    options: [
      'Supabase BaaS for instant auth, PostgreSQL, auto-generated APIs & storage',
      'Tailwind CSS with pre-built accessible component primitives',
      'Serverless Edge deployment with instant Git push preview environments',
      'Third-party hosted analytics (PostHog) and automated transactional emails',
    ],
    default_answer: 'Supabase BaaS for instant auth, PostgreSQL, auto-generated APIs & storage',
    placeholder: 'e.g. Supabase BaaS with Vercel edge deployment',
    allow_multiple: true,
  },
];

export interface TriggeredBranchInfo {
  branchId: string;
  parentQuestionId: string;
  parentQuestionLabel?: string;
  matchedKeywords: string[];
  rule: BranchRuleDefinition;
}

export function evaluateBranchRules(
  answers: Record<string, string>,
  dismissedBranchIds: Set<string> = new Set()
): TriggeredBranchInfo[] {
  const triggered: TriggeredBranchInfo[] = [];

  for (const rule of BRANCH_RULES) {
    if (dismissedBranchIds.has(rule.id)) continue;

    const answer = String(answers[rule.parentQuestionId] || '').toLowerCase();
    if (!answer.trim()) continue;

    const matched = rule.matchKeywords.filter((kw) => answer.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      triggered.push({
        branchId: rule.id,
        parentQuestionId: rule.parentQuestionId,
        matchedKeywords: matched,
        rule,
      });
    }
  }

  return triggered;
}

export interface ComputedSurveyResult {
  allQuestions: ClarificationQuestion[];
  baseQuestions: ClarificationQuestion[];
  triggeredBranches: TriggeredBranchInfo[];
  branchQuestionsMap: Record<string, ClarificationQuestion>;
}

export function computeSurveyQuestions(
  baseQuestions: ClarificationQuestion[],
  answers: Record<string, string>,
  customAiQuestions: ClarificationQuestion[] = [],
  dismissedBranchIds: Set<string> = new Set()
): ComputedSurveyResult {
  const triggered = evaluateBranchRules(answers, dismissedBranchIds);
  const triggeredMap = new Map<string, TriggeredBranchInfo>();
  triggered.forEach((t) => triggeredMap.set(t.branchId, t));

  const branchQuestionsMap: Record<string, ClarificationQuestion> = {};

  // Build branch questions from rule definitions
  triggered.forEach((t) => {
    const parent = baseQuestions.find((q) => q.id === t.parentQuestionId);
    const parentLabel = parent?.category || t.parentQuestionId.replace(/_/g, ' ');

    branchQuestionsMap[t.branchId] = {
      id: t.rule.id,
      category: t.rule.category,
      question: t.rule.question,
      why_needed: t.rule.why_needed,
      placeholder: t.rule.placeholder,
      options: t.rule.options,
      default_answer: t.rule.default_answer,
      allow_multiple: t.rule.allow_multiple,
      is_conditional_branch: true,
      parent_question_id: t.parentQuestionId,
      parent_question_label: parentLabel,
      branch_badge: t.rule.branchBadge,
      branch_reason: `${t.rule.branchReason} (matched: ${t.matchedKeywords.slice(0, 3).join(', ')})`,
      trigger_matched_value: t.matchedKeywords[0],
    };
  });

  // Also include custom AI-generated branch questions if active
  customAiQuestions.forEach((q) => {
    if (!dismissedBranchIds.has(q.id)) {
      branchQuestionsMap[q.id] = q;
    }
  });

  // Assemble full question array: base questions followed by triggered branches right after their parent
  const result: ClarificationQuestion[] = [];
  const handledBranchIds = new Set<string>();

  baseQuestions.forEach((bq) => {
    result.push(bq);

    // Check if any branches are children of this base question
    Object.values(branchQuestionsMap).forEach((branchQ) => {
      if (branchQ.parent_question_id === bq.id && !handledBranchIds.has(branchQ.id)) {
        result.push(branchQ);
        handledBranchIds.add(branchQ.id);
      }
    });
  });

  // Catch any remaining branches not tied to standard base questions
  Object.values(branchQuestionsMap).forEach((branchQ) => {
    if (!handledBranchIds.has(branchQ.id)) {
      result.push(branchQ);
      handledBranchIds.add(branchQ.id);
    }
  });

  return {
    allQuestions: result,
    baseQuestions,
    triggeredBranches: triggered,
    branchQuestionsMap,
  };
}

export async function requestAiFollowUpBranch(
  conceptPrompt: string,
  parentQuestion: ClarificationQuestion,
  userAnswer: string
): Promise<ClarificationQuestion | null> {
  try {
    const res = await fetch('/api/gemini/generate-branch-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: conceptPrompt,
        parent_id: parentQuestion.id,
        parent_question: parentQuestion.question,
        parent_category: parentQuestion.category,
        user_answer: userAnswer,
      }),
    });

    if (!res.ok) {
      // Graceful client fallback synthesis if backend is busy
      return synthesizeClientBranchQuestion(conceptPrompt, parentQuestion, userAnswer);
    }

    const data = await res.json();
    if (data?.question) {
      return {
        id: `ai_branch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        category: `Tailored Deep-Dive: ${parentQuestion.category}`,
        question: String(data.question.text || data.question.question || 'Specific technical configuration:'),
        why_needed: String(data.question.why_needed || 'Required to tailor architecture to user choice.'),
        placeholder: String(data.question.placeholder || 'Specify configuration details...'),
        options: Array.isArray(data.question.options) ? data.question.options.map(String) : [],
        default_answer: String(data.question.default_answer || (data.question.options?.[0] ?? '')),
        allow_multiple: Boolean(data.question.allow_multiple),
        is_conditional_branch: true,
        parent_question_id: parentQuestion.id,
        parent_question_label: parentQuestion.category,
        branch_badge: 'AI-GENERATED DEEP-DIVE',
        branch_reason: `Tailored deep-dive generated for "${userAnswer.slice(0, 35)}..."`,
        trigger_matched_value: userAnswer.slice(0, 30),
        is_ai_generated: true,
      };
    }
    return synthesizeClientBranchQuestion(conceptPrompt, parentQuestion, userAnswer);
  } catch {
    return synthesizeClientBranchQuestion(conceptPrompt, parentQuestion, userAnswer);
  }
}

function synthesizeClientBranchQuestion(
  _conceptPrompt: string,
  parentQuestion: ClarificationQuestion,
  userAnswer: string
): ClarificationQuestion {
  const cleanAnswer = userAnswer.trim();
  return {
    id: `ai_branch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    category: `Tailored Deep-Dive: ${parentQuestion.category}`,
    question: `How should your system handle specialized implementation constraints for "${cleanAnswer.slice(0, 45)}"?`,
    why_needed: `Prevents generic architecture assumptions by capturing concrete technical parameters for ${cleanAnswer.slice(0, 30)}.`,
    placeholder: `e.g. Dedicated worker pools, rate limits, or custom caching layer`,
    options: [
      `Standard production configuration with connection pooling & health checks`,
      `High-throughput cluster with read-replicas & Redis caching`,
      `Managed serverless runtime with automated scaling`,
      `Air-gapped / dedicated VPC deployment with strict network isolation`,
    ],
    default_answer: `Standard production configuration with connection pooling & health checks`,
    allow_multiple: false,
    is_conditional_branch: true,
    parent_question_id: parentQuestion.id,
    parent_question_label: parentQuestion.category,
    branch_badge: 'TAILORED DEEP-DIVE',
    branch_reason: `Tailored deep-dive generated for "${cleanAnswer.slice(0, 35)}..."`,
    trigger_matched_value: cleanAnswer.slice(0, 30),
    is_ai_generated: true,
  };
}
