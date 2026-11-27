import { useState, useEffect } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { FileCode2, Copy, Check, GitCompare } from "lucide-react";

interface ForgeCodeSurfaceProps {
  initialFile?: string;
  files?: Record<string, string>;
}

const DEFAULT_FILES: Record<string, string> = {
  "src/api/auth.ts": `import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sign } from 'hono/jwt';

const auth = new Hono();

const OAuthSchema = z.object({
  provider: z.enum(['google', 'github']),
  code: z.string().min(1),
  codeVerifier: z.string().min(43),
});

// Handle OAuth 2.1 authorization code exchange with PKCE
auth.post('/oauth/callback', zValidator('json', OAuthSchema), async (c) => {
  const { code, codeVerifier } = c.req.valid('json');

  // Exchange code for tokens
  const tokenResponse = await fetch(\`https://oauth2.googleapis.com/token\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      client_id: process.env.GOOGLE_CLIENT_ID!,
    }),
  });

  const tokens = await tokenResponse.json();
  const sessionJwt = await sign({ sub: tokens.sub, email: tokens.email }, process.env.JWT_SECRET!);

  return c.json({ ok: true, token: sessionJwt });
});

export default auth;`,

  "src/api/checkout.ts": `import Stripe from 'stripe';
import { Hono } from 'hono';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const billing = new Hono();

billing.post('/create-session', async (c) => {
  const { planId, customerEmail } = await c.req.json();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    customer_email: customerEmail,
    line_items: [{ price: planId, quantity: 1 }],
    success_url: \`\${process.env.APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}\`,
    cancel_url: \`\${process.env.APP_URL}/pricing\`,
  });

  return c.json({ sessionId: session.id, url: session.url });
});

export default billing;`,

  "src/db/schema.sql": `-- Forge Core Database Schema (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_subscription_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  plan_tier VARCHAR(50) NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_users_email ON users(email);`,
};

function detectLanguage(path: string): string {
  if (path.endsWith(".sql")) return "sql";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".md")) return "markdown";
  return "typescript";
}

export function ForgeCodeSurface({
  initialFile = "src/api/auth.ts",
  files = DEFAULT_FILES,
}: ForgeCodeSurfaceProps) {
  const [activePath, setActivePath] = useState(initialFile);
  const [copied, setCopied] = useState(false);
  const [isDiffMode, setIsDiffMode] = useState(false);

  useEffect(() => {
    if (initialFile && files[initialFile]) {
      setActivePath(initialFile);
    }
  }, [initialFile, files]);

  const fileKeys = Object.keys(files);
  const content = files[activePath] || files[fileKeys[0]] || "";
  const language = detectLanguage(activePath);

  const handleCopy = () => {
    navigator.clipboard?.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full flex flex-col bg-panel-alt overflow-hidden select-none">
      {/* Editor Top Bar with File Tabs */}
      <div className="h-11 px-3 border-b border-border bg-panel-alt flex items-center justify-between gap-3 shrink-0">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
          {fileKeys.map((p) => {
            const isActive = p === activePath;
            const filename = p.split("/").pop();
            return (
              <button
                key={p}
                type="button"
                onClick={() => setActivePath(p)}
                title={p}
                className={`h-8 px-2.5 rounded-pill text-xs font-mono font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                  isActive
                    ? "bg-panel text-ink border border-border shadow-apple"
                    : "text-muted hover:text-ink hover:bg-panel/60 border border-transparent"
                }`}
              >
                <FileCode2
                  size={13}
                  className={isActive ? "text-accent shrink-0" : "text-faint shrink-0"}
                />
                <span>{filename}</span>
              </button>
            );
          })}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsDiffMode(!isDiffMode)}
            className={`h-8 px-2.5 rounded-pill border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
              isDiffMode
                ? "bg-ink text-on-ink border-transparent"
                : "bg-panel text-ink border-border hover:bg-panel-alt"
            }`}
          >
            <GitCompare size={13} />
            <span>Diff</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="h-8 px-2.5 rounded-pill border border-border bg-panel text-ink hover:bg-panel-alt text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
          >
            {copied ? (
              <>
                <Check size={13} className="text-ok" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy size={13} className="text-muted" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor Viewport */}
      <div className="flex-1 relative bg-panel-alt">
        {isDiffMode ? (
          <DiffEditor
            height="100%"
            original={content.replace(/sessionJwt/g, "rawJwt").slice(0, -50)}
            modified={content}
            language={language}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              readOnly: true,
              scrollBeyondLastLine: false,
              fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
              padding: { top: 14, bottom: 14 },
            }}
          />
        ) : (
          <Editor
            height="100%"
            path={activePath}
            value={content}
            language={language}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              readOnly: false,
              scrollBeyondLastLine: false,
              fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
              cursorBlinking: "smooth",
              renderLineHighlight: "all",
              padding: { top: 14, bottom: 14 },
            }}
          />
        )}
      </div>
    </div>
  );
}
