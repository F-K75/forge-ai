import { useEffect, useState } from 'react'
import { llmApi } from '../lib/api'

interface ProviderStatus {
  name: string
  priority: number
  healthy: boolean
  default_model?: string
  supports_stream?: boolean
}

interface ModelEntry {
  provider: string
  name: string
}

interface UsageEntry {
  model?: string
  provider?: string
  cost_usd?: number
  prompt_tokens?: number
  completion_tokens?: number
  [key: string]: unknown
}

export default function LLMManagementPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [models, setModels] = useState<ModelEntry[]>([])
  const [usage, setUsage] = useState<UsageEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [agentName, setAgentName] = useState('developer')
  const [overrideProvider, setOverrideProvider] = useState('')
  const [overrideModel, setOverrideModel] = useState('')
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([llmApi.health(), llmApi.models(), llmApi.usage()])
      .then(([health, modelsPayload, usagePayload]) => {
        setProviders(health.providers || [])
        setModels(modelsPayload.models || [])
        setUsage(usagePayload.usage || [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const saveOverride = async () => {
    setSaveStatus('Saving…')
    try {
      await llmApi.setAgentOverride(agentName, { provider: overrideProvider || undefined, model: overrideModel || undefined })
      setSaveStatus('Saved — applies immediately, no restart needed')
    } catch {
      setSaveStatus('Failed to save')
    }
  }

  const testConnection = async (providerName: string) => {
    setTestStatus(`Testing ${providerName}…`)
    try {
      const data = await llmApi.test({
        agent: 'developer',
        messages: [{ role: 'user', content: 'ping' }],
        provider_names: [providerName],
      })
      setTestStatus(`${providerName}: ${data.text?.slice(0, 60) || 'ok'}`)
    } catch {
      setTestStatus(`${providerName}: request failed`)
    }
  }

  const totalCost = usage.reduce((sum, entry) => sum + (entry.cost_usd || 0), 0)

  return (
    <div className="p-8 text-sm text-slate-200">
      <h1 className="text-2xl font-semibold">LLM Management</h1>
      <p className="mt-2 text-slate-400">Provider status, model assignments, cost, and per-agent routing.</p>

      {loading ? (
        <p className="mt-6">Loading…</p>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-lg font-medium">Providers</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {providers.map((provider) => (
                <div key={provider.name} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{provider.name}</span>
                    <span className={`rounded-full px-2 py-1 text-xs ${provider.healthy ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                      {provider.healthy ? 'Healthy' : 'Unhealthy'}
                    </span>
                  </div>
                  <p className="mt-2 text-slate-400">Priority: {provider.priority}</p>
                  <p className="text-slate-400">Default model: {provider.default_model || '—'}</p>
                  <button
                    onClick={() => testConnection(provider.name)}
                    className="mt-3 rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700"
                  >
                    Test connection
                  </button>
                </div>
              ))}
            </div>
            {testStatus && <p className="mt-3 text-xs text-slate-400">{testStatus}</p>}
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">Models</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {models.map((model) => (
                <span key={`${model.provider}-${model.name}`} className="rounded-full bg-slate-800 px-3 py-1 text-xs">
                  {model.provider} / {model.name}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">Cost & Usage</h2>
            <p className="mt-2 text-slate-400">Total tracked spend: ${totalCost.toFixed(4)}</p>
            <div className="mt-3 max-h-64 overflow-auto rounded border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-2">Model</th>
                    <th className="p-2">Prompt tokens</th>
                    <th className="p-2">Completion tokens</th>
                    <th className="p-2">Cost (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((entry, idx) => (
                    <tr key={idx} className="border-t border-slate-800">
                      <td className="p-2">{entry.model || '—'}</td>
                      <td className="p-2">{entry.prompt_tokens ?? '—'}</td>
                      <td className="p-2">{entry.completion_tokens ?? '—'}</td>
                      <td className="p-2">{entry.cost_usd?.toFixed(4) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">Per-Agent Model Assignment</h2>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Agent</span>
                <input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="rounded bg-slate-800 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Provider</span>
                <select
                  value={overrideProvider}
                  onChange={(e) => setOverrideProvider(e.target.value)}
                  className="rounded bg-slate-800 px-2 py-1"
                >
                  <option value="">(no change)</option>
                  {providers.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Model</span>
                <input
                  value={overrideModel}
                  onChange={(e) => setOverrideModel(e.target.value)}
                  className="rounded bg-slate-800 px-2 py-1"
                  placeholder="e.g. claude-sonnet-4-6"
                />
              </label>
              <button onClick={saveOverride} className="rounded bg-emerald-600 px-3 py-1 hover:bg-emerald-500">
                Apply
              </button>
            </div>
            {saveStatus && <p className="mt-3 text-xs text-slate-400">{saveStatus}</p>}
          </section>
        </>
      )}
    </div>
  )
}
