import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { motionVariants } from '../lib/animations'
import { presets } from '../lib/animationPresets'
import { promptsApi, type PromptTemplatePayload, type PromptContextPayload } from '../lib/api'

interface TemplateSummary {
  role: string
  version: string
  required_inputs: string[]
}

interface PromptMetadata {
  agent: string
  template_version: string
  estimated_tokens: number
  context_sources: string[]
  build_time_ms: number
  prompt_hash: string
}

interface ValidationIssue {
  code: string
  message: string
  severity: string
}

const EMPTY_TEMPLATE: PromptTemplatePayload = {
  role: '',
  version: 'v1',
  identity: '',
  responsibilities: [],
  goals: [],
  constraints: [],
  required_inputs: [],
  output_format: '',
  quality_rules: [],
}

const toLines = (items: string[]) => items.join('\n')
const fromLines = (text: string) =>
  text.split('\n').map(line => line.trim()).filter(Boolean)

function ListField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label} (one per line)</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="rounded bg-slate-800 px-2 py-1 font-mono text-xs"
      />
    </label>
  )
}

export default function PromptStudioPage() {
  const reduceMotion = useReducedMotion()
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)

  // Template editor state — list fields held as newline-joined strings while editing
  const [selected, setSelected] = useState<{ role: string; version: string } | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState({
    ...EMPTY_TEMPLATE,
    responsibilities: '',
    goals: '',
    constraints: '',
    required_inputs: '',
    quality_rules: '',
  })
  const [editorStatus, setEditorStatus] = useState<string | null>(null)

  // Playground state
  const [pgRole, setPgRole] = useState('')
  const [pgVersion, setPgVersion] = useState('v1')
  const [pgTask, setPgTask] = useState('')
  const [pgUserRequest, setPgUserRequest] = useState('')
  const [pgProjectName, setPgProjectName] = useState('')
  const [pgTechStack, setPgTechStack] = useState('')
  const [pgArchitecture, setPgArchitecture] = useState('')
  const [pgMilestone, setPgMilestone] = useState('')
  const [pgBusy, setPgBusy] = useState(false)
  const [pgError, setPgError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ prompt: string; metadata: PromptMetadata } | null>(null)
  const [validation, setValidation] = useState<{ is_valid: boolean; errors: ValidationIssue[] } | null>(null)

  const loadTemplates = () => {
    setLoading(true)
    promptsApi.templates()
      .then((data) => {
        const list: TemplateSummary[] = data.templates || []
        setTemplates(list)
        if (list.length && !pgRole) {
          setPgRole(list[0].role)
          setPgVersion(list[0].version)
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openTemplate = async (role: string, version: string) => {
    setEditorStatus(null)
    setIsNew(false)
    try {
      const t = await promptsApi.template(role, version)
      setSelected({ role, version })
      setForm({
        role: t.role,
        version: t.version,
        identity: t.identity || '',
        responsibilities: toLines(t.responsibilities || []),
        goals: toLines(t.goals || []),
        constraints: toLines(t.constraints || []),
        required_inputs: toLines(t.required_inputs || []),
        output_format: t.output_format || '',
        quality_rules: toLines(t.quality_rules || []),
      })
    } catch {
      setEditorStatus('Failed to load template')
    }
  }

  const startNew = () => {
    setSelected(null)
    setIsNew(true)
    setEditorStatus(null)
    setForm({
      ...EMPTY_TEMPLATE,
      responsibilities: '',
      goals: '',
      constraints: '',
      required_inputs: '',
      quality_rules: '',
    })
  }

  const payloadFromForm = (): PromptTemplatePayload => ({
    role: form.role.trim(),
    version: form.version.trim(),
    identity: form.identity,
    responsibilities: fromLines(form.responsibilities),
    goals: fromLines(form.goals),
    constraints: fromLines(form.constraints),
    required_inputs: fromLines(form.required_inputs),
    output_format: form.output_format,
    quality_rules: fromLines(form.quality_rules),
  })

  const saveTemplate = async () => {
    const payload = payloadFromForm()
    if (!payload.role || !payload.version) {
      setEditorStatus('Role and version are required')
      return
    }
    setEditorStatus('Saving…')
    try {
      if (isNew) {
        await promptsApi.createTemplate(payload)
        setIsNew(false)
        setSelected({ role: payload.role, version: payload.version })
      } else if (selected) {
        await promptsApi.updateTemplate(selected.role, selected.version, payload)
      }
      setEditorStatus('Saved')
      loadTemplates()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setEditorStatus(typeof detail === 'string' ? detail : 'Failed to save')
    }
  }

  const deleteTemplate = async () => {
    if (!selected) return
    if (!window.confirm(`Delete template ${selected.role}/${selected.version}?`)) return
    setEditorStatus('Deleting…')
    try {
      await promptsApi.deleteTemplate(selected.role, selected.version)
      setSelected(null)
      setEditorStatus(null)
      loadTemplates()
    } catch {
      setEditorStatus('Failed to delete')
    }
  }

  const buildContext = (): PromptContextPayload => ({
    agent_role: pgRole,
    template_version: pgVersion,
    task: pgTask,
    user_request: pgUserRequest,
    project_state: {
      project_name: pgProjectName || undefined,
      tech_stack: pgTechStack ? pgTechStack.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      architecture_summary: pgArchitecture || undefined,
      current_milestone: pgMilestone || undefined,
    },
  })

  const runPreview = async () => {
    setPgBusy(true)
    setPgError(null)
    setValidation(null)
    try {
      const result = await promptsApi.preview(buildContext())
      setPreview(result)
    } catch (err: unknown) {
      setPreview(null)
      const detail = (err as { response?: { data?: { detail?: { message?: string } | string } } })?.response?.data?.detail
      setPgError(typeof detail === 'string' ? detail : detail?.message || 'Preview failed')
    } finally {
      setPgBusy(false)
    }
  }

  const runValidate = async () => {
    setPgBusy(true)
    setPgError(null)
    try {
      const result = await promptsApi.validate(buildContext())
      setValidation(result)
    } catch (err: unknown) {
      setValidation(null)
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPgError(typeof detail === 'string' ? detail : 'Validation request failed')
    } finally {
      setPgBusy(false)
    }
  }

  const roles = [...new Set(templates.map(t => t.role))]
  const versionsForRole = templates.filter(t => t.role === pgRole).map(t => t.version)

  return (
    <motion.div
      className="p-8 text-sm text-slate-200"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <h1 className="text-2xl font-semibold">Prompt Studio</h1>
      <p className="mt-2 text-slate-400">
        Prompt Builder templates and a preview playground — the first layer of the Prompt Builder → Optimizer → Gateway pipeline.
      </p>

      {loading ? (
        <p className="mt-6">Loading…</p>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {/* Templates column */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Templates</h2>
              <button onClick={startNew} className="rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700">
                New template
              </button>
            </div>
            <motion.div
              className="mt-3 flex flex-wrap gap-2"
              variants={reduceMotion ? undefined : motionVariants.staggerContainer}
              initial={reduceMotion ? false : 'hidden'}
              animate="visible"
            >
              {templates.map((t) => (
                <motion.button
                  key={`${t.role}-${t.version}`}
                  onClick={() => openTemplate(t.role, t.version)}
                  variants={motionVariants.staggerItem}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={`rounded-full px-3 py-1 text-xs ${
                    selected?.role === t.role && selected?.version === t.version
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  {t.role} / {t.version}
                </motion.button>
              ))}
              {!templates.length && <p className="text-slate-400">No templates registered.</p>}
            </motion.div>

            {(selected || isNew) && (
              <motion.div
                className="mt-4 space-y-3 rounded-lg border border-slate-800 bg-slate-900/70 p-4"
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <div className="flex gap-3">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-xs text-slate-400">Role</span>
                    <input
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      disabled={!isNew}
                      className="rounded bg-slate-800 px-2 py-1 disabled:opacity-60"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-xs text-slate-400">Version</span>
                    <input
                      value={form.version}
                      onChange={(e) => setForm({ ...form, version: e.target.value })}
                      disabled={!isNew}
                      className="rounded bg-slate-800 px-2 py-1 disabled:opacity-60"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Identity</span>
                  <textarea
                    value={form.identity}
                    onChange={(e) => setForm({ ...form, identity: e.target.value })}
                    rows={2}
                    className="rounded bg-slate-800 px-2 py-1"
                  />
                </label>
                <ListField label="Responsibilities" value={form.responsibilities} onChange={(v) => setForm({ ...form, responsibilities: v })} />
                <ListField label="Goals" value={form.goals} onChange={(v) => setForm({ ...form, goals: v })} />
                <ListField label="Constraints" value={form.constraints} onChange={(v) => setForm({ ...form, constraints: v })} />
                <ListField label="Required inputs" value={form.required_inputs} onChange={(v) => setForm({ ...form, required_inputs: v })} />
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Output format</span>
                  <textarea
                    value={form.output_format}
                    onChange={(e) => setForm({ ...form, output_format: e.target.value })}
                    rows={2}
                    className="rounded bg-slate-800 px-2 py-1"
                  />
                </label>
                <ListField label="Quality rules" value={form.quality_rules} onChange={(v) => setForm({ ...form, quality_rules: v })} />
                <div className="flex items-center gap-3">
                  <motion.button onClick={saveTemplate} className="rounded bg-emerald-600 px-3 py-1 hover:bg-emerald-500" {...presets.button}>
                    {isNew ? 'Create' : 'Save'}
                  </motion.button>
                  {!isNew && (
                    <button onClick={deleteTemplate} className="rounded bg-rose-700/70 px-3 py-1 hover:bg-rose-600">
                      Delete
                    </button>
                  )}
                  {editorStatus && <span className="text-xs text-slate-400">{editorStatus}</span>}
                </div>
              </motion.div>
            )}
          </section>

          {/* Playground column */}
          <section>
            <h2 className="text-lg font-medium">Preview Playground</h2>
            <p className="mt-1 text-xs text-slate-400">
              Builds the exact prompt an agent would receive — a dry run, nothing is sent to a provider.
            </p>
            <div className="mt-3 space-y-3 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-slate-400">Agent role</span>
                  <select
                    value={pgRole}
                    onChange={(e) => {
                      setPgRole(e.target.value)
                      const first = templates.find(t => t.role === e.target.value)
                      if (first) setPgVersion(first.version)
                    }}
                    className="rounded bg-slate-800 px-2 py-1"
                  >
                    {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-slate-400">Template version</span>
                  <select
                    value={pgVersion}
                    onChange={(e) => setPgVersion(e.target.value)}
                    className="rounded bg-slate-800 px-2 py-1"
                  >
                    {versionsForRole.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Task</span>
                <textarea
                  value={pgTask}
                  onChange={(e) => setPgTask(e.target.value)}
                  rows={2}
                  placeholder="e.g. Implement the login endpoint"
                  className="rounded bg-slate-800 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">User request</span>
                <textarea
                  value={pgUserRequest}
                  onChange={(e) => setPgUserRequest(e.target.value)}
                  rows={2}
                  className="rounded bg-slate-800 px-2 py-1"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Project name</span>
                  <input value={pgProjectName} onChange={(e) => setPgProjectName(e.target.value)} className="rounded bg-slate-800 px-2 py-1" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Tech stack (comma-separated)</span>
                  <input value={pgTechStack} onChange={(e) => setPgTechStack(e.target.value)} placeholder="react, fastapi" className="rounded bg-slate-800 px-2 py-1" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Architecture summary</span>
                  <input value={pgArchitecture} onChange={(e) => setPgArchitecture(e.target.value)} className="rounded bg-slate-800 px-2 py-1" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Current milestone</span>
                  <input value={pgMilestone} onChange={(e) => setPgMilestone(e.target.value)} className="rounded bg-slate-800 px-2 py-1" />
                </label>
              </div>
              <div className="flex items-center gap-3">
                <motion.button onClick={runPreview} disabled={pgBusy || !pgRole} className="rounded bg-emerald-600 px-3 py-1 hover:bg-emerald-500 disabled:opacity-50" {...presets.button}>
                  Preview prompt
                </motion.button>
                <button onClick={runValidate} disabled={pgBusy || !pgRole} className="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700 disabled:opacity-50">
                  Validate context
                </button>
                {pgBusy && <span className="text-xs text-slate-400">Working…</span>}
              </div>
              {pgError && <p className="text-xs text-rose-400">{pgError}</p>}
            </div>

            {validation && (
              <motion.div
                className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-4"
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <p className={validation.is_valid ? 'text-emerald-400' : 'text-rose-400'}>
                  {validation.is_valid ? 'Context is valid for this template.' : 'Context has problems:'}
                </p>
                {validation.errors.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {validation.errors.map((e, i) => (
                      <li key={i} className={e.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}>
                        [{e.severity}] {e.code}: {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}

            {preview && (
              <motion.div
                className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-4"
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="rounded-full bg-slate-800 px-2 py-1">~{preview.metadata.estimated_tokens} tokens</span>
                  <span className="rounded-full bg-slate-800 px-2 py-1">{preview.metadata.build_time_ms.toFixed(1)} ms build</span>
                  <span className="rounded-full bg-slate-800 px-2 py-1">hash {preview.metadata.prompt_hash}</span>
                  {preview.metadata.context_sources.map((s) => (
                    <span key={s} className="rounded-full bg-indigo-500/20 px-2 py-1 text-indigo-300">{s}</span>
                  ))}
                </div>
                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 font-mono text-xs text-slate-300">
                  {preview.prompt}
                </pre>
              </motion.div>
            )}
          </section>
        </div>
      )}
    </motion.div>
  )
}
