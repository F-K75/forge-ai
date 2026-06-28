import { lazy, Suspense, useMemo, useState, useEffect } from 'react'
import { FileCode, ChevronRight, Folder } from 'lucide-react'
import clsx from 'clsx'
import { useBuildStore } from '../../store/buildStore'

const Editor = lazy(() => import('@monaco-editor/react'))

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', css: 'css', json: 'json', md: 'markdown',
    html: 'html', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    txt: 'plaintext', sh: 'shell',
  }
  return map[ext || ''] || 'plaintext'
}

function buildFileTree(files: Record<string, string>) {
  const tree: Record<string, string[]> = {}
  Object.keys(files).forEach(path => {
    const parts = path.split('/')
    const dir = parts.slice(0, -1).join('/') || 'root'
    tree[dir] = [...(tree[dir] || []), path]
  })
  return tree
}

function EditorSkeleton() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-forge-text-secondary">Loading editor...</p>
      </div>
    </div>
  )
}

export function FileEditor() {
  const { files, status } = useBuildStore()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [localFiles, setLocalFiles] = useState<Record<string, string>>({})

  const allFiles = useMemo(() => ({ ...files, ...localFiles }), [files, localFiles])
  const fileList = useMemo(() => Object.keys(allFiles).sort(), [allFiles])
  const tree = useMemo(() => buildFileTree(allFiles), [allFiles])

  useEffect(() => {
    if (!selectedFile && fileList.length > 0) {
      setSelectedFile(fileList[0])
    }
  }, [fileList, selectedFile])


  if (fileList.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="bb-panel w-full max-w-md p-8 flex flex-col items-center text-center gap-3">
          <FileCode size={32} className="opacity-40" />
          <p className="text-sm font-medium">Files will appear here</p>
          <p className="text-xs text-forge-text-secondary">
            As agents generate code, your project files will show up in this editor.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-56 flex-shrink-0 border-r border-forge-border overflow-y-auto bg-forge-surface">
        <div className="px-4 py-2 text-[10px] font-semibold text-forge-text-secondary uppercase tracking-wider border-b border-forge-border">
          Files ({fileList.length})
        </div>
        <div className="py-1">
          {Object.entries(tree).map(([dir, paths]) => (
            <div key={dir}>
              {dir !== 'root' && (
                <div className="flex items-center gap-1 px-2 py-1">
                  <Folder size={12} className="text-forge-muted" />
                  <span className="text-[11px] text-forge-text-secondary truncate">{dir}</span>
                </div>
              )}
              {paths.map(path => {
                const name = path.split('/').pop() || path
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setSelectedFile(path)}
                    aria-label={`Open ${name}`}
                    aria-pressed={selectedFile === path}
                    className={clsx(
                      'w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors',
                      'bb-focus-ring',
                      dir !== 'root' && 'pl-6',
                      selectedFile === path
                        ? 'bg-violet-600/20 text-violet-200'
                        : 'text-forge-text-secondary hover:bg-forge-border/30 hover:text-forge-text'
                    )}
                  >
                    <FileCode size={11} className="flex-shrink-0" />
                    <span className="text-[11px] truncate">{name}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedFile && allFiles[selectedFile] !== undefined ? (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 border-b border-forge-border bg-forge-surface text-[11px] text-forge-text-secondary font-mono flex items-center gap-2">
              <ChevronRight size={11} className="opacity-80" />
              <span className="truncate">{selectedFile}</span>
            </div>
            <div className="flex-1">
              <Suspense fallback={<EditorSkeleton />}>
                <Editor
                  height="100%"
                  language={getLanguage(selectedFile)}
                  value={allFiles[selectedFile]}
                  theme="vs-dark"
                  onChange={(val) => {
                    if (val !== undefined) {
                      setLocalFiles(prev => ({ ...prev, [selectedFile]: val }))
                    }
                  }}
                  options={{
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono, Fira Code, monospace',
                    minimap: { enabled: false },
                    padding: { top: 12, bottom: 12 },
                    scrollBeyondLastLine: false,
                    renderLineHighlight: 'none',
                    lineNumbers: 'on',
                    tabSize: 2,
                    wordWrap: 'on',
                  }}
                />
              </Suspense>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full p-6">
            <div className="bb-panel w-full max-w-md p-10 text-center">
              <p className="text-sm font-medium">Select a file</p>
              <p className="text-xs text-forge-text-secondary mt-1">
                Choose a file from the left to edit its contents.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}