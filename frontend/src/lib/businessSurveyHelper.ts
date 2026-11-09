/**
 * Business Survey Helper & Plain-English Translation Engine
 *
 * Bridges the gap between technical architecture specifications and
 * non-technical business founders, product managers, and executives.
 *
 * Translates developer jargon into clear, relatable business value,
 * risk mitigations, ROI trade-offs, and practical plain-English explanations.
 */

import { ClarificationQuestion } from './geminiPM';

export interface BusinessCategoryInfo {
  businessTitle: string;
  businessSubtitle: string;
  businessIcon: string;
  businessImpact: string;
  plainEnglishHint: string;
}

export interface BusinessOptionInfo {
  label: string;
  badge?: string;
  badgeColor?: string;
  plainExplanation: string;
  recommendedFor?: string;
}

export interface JargonDefinition {
  term: string;
  plainMeaning: string;
  whyItMatters: string;
  category?: string;
  example?: string;
}

// 1. Business Category Mappings
export const BUSINESS_CATEGORY_MAP: Record<string, BusinessCategoryInfo> = {
  'Target Audience & User Roles': {
    businessTitle: '1. Who will use this product?',
    businessSubtitle: 'Identify your target customers, user types, and team roles',
    businessIcon: 'Users',
    businessImpact: 'Prevents building features for the wrong audience and ensures clear user experiences for each customer group.',
    plainEnglishHint: 'Think about who will log in every day (e.g., customers buying items, staff fulfilling orders, or managers viewing reports).',
  },
  'MVP Scope & Core Workflows': {
    businessTitle: '2. What must work on Day 1?',
    businessSubtitle: 'Define the absolute must-have features needed to launch and start getting users',
    businessIcon: 'Target',
    businessImpact: 'Keeps your initial budget lean and avoids delays by focusing purely on what customers will pay for or use first.',
    plainEnglishHint: 'What single core task must a customer successfully complete for this product to be considered a success?',
  },
  'Tech Stack & Architecture': {
    businessTitle: '3. How should your app be built and hosted?',
    businessSubtitle: 'Choose the overall platform format (web app, mobile, or both) and hosting model',
    businessIcon: 'Layers',
    businessImpact: 'Selects the most cost-effective and reliable foundation so you can launch quickly without overpaying for enterprise servers.',
    plainEnglishHint: 'If you are unsure, the recommended cloud web option gives you the fastest launch and lowest initial overhead.',
  },
  'Third-Party Integrations & APIs': {
    businessTitle: '4. Which business tools should it connect with?',
    businessSubtitle: 'Plug into trusted services for payments, logins, emails, and customer management',
    businessIcon: 'Plug',
    businessImpact: 'Saves months of developer time and thousands of dollars by utilizing proven services like Stripe and Google rather than building from scratch.',
    plainEnglishHint: 'Select the existing tools your business already uses or needs (e.g. credit card processing, Google sign-in).',
  },
  'Security, Compliance & SLAs': {
    businessTitle: '5. Protecting your data and customer trust',
    businessSubtitle: 'Set privacy rules, legal requirements, and system reliability standards',
    businessIcon: 'ShieldCheck',
    businessImpact: 'Protects your company reputation, shields user privacy, and ensures compliance with industry laws.',
    plainEnglishHint: 'Most standard products need basic GDPR/privacy protection; medical or financial products require specialized safeguards.',
  },
  'Timeline, Sprint Cadence & Business Model': {
    businessTitle: '6. Target launch timeline and business model',
    businessSubtitle: 'Set your target delivery window and how your product generates value',
    businessIcon: 'Calendar',
    businessImpact: 'Gives your development team clear deadlines and milestones aligned with your business launch plan.',
    plainEnglishHint: 'A 4-week to 8-week target is ideal for testing customer demand before committing larger investments.',
  },
};

