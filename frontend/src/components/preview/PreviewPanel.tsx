import { useState } from 'react'
import { RefreshCw, ExternalLink, Globe } from 'lucide-react'
import clsx from 'clsx'
import { useBuildStore } from '../../store/buildStore'


interface PreviewPanelProps {
  previewUrl?: string
}

export function PreviewPanel({ previewUrl }: PreviewPanelProps) {
  const { status, validation } = useBuildStore()
  const [refreshKey, setRefreshKey] = useState(0)

  if (!previewUrl && status !== 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4 sm:px-6">
        <div className="bb-panel w-full max-w-md p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-forge-surface border border-forge-border flex items-center justify-center">
              <Globe size={28} className="text-forge-muted" />
            </div>
            <div>
              <p className="text-sm font-semibold text-forge-text">Live preview</p>
              <p className="text-xs text-forge-text-secondary mt-1">
                Your app will appear here once the build completes and deploys.
              </p>
            </div>

            {status === 'running' && (
              <div className="flex items-center gap-2 text-violet-300 text-xs mt-2">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                <span className="font-medium">Building...</span>
              </div>
            )}

            {validation && (
              <div className="w-full mt-4 bg-forge-surface border border-forge-border rounded-2xl p-4 text-left">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-forge-text">QA Score</span>
                  <span
                    className={`text-sm font-semibold ${validation.score >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}
                  >
                    {validation.score}/100
                  </span>
                </div>
                {validation.missing_features?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-forge-text-secondary mb-2 uppercase tracking-wide">
                      Needs attention
                    </p>
                    {validation.missing_features.map((f: string, i: number) => (
                      <p key={i} className="text-xs text-amber-400 flex items-center gap-2">
                        <span className="text-[14px] leading-none">•</span>
                        {f}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Preview toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-forge-border bg-forge-surface/80 backdrop-blur">
        <div className="flex-1 rounded-xl border border-forge-border/70 bg-forge-bg/70 px-3 py-2 text-xs text-forge-text-secondary font-mono truncate">
          {previewUrl || 'http://localhost:3000'}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Running"
            className={clsx(
              'hidden sm:inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition',
              status === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : status === 'running'
                  ? 'border-violet-500/30 bg-violet-500/10 text-violet-300'
                  : 'border-forge-border/70 bg-forge-surface/70 text-forge-text-secondary'
            )}
          >
            {status === 'running' ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" /> Running
              </span>
            ) : status === 'success' ? (
              'Ready'
            ) : (
              'Idle'
            )}
          </button>

          <button
            type="button"
            aria-label="Refresh preview"
            onClick={() => setRefreshKey(k => k + 1)}
            className="bb-btn bb-btn-ghost bb-btn-icon rounded-xl"
          >
            <RefreshCw size={13} />
          </button>

          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open preview in a new tab"
              className="bb-btn bb-btn-ghost bb-btn-icon rounded-xl"
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>


      {/* iframe */}
      {previewUrl ? (
        <iframe
          key={refreshKey}
          src={previewUrl}
          className="flex-1 w-full border-0 bg-white rounded-b-2xl"
          title="App preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bb-panel max-w-md w-full p-10 text-center">
            <p className="text-sm font-medium">Deploy your app</p>
            <p className="text-xs text-forge-text-secondary mt-1">
              Deploy your app to see the preview.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
