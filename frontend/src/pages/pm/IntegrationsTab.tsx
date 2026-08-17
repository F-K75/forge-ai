import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Plug, Plus, Trash2, ExternalLink, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { initiativesApi } from "../../lib/pmApi";
import { motion, motionVariants } from "../../lib/animations";

const PROVIDERS = [
  { id: "github", label: "GitHub", description: "Sync issues and PRs", icon: "🐙" },
  { id: "jira", label: "Jira", description: "Sync epics and tickets", icon: "📋" },
  { id: "linear", label: "Linear", description: "Sync issues and cycles", icon: "🔵" },
  { id: "slack", label: "Slack", description: "Post updates to a channel", icon: "💬" },
] as const;

type ProviderId = typeof PROVIDERS[number]["id"];

interface IntegrationRecord {
  provider?: string
  status?: string
  external_project_id?: string
  external_project_name?: string
  external_repo_id?: string
  external_repo_name?: string
  channel_id?: string
  channel_name?: string
}

export default function IntegrationsTab() {
  const { initiativeId } = useParams<{ initiativeId: string }>()
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState<ProviderId | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true)
    try {
      const items = await initiativesApi.integrations.list(initiativeId || "")
      setIntegrations(items as IntegrationRecord[])
    } catch {
      toast.error("Couldn't load integrations.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [initiativeId])

  const handleLink = async (provider: ProviderId) => {
    try {
      setLinking(provider)
      await initiativesApi.integrations.link(initiativeId || "", {
        provider,
        external_project_id: form.external_project_id || `${provider}-project`,
        external_project_name: form.external_project_name || `${provider} Project`,
        external_repo_id: form.external_repo_id || "",
        external_repo_name: form.external_repo_name || "",
        channel_id: form.channel_id || "",
        channel_name: form.channel_name || "",
      })
      toast.success(`Connected ${provider}`)
      setForm({})
      await load()
    } catch {
      toast.error("Couldn't link that integration.")
    } finally {
      setLinking(null)
    }
  }

  const handleUnlink = async (provider: ProviderId) => {
    try {
      await initiativesApi.integrations.unlink(initiativeId || "", provider)
      toast.success(`Disconnected ${provider}`)
      await load()
    } catch {
      toast.error("Couldn't unlink that integration.")
    }
  }

  const linkedProviders = new Set((integrations as Array<{ provider?: string }>).map(i => (i.provider || "").toLowerCase()))

  return (
    <motion.div className="mx-auto max-w-5xl px-4 py-6 md:px-8 space-y-6" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Plug size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Integrations</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PROVIDERS.map(provider => {
          const linked = linkedProviders.has(provider.id)
          const integration = integrations.find(i => (i.provider || "").toLowerCase() === provider.id)
          return (
            <motion.div
              key={provider.id}
              className="rounded-2xl border border-inlay bg-inlay-subtle p-4 backdrop-blur-xl"
              variants={motionVariants.fadeUp}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{provider.icon} {provider.label}</p>
                  <p className="text-xs text-faint">{provider.description}</p>
                </div>
                <span className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium ${linked ? "bg-ok/10 text-ok" : "bg-inlay-hover text-muted"}`}>
                  {linked ? <CheckCircle2 size={12} aria-hidden="true" /> : <XCircle size={12} aria-hidden="true" />}
                  {linked ? (integration?.status === "connected" ? "Connected" : "Pending") : "Not connected"}
                </span>
              </div>

              {linked && integration ? (
                <div className="space-y-1 mb-3">
                  <p className="text-xs text-muted">Project: {(integration.external_project_name as string) || integration.external_project_id}</p>
                  {(integration.external_repo_name as string) || integration.external_repo_id ? (
                    <p className="text-xs text-muted">Repo: {(integration.external_repo_name as string) || integration.external_repo_id}</p>
                  ) : null}
                  {(integration.channel_name as string) || integration.channel_id ? (
                    <p className="text-xs text-muted">Channel: {(integration.channel_name as string) || integration.channel_id}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                {!linked ? (
                  <>
                    <input
                      type="text"
                      placeholder="Project ID"
                      value={form.external_project_id || ""}
                      onChange={e => setForm({ ...form, external_project_id: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-inlay-strong bg-inlay px-3 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    />
                    <button
                      type="button"
                      onClick={() => handleLink(provider.id)}
                      disabled={linking === provider.id}
                      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {linking === provider.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                      Connect
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUnlink(provider.id)}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-inlay-strong bg-inlay px-3 text-xs font-medium text-ink hover:bg-inlay-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Disconnect
                  </button>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