// 2. Plain-English Option Translator
export function getBusinessOptionInfo(rawOption: string): BusinessOptionInfo {
  const lower = rawOption.toLowerCase();

  // Tech stack translations
  if (lower.includes('next.js') || (lower.includes('react') && lower.includes('postgres') && !lower.includes('mobile'))) {
    return {
      label: 'Modern Cloud Web App (Recommended)',
      badge: 'Fastest Launch',
      badgeColor: 'emerald',
      plainExplanation: 'High-speed web app accessible from any computer or phone browser. Low maintenance and scales automatically.',
      recommendedFor: 'Best for web SaaS, portals, and customer dashboards',
    };
  }

  if (lower.includes('mobile') || lower.includes('react native') || lower.includes('flutter')) {
    return {
      label: 'Downloadable Mobile App (iOS & Android)',
      badge: 'App Stores',
      badgeColor: 'blue',
      plainExplanation: 'Native smartphone apps available on Apple App Store & Google Play with a shared cloud backend.',
      recommendedFor: 'Best for consumers on the go, field service staff, and offline use',
    };
  }

  if (lower.includes('python') || lower.includes('fastapi') || lower.includes('timescaledb') || lower.includes('clickhouse')) {
    return {
      label: 'Data & AI-Powered Web Platform',
      badge: 'AI Ready',
      badgeColor: 'purple',
      plainExplanation: 'Engineered specifically for heavy data analysis, machine learning algorithms, and real-time smart predictions.',
      recommendedFor: 'Best for AI platforms, smart analytics, and automated reporting',
    };
  }

  if (lower.includes('go') || lower.includes('kafka') || lower.includes('ledger') || lower.includes('redis')) {
    return {
      label: 'High-Speed Transaction Engine',
      badge: 'Maximum Scale',
      badgeColor: 'amber',
      plainExplanation: 'Ultra-fast execution built to process thousands of transactions per second with zero lag.',
      recommendedFor: 'Best for payments, high-volume order processing, and fintech',
    };
  }

  // Integration translations
  if (lower.includes('stripe') && (lower.includes('subscription') || lower.includes('billing') || lower.includes('payment'))) {
    return {
      label: 'Online Payments & Card Billing (Stripe)',
      badge: 'Revenue',
      badgeColor: 'emerald',
      plainExplanation: 'Accept credit cards, debit cards, Apple Pay, and automated monthly/annual customer recurring subscriptions.',
      recommendedFor: 'Essential for selling services or charging subscriptions online',
    };
  }

  if (lower.includes('clerk') || lower.includes('supabase') || lower.includes('auth') || lower.includes('google workspace') || lower.includes('oauth')) {
    return {
      label: 'One-Click Login & User Accounts (Google/Email)',
      badge: 'Frictionless',
      badgeColor: 'blue',
      plainExplanation: 'Lets customers sign up in seconds using Google or email with secure passwordless links.',
      recommendedFor: 'Boosts sign-up conversion by removing registration friction',
    };
  }

  if (lower.includes('sendgrid') || lower.includes('resend') || lower.includes('email') || lower.includes('sms') || lower.includes('twilio')) {
    return {
      label: 'Automated Email & SMS Alerts',
      badge: 'Engagement',
      badgeColor: 'cyan',
      plainExplanation: 'Automatically notifies users about order receipts, welcome onboarding, status changes, and weekly digests.',
      recommendedFor: 'Keeps customers engaged and informed automatically',
    };
  }

  if (lower.includes('openai') || lower.includes('gemini') || lower.includes('ai services')) {
    return {
      label: 'Smart AI Assistant & Automation (Gemini / OpenAI)',
      badge: 'AI Smart',
      badgeColor: 'purple',
      plainExplanation: 'Generates summaries, auto-fills forms, and answers customer questions using artificial intelligence.',
      recommendedFor: 'Saves time by automating repetitive manual tasks',
    };
  }

  if (lower.includes('fhir') || lower.includes('hl7') || lower.includes('ehr')) {
    return {
      label: 'Hospital & Clinic Record Sync (FHIR / EHR)',
      badge: 'Healthcare',
      badgeColor: 'teal',
      plainExplanation: 'Connects directly with hospital record systems (Epic, Cerner) to sync patient charts safely.',
      recommendedFor: 'Required for medical clinics and healthcare integrations',
    };
  }

  // Security translations
  if (lower.includes('soc2') || lower.includes('gdpr') || lower.includes('standard')) {
    return {
      label: 'Standard Customer Privacy & Trust (GDPR & SOC2 Ready)',
      badge: 'Industry Standard',
      badgeColor: 'emerald',
      plainExplanation: 'Follows established data protection rules so customers know their personal info is safe and confidential.',
      recommendedFor: 'Recommended for almost all B2B and consumer web software',
    };
  }

  if (lower.includes('hipaa') || lower.includes('hitech') || lower.includes('phi')) {
    return {
      label: 'Medical Patient Privacy Law (HIPAA Certified)',
      badge: 'Strict Legal',
      badgeColor: 'teal',
      plainExplanation: 'Legally required encryption and audit logging to handle sensitive patient health information.',
      recommendedFor: 'Mandatory for any healthcare, clinic, or medical software',
    };
  }

  if (lower.includes('pci') || lower.includes('double-spend') || lower.includes('idempotent')) {
    return {
      label: 'Bank-Grade Payment & Anti-Fraud Protection',
      badge: 'High Security',
      badgeColor: 'amber',
      plainExplanation: 'Prevents double-charging, ensures exact financial balance accounting, and passes card processor audits.',
      recommendedFor: 'Mandatory for handling money, digital wallets, or direct banking',
    };
  }

  // Timeline translations
  if (lower.includes('2 sprints') || lower.includes('4 weeks')) {
    return {
      label: '⚡ 4-Week Fast Prototype',
      badge: 'Rapid Validation',
      badgeColor: 'emerald',
      plainExplanation: 'The fastest path to market. Builds only the #1 core feature so you can test customer demand immediately.',
      recommendedFor: 'Testing new ideas with minimal budget before heavy investment',
    };
  }

  if (lower.includes('4 sprints') || lower.includes('8 weeks')) {
    return {
      label: '🚀 8-Week Standard Launch (Recommended)',
      badge: 'Balanced & Proven',
      badgeColor: 'blue',
      plainExplanation: 'A two-month iterative build. Includes user accounts, polished designs, error handling, and core workflows.',
      recommendedFor: 'The sweet spot for serious business launches and commercial readiness',
    };
  }

  if (lower.includes('6 sprints') || lower.includes('12 weeks')) {
    return {
      label: '🏢 12-Week Comprehensive Platform',
      badge: 'Full Scale',
      badgeColor: 'purple',
      plainExplanation: 'A full quarter build with deep role permissions, third-party integrations, and enterprise security audits.',
      recommendedFor: 'Complex products or regulated industries needing enterprise sign-off',
    };
  }

  // Default clean formatting
  return {
    label: rawOption,
    plainExplanation: 'Tailored specification item customized for your business requirements.',
  };
}

// 3. Jargon Buster Dictionary
export const JARGON_LIST: JargonDefinition[] = [
  {
    term: 'Next.js / Modern Web App',
    category: 'Architecture',
    plainMeaning: 'The modern web app technology behind Netflix and Uber that ensures instant page loading and smooth mobile screens.',
    whyItMatters: 'Makes your web application feel as snappy and responsive as a native smartphone app.',
    example: 'Fast screen transitions without white screen flashes.',
  },
  {
    term: 'PostgreSQL',
    category: 'Database',
    plainMeaning: 'The industry-standard, rock-solid digital filing cabinet that securely stores your users, orders, and business records.',
    whyItMatters: 'Guarantees your data is safe, organized, and backed up without corrupting.',
    example: 'Storing customer orders, billing records, and audit trails.',
  },
  {
    term: 'Stripe',
    category: 'Payments',
    plainMeaning: 'The global financial infrastructure that lets you accept credit cards, debit cards, Apple Pay, and automated monthly/annual subscriptions.',
    whyItMatters: 'Removes the liability of storing customer card numbers and guarantees secure payments.',
    example: 'Customer checkouts, automated invoices, recurring subscriptions.',
  },
  {
    term: 'OAuth / Google SSO',
    category: 'Authentication',
    plainMeaning: 'Sign-in with Google or Microsoft without forcing users to invent and remember a new password.',
    whyItMatters: 'Dramatically increases sign-up conversion by letting users join in one click.',
    example: 'Click "Sign in with Google" to access accounts instantly.',
  },
  {
    term: 'RBAC (Role-Based Access Control)',
    category: 'Security',
    plainMeaning: 'A permission system that ensures different team members only see what they are allowed to see (e.g., Staff enter data, Managers approve it).',
    whyItMatters: 'Keeps sensitive financial or customer records private from unauthorized staff.',
    example: 'Staff cannot see employee salaries or executive analytics.',
  },
  {
    term: 'SOC2 / GDPR',
    category: 'Compliance',
    plainMeaning: 'Strict privacy regulations and audits certifying your software protects customer information and respects data rights.',
    whyItMatters: 'Enterprise clients and corporate buyers will not sign enterprise contracts without this assurance.',
    example: 'Encrypted user data, data export options, strict audit logs.',
  },
  {
    term: 'MVP (Minimum Viable Product)',
    category: 'Strategy',
    plainMeaning: 'The leanest version of your software that solves the core problem for customers and generates early revenue or feedback.',
    whyItMatters: 'Prevents burning engineering budget building unneeded features before market validation.',
    example: 'Launching the core ordering feature first before building loyalty points.',
  },
  {
    term: 'SLA (Service Level Agreement)',
    category: 'Performance',
    plainMeaning: 'A guaranteed promise that the software will be online 99.9% of the time and respond in under 1 second.',
    whyItMatters: 'Prevents revenue loss from unexpected downtime or slow pages during peak customer hours.',
    example: 'Fast page loads even during Black Friday spikes.',
  },
  {
    term: 'Redis (In-Memory Cache)',
    category: 'Speed',
    plainMeaning: 'A lightning-fast temporary memory store that prevents repeat database queries for frequent data.',
    whyItMatters: 'Cuts server hosting costs and speeds up customer search results by up to 10x.',
    example: 'Instant search autosuggest and live shopping cart counters.',
  },
  {
    term: 'Sprint (2-Week Milestone)',
    category: 'Execution',
    plainMeaning: 'A focused, 2-week work cycle where engineers build, test, and demo a tangible batch of features.',
    whyItMatters: 'Ensures predictable delivery and allows business priorities to be adjusted every 2 weeks.',
    example: 'Testing working features every other Friday.',
  },
  {
    term: 'FHIR / EHR',
    category: 'Healthcare',
    plainMeaning: 'The universal electronic medical record standard used by hospitals (Epic, Cerner) to exchange patient charts securely.',
    whyItMatters: 'Allows healthcare startups to integrate directly into clinic software without proprietary code.',
    example: 'Syncing patient appointments directly into hospital calendars.',
  },
];

export const JARGON_GLOSSARY: Record<string, JargonDefinition> = JARGON_LIST.reduce(
  (acc, item) => {
    acc[item.term] = item;
    return acc;
  },
  {} as Record<string, JargonDefinition>
);

// 4. Business Readiness Checklist
export interface BusinessReadinessItem {
  id: string;
  category: string;
  businessQuestion: string;
  isAnswered: boolean;
  userAnswer?: string;
  impactScore: number;
}

export function evaluateBusinessReadiness(
  input: ClarificationQuestion[] | Record<string, string>,
  answersOrCount?: Record<string, string> | number
): {
  score: number;
  stage: string;
  readinessLabel: string;
  items: BusinessReadinessItem[];
  missingCount: number;
} {
  // Support both (questions, answers) AND (answers, totalCount)
  if (Array.isArray(input)) {
    const questions = input;
    const answers = (typeof answersOrCount === 'object' && answersOrCount !== null ? answersOrCount : {}) as Record<string, string>;

    const items: BusinessReadinessItem[] = questions.map((q) => {
      const ans = answers[q.id]?.trim() || '';
      const isAnswered = Boolean(ans);
      const catInfo = BUSINESS_CATEGORY_MAP[q.category];

      return {
        id: q.id,
        category: q.category,
        businessQuestion: catInfo ? catInfo.businessTitle : q.question,
        isAnswered,
        userAnswer: ans || undefined,
        impactScore: 1,
      };
    });

    const total = items.length || 1;
    const answered = items.filter((i) => i.isAnswered).length;
    const score = Math.round((answered / total) * 100);

    let readinessLabel = 'Initial Planning';
    if (score === 100) readinessLabel = 'Ready for Build';
    else if (score >= 70) readinessLabel = 'High Confidence';
    else if (score >= 40) readinessLabel = 'Shaping Core Scope';
    else readinessLabel = 'Discovery Phase';

    return {
      score,
      stage: readinessLabel,
      readinessLabel,
      items,
      missingCount: total - answered,
    };
  } else {
    // (answers, totalCount)
    const answers = input as Record<string, string>;
    const total = typeof answersOrCount === 'number' && answersOrCount > 0 ? answersOrCount : 1;
    const answered = Object.values(answers).filter((v) => Boolean(String(v || '').trim())).length;
    const score = Math.round((answered / total) * 100);

    let readinessLabel = 'Initial Planning';
    if (score === 100) readinessLabel = 'Ready for Build';
    else if (score >= 70) readinessLabel = 'High Confidence';
    else if (score >= 40) readinessLabel = 'Shaping Core Scope';
    else readinessLabel = 'Discovery Phase';

    return {
      score,
      stage: readinessLabel,
      readinessLabel,
      items: [],
      missingCount: Math.max(0, total - answered),
    };
  }
}
