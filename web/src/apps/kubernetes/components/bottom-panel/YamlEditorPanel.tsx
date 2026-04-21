import Editor from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components'
import { k8sApi } from '../../api'
import type { K8sResourceKind } from '../../types'

interface Props {
  clusterId: string
  namespace: string
  kind: K8sResourceKind
  name: string
}

export function YamlEditorPanel({ clusterId, namespace, kind, name }: Props) {
  const [yaml, setYaml] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    setLoading(true)
    k8sApi
      .getK8sResourceYaml(clusterId, kind, name, namespace)
      .then(r => setYaml(typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2)))
      .catch(() => setYaml('# Failed to load YAML'))
      .finally(() => setLoading(false))
  }, [clusterId, namespace, kind, name])

  const handleSave = async () => {
    const content = editorRef.current?.getValue() ?? yaml
    setSaving(true)
    try {
      await k8sApi.updateK8sResourceYaml(clusterId, kind, name, namespace, content)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={20} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Info bar */}
      <div className="flex items-center h-7 px-3 text-[11px] border-b-[0.5px] border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)] flex-shrink-0">
        <span className="text-[var(--vos-text-tertiary)]">
          Editing kubernetes {kind} <span className="text-[var(--vos-accent-primary)]">{name}</span> in namespace{' '}
          <span className="text-[var(--vos-accent-primary)]">{namespace}</span>
        </span>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-2 py-0.5 rounded text-[10px] bg-[var(--vos-accent-primary)] text-white disabled:opacity-50"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="px-2 py-0.5 rounded text-[10px] border-[0.5px] border-[var(--vos-border-subtle)] hover:bg-[var(--vos-bg-item-hover)]"
            onClick={() => {
              // TODO: diff
            }}
          >
            Diff
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          key={`${clusterId}-${kind}-${name}`}
          height="100%"
          defaultLanguage="yaml"
          value={yaml}
          theme="vs-dark"
          options={{
            minimap: { enabled: true },
            automaticLayout: true,
            fontSize: 13,
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            scrollBeyondLastLine: false
          }}
          onMount={editor => {
            editorRef.current = editor
          }}
        />
      </div>
    </div>
  )
}
