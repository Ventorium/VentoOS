/**
 * Text Editor — Simple text/code file editor
 *
 * Features:
 * - Load and edit text files from any VFS mount
 * - Save back to VFS
 * - Line numbers
 * - Keyboard shortcuts (Cmd/Ctrl+S to save)
 * - Unsaved changes indicator
 */

import { AnimatePresence } from 'framer-motion'
import { Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Spinner } from '@/components'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import type { AppComponentProps } from '@/kernel'
import { useWindowActions } from '@/kernel'
import { VfsFilePickerModal } from '@/shell/FilePicker'
import { vfsApi } from '../explorer/api'

interface TextEditorState {
  mountId: string
  node: { path: string; name: string; is_dir: boolean }
}

function getFileLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    html: 'html',
    htm: 'html',
    css: 'css',
    xml: 'xml',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    markdown: 'markdown'
  }
  return map[ext] ?? 'text'
}

export default function TextEditor({ windowId, initialAppState }: AppComponentProps) {
  const appState = initialAppState as TextEditorState | undefined
  const [mountId, setMountId] = useState(appState?.mountId ?? '')
  const [node, setNode] = useState(appState?.node as { path: string; name: string; is_dir: boolean } | undefined)
  const sourceUrl = (initialAppState?.sourceUrl as string) ?? ''
  const readOnly = (initialAppState?.readOnly as boolean) ?? false

  const { setTitle } = useWindowActions(windowId)

  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasChanges = content !== savedContent
  const language = node ? getFileLanguage(node.name) : 'text'

  // Load file content
  useEffect(() => {
    if (sourceUrl) {
      // Archive preview mode: fetch raw bytes and decode as text
      setLoading(true)
      setError(null)
      fetch(sourceUrl)
        .then(resp => {
          if (!resp.ok) throw new Error(`Failed to fetch: ${resp.statusText}`)
          return resp.text()
        })
        .then(text => {
          setContent(text)
          setSavedContent(text)
          setLoading(false)
        })
        .catch(err => {
          setError(String(err))
          setLoading(false)
        })
      return
    }
    if (!mountId || !node) return
    setLoading(true)
    setError(null)
    vfsApi
      .readVfsFile(mountId, node.path, 10 * 1024 * 1024) // 10MB limit
      .then(r => {
        const text = r.data.content ?? ''
        setContent(text)
        setSavedContent(text)
        setLoading(false)
      })
      .catch(err => {
        setError(String(err))
        setLoading(false)
      })
  }, [mountId, node?.path, sourceUrl])

  // Save file
  const handleSave = useCallback(async () => {
    if (!mountId || !node || !hasChanges) return
    setSaving(true)
    try {
      await vfsApi.writeVfsFile(mountId, node.path, content)
      setSavedContent(content)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [mountId, node, content, hasChanges])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // In-place file open handler
  const handleOpenFile = useCallback(
    (result: VfsPickerResult) => {
      const name = result.path.split('/').filter(Boolean).pop() ?? result.path
      setMountId(result.mountId)
      setNode({ path: result.path, name, is_dir: false })
      setTitle(name)
    },
    [setTitle]
  )

  const isMac = /Mac/.test(navigator.userAgent)
  const extraFileItems = useMemo(
    () => [
      {
        id: 'save',
        label: '保存',
        shortcut: isMac ? '⌘S' : 'Ctrl+S',
        action: () => handleSave(),
        disabled: !hasChanges
      }
    ],
    [isMac, handleSave, hasChanges]
  )

  // Register menus (uses useFileOpenMenu for "打开" + Ctrl+O)
  const { showFilePicker, closeFilePicker, handleFilePickerConfirm } = useFileOpenMenu({
    windowId,
    appId: 'text-editor',
    onOpenFile: handleOpenFile,
    extraFileItems
  })

  // Line count
  const lineCount = content.split('\n').length

  if (!sourceUrl && (!mountId || !node)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--vos-bg-primary)] text-[var(--vos-text-tertiary)]">
        <div className="text-center text-sm">
          <div>文本编辑器</div>
          <div className="text-xs mt-1">通过资源管理器打开文件</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--vos-bg-primary)]">
        <Spinner size={20} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--vos-bg-primary)] text-[var(--vos-accent-danger)]">
        <div className="text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--vos-bg-primary)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0 [border-bottom:0.5px_solid_var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]">
        <span className="text-xs font-medium flex-1 truncate text-[var(--vos-text-primary)]">
          {(initialAppState?.fileName as string) ?? node?.name ?? ''}
          {!readOnly && hasChanges && <span className="text-[var(--vos-accent-warning)] ml-1">●</span>}
        </span>
        <span className="text-[10px] text-[var(--vos-text-tertiary)]">
          {language.toUpperCase()} · {lineCount} 行
          {readOnly && <span className="ml-1 text-[var(--vos-accent-warning)]">只读</span>}
        </span>
        {!readOnly && (
          <button
            type="button"
            className="vos-btn-reset flex items-center gap-1 px-2 py-0.5 rounded text-xs"
            style={{
              background: hasChanges ? 'var(--vos-accent-primary)' : 'var(--vos-bg-input)',
              color: hasChanges ? '#fff' : 'var(--vos-text-tertiary)',
              cursor: hasChanges ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1
            }}
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            <Save size={11} />
            {saving ? '保存中…' : '保存'}
          </button>
        )}
      </div>

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div className="flex-shrink-0 py-2 pr-2 text-right select-none overflow-hidden w-[48px] bg-[var(--vos-bg-surface)] text-[var(--vos-text-tertiary)] text-[12px] leading-[20px] font-mono [border-right:0.5px_solid_var(--vos-border-subtle)]">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Text area */}
        <textarea
          ref={textareaRef}
          className="flex-1 p-2 resize-none border-none outline-none bg-transparent text-[var(--vos-text-primary)] text-[12px] leading-[20px] font-mono [tab-size:2]"
          value={content}
          onChange={e => setContent(e.target.value)}
          readOnly={readOnly}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          wrap="off"
        />
      </div>
      <AnimatePresence>
        {showFilePicker && (
          <VfsFilePickerModal mode="file" onConfirm={handleFilePickerConfirm} onClose={closeFilePicker} />
        )}
      </AnimatePresence>
    </div>
  )
}
