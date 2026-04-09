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
import { Save } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppComponentProps } from '@/kernel'
import { useWindowActions } from '@/kernel'
import { Spinner } from '@/components'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { VfsFilePickerModal } from '@/shell/FilePicker'
import { vfsApi } from '../explorer/api'

interface TextEditorState {
  mountId: string
  node: { path: string; name: string; is_dir: boolean }
}

function getFileLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    php: 'php', sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql', html: 'html', htm: 'html', css: 'css',
    xml: 'xml', json: 'json', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', md: 'markdown', markdown: 'markdown'
  }
  return map[ext] ?? 'text'
}

export default function TextEditor({ windowId, initialAppState }: AppComponentProps) {
  const appState = initialAppState as TextEditorState | undefined
  const [mountId, setMountId] = useState(appState?.mountId ?? '')
  const [node, setNode] = useState(appState?.node as { path: string; name: string; is_dir: boolean } | undefined)

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
  }, [mountId, node?.path])

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
  const handleOpenFile = useCallback((result: VfsPickerResult) => {
    const name = result.path.split('/').filter(Boolean).pop() ?? result.path
    setMountId(result.mountId)
    setNode({ path: result.path, name, is_dir: false })
    setTitle(name)
  }, [setTitle])

  // Register menus (uses useFileOpenMenu for "打开" + Ctrl+O)
  const isMac = /Mac/.test(navigator.userAgent)
  const { showFilePicker, closeFilePicker, handleFilePickerConfirm } = useFileOpenMenu({
    windowId,
    appId: 'text-editor',
    onOpenFile: handleOpenFile,
    extraFileItems: [
      {
        id: 'save',
        label: '保存',
        shortcut: isMac ? '⌘S' : 'Ctrl+S',
        action: () => handleSave(),
        disabled: !hasChanges
      }
    ]
  })

  // Line count
  const lineCount = content.split('\n').length

  if (!mountId || !node) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: 'var(--vos-bg-primary)', color: 'var(--vos-text-tertiary)' }}
      >
        <div className="text-center text-sm">
          <div>文本编辑器</div>
          <div className="text-xs mt-1">通过资源管理器打开文件</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: 'var(--vos-bg-primary)' }}
      >
        <Spinner size={20} />
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: 'var(--vos-bg-primary)', color: 'var(--vos-accent-danger)' }}
      >
        <div className="text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--vos-bg-primary)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
      >
        <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--vos-text-primary)' }}>
          {node.name}
          {hasChanges && <span style={{ color: 'var(--vos-accent-warning)', marginLeft: 4 }}>●</span>}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
          {language.toUpperCase()} · {lineCount} 行
        </span>
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
      </div>

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div
          className="flex-shrink-0 py-2 text-right select-none overflow-hidden"
          style={{
            width: 48,
            background: 'var(--vos-bg-surface)',
            color: 'var(--vos-text-tertiary)',
            fontSize: 12,
            lineHeight: '20px',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            borderRight: '0.5px solid var(--vos-border-subtle)',
            paddingRight: 8
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Text area */}
        <textarea
          ref={textareaRef}
          className="flex-1 p-2 resize-none border-none outline-none"
          style={{
            background: 'transparent',
            color: 'var(--vos-text-primary)',
            fontSize: 12,
            lineHeight: '20px',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            tabSize: 2
          }}
          value={content}
          onChange={e => setContent(e.target.value)}
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
