import { useState } from 'react'
import { RefreshCw, ExternalLink, Globe, Share2, Download, Github, Rocket } from 'lucide-react'
import clsx from 'clsx'
import { useBuildStore } from '../../store/buildStore'
import { deploymentsApi } from '../../lib/api'
import { ClipboardCopyButton } from '../ui/ClipboardCopyButton'

interface PreviewPanelProps {
  previewUrl?: string
  buildId?: string | null
  projectId?: string | null
}

const SECURE_IFRAME_SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
].join(' ')

export function PreviewPanel({ previewUrl, buildId, projectId }: PreviewPanelProps) {
  const { status, validation, files } = useBuildStore()
  const [refreshKey, setRefreshKey] = useState(0)
  const [copyError, setCopyError] = useState<string | null>(null)

  const handleExport = async () => {
    try {
      const filesJson = JSON.stringify(files, null, 2)
      const blob = new Blob([filesJson], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'export.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setCopyError('Export failed')
    }
  }

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
              <div className="flex items-center gap-2 text-violet-300 text-xs mt-2" aria-busy="true">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" aria-hidden="true" />
                <span className="font-medium">Building...</span>
              </div>
            )}

            {validation && (
              <div className="w-full mt-4 bg-forge-surface border border-forge-border rounded-2xl p-4 text-left">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-forge-text">QA Score</span>
                  <span
                    className={`text-sm font-semibold ${validation.score !== undefined && validation.score >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}
                  >
                    {validation.score ?? 0}/100
                  </span>
                </div>
                {validation.missing_features && validation.missing_features.length > 0 && (
                  <div>
                    <p className="text-[10px] text-forge-text-secondary mb-2 uppercase tracking-wide">
                      Needs attention
                    </p>
                    {validation.missing_features.map((f: string, i: number) => (
                      <p key={i} className="text-xs text-amber-400 flex items-center gap-2">
                        <span className="text-[14px] leading-none" aria-hidden="true">•</span>
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
      <div className="flex items-center gap-2 px-3 py-2 border-b border-forge-border bg-forge-surface/80 backdrop-blur">
        <div className="flex-1 rounded-xl border border-forge-border/70 bg-forge-bg/70 px-3 py-2 text-xs text-forge-text-secondary font-mono truncate">
          {previewUrl || 'http://localhost:3000'}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={status === 'running' ? 'Building' : status === 'success' ? 'Ready' : 'Idle'}
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
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" aria-hidden="true" /> Building
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
            className="bb-btn bb-btn-ghost bb-btn-icon rounded-xl focus:ring-2 focus:ring-violet-500"
          >
            <RefreshCw size={13} aria-hidden="true" />
          </button>

          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open preview in a new tab"
              className="bb-btn bb-btn-ghost bb-btn-icon rounded-xl focus:ring-2 focus:ring-violet-500"
            >
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {previewUrl ? (
        <iframe
          key={refreshKey}
          src={previewUrl}
          className="flex-1 w-full border-0 bg-white rounded-b-2xl"
          title="App preview"
          sandbox={SECURE_IFRAME_SANDBOX}
          loading="lazy"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bb-panel max-w-md w-full p-10 text-center">
            <p className="text-sm font-medium">Deploy your app</p>
            <p className="text-xs text-forge-text-secondary mt-1">
              Deploy your app to see the preview.
            </p>
            {status === 'success' && buildId && projectId && (
              <button
                onClick={() => deploymentsApi.create({ build_id: buildId, project_id: projectId })}
                className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition focus:ring-2 focus:ring-violet-500"
              >
                Deploy now
              </button>
            )}
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="border-t border-forge-border p-4 bg-forge-surface/50">
          <div className="flex items-center justify-between">
            <div className="text-xs text-forge-text-secondary">
              What's next?
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-forge-bg border border-forge-border rounded-lg hover:bg-forge-surface transition focus:ring-2 focus:ring-violet-500"
              >
                <Download className="w-3 h-3" aria-hidden="true" />
                Export
              </button>
              <button
                onClick={() => {}}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-forge-bg border border-forge-border rounded-lg hover:bg-forge-surface transition focus:ring-2 focus:ring-violet-500"
              >
                <Share2 className="w-3 h-3" aria-hidden="true" />
                Share
              </button>
              <button
                onClick={() => {}}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-forge-bg border border-forge-border rounded-lg hover:bg-forge-surface transition focus:ring-2 focus:ring-violet-500"
              >
                <Github className="w-3 h-3" aria-hidden="true" />
                Push to GitHub
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}