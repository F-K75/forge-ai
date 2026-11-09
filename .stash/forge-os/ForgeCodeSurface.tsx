import { useState, useEffect } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { FileCode2, Copy, Check, Split, GitCompare, RotateCcw } from "lucide-react";

interface ForgeCodeSurfaceProps {
  initialFile?: string;
  files?: Record<string, string>;
}

const DEFAULT_FILES: Record<string, string> = {
  "src/api/auth.ts": `import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sign, verify } from 'hono/jwt';

const auth = new Hono();

const OAuthSchema = z.object({
  provider: z.enum(['google', 'github']),
  code: z.string().min(1),
  codeVerifier: z.string().min(43),
});

// Handle OAuth 2.1 authorization code exchange with PKCE
auth.post('/oauth/callback', zValidator('json', OAuthSchema), async (c) => {
  const { provider, code, codeVerifier } = c.req.valid('json');
  
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

  const handleCopy = () => {
    navigator.clipboard?.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full flex flex-col bg-[#0A0B0E] overflow-hidden select-none">
      {/* Editor Top Bar with File Tabs */}
      <div className="h-10 px-3 border-b border-white/[0.06] bg-[#0E1015] flex items-center justify-between">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
          {fileKeys.map((p) => {
            const isActive = p === activePath;
            const filename = p.split("/").pop();
            return (
              <button
                key={p}
                type="button"
                onClick={() => setActivePath(p)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition whitespace-nowrap ${
                  isActive
                    ? "bg-[#14161F] text-[#F4F4F6] border border-white/[0.1] font-medium"
                    : "text-[#888B96] hover:text-[#F4F4F6] hover:bg-white/[0.03]"
                }`}
              >
                <FileCode2 size={12} className={isActive ? "text-[#FF5722]" : "text-[#5A5D68]"} />
                <span>{filename}</span>
              </button>
            );
          })}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 text-xs font-mono text-[#888B96]">
          <button
            type="button"
            onClick={() => setIsDiffMode(!isDiffMode)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded transition ${
              isDiffMode ? "bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/40" : "hover:text-[#F4F4F6] hover:bg-white/[0.04]"
            }`}
          >
            <GitCompare size={12} />
            <span>Diff</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded hover:text-[#F4F4F6] hover:bg-white/[0.04] transition"
          >
            {copied ? <Check size={12} className="text-[#30D158]" /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* Editor Viewport */}
      <div className="flex-1 relative bg-[#07080A]">
        {isDiffMode ? (
          <DiffEditor
            height="100%"
            original={content.replace(/sessionJwt/g, "rawJwt").slice(0, -50)}
            modified={content}
            language={activePath.endsWith(".sql") ? "sql" : "typescript"}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 12.5,
              lineNumbers: "on",
              readOnly: true,
              scrollBeyondLastLine: false,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          />
        ) : (
          <Editor
            height="100%"
            path={activePath}
            value={content}
            language={activePath.endsWith(".sql") ? "sql" : "typescript"}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 12.5,
              lineNumbers: "on",
              readOnly: false,
              scrollBeyondLastLine: false,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              cursorBlinking: "smooth",
              renderLineHighlight: "all",
            }}
          />
        )}
      </div>
    </div>
  );
}
