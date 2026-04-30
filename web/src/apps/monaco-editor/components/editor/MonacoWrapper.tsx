import type { Monaco } from '@monaco-editor/react'
import MonacoEditor from '@monaco-editor/react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import { useCallback, useEffect, useRef } from 'react'
import { useSettingsStore } from '@/services/settings/store'
import { vfsApi } from '../../../explorer/api'
import { useEditorStore } from '../../stores/editor-store'
import { registerVosThemes } from '../../utils/monaco-themes'

interface Props {
  /** Ref for external access to the Monaco editor instance */
  editorRef: React.MutableRefObject<MonacoEditorNS.IStandaloneCodeEditor | null>
  /** Called on mount to wire up external actions */
  onMount?: (editor: MonacoEditorNS.IStandaloneCodeEditor, monaco: Monaco) => void
}

export default function MonacoWrapper({ editorRef, onMount }: Props) {
  const activeTab = useEditorStore(s => s.getActiveTab())
  const updateTabContent = useEditorStore(s => s.updateTabContent)
  const markTabSaved = useEditorStore(s => s.markTabSaved)
  const setCursorPos = useEditorStore(s => s.setCursorPos)
  const resolvedTheme = useSettingsStore(s => s.resolvedTheme)
  const saveRef = useRef<() => void>(() => {})

  // Keep saveRef up to date
  useEffect(() => {
    saveRef.current = async () => {
      const tab = useEditorStore.getState().getActiveTab()
      if (!tab || tab.readOnly) return
      const content = editorRef.current?.getValue() ?? tab.content
      if (content === tab.savedContent && !tab.isNew) return
      try {
        await vfsApi.writeVfsFile(tab.mountId, tab.node.path, content)
        markTabSaved(tab.id, content)
      } catch (e) {
        console.error('Save failed:', e)
      }
    }
  }, [editorRef, markTabSaved])

  const handleChange = useCallback(
    (value: string | undefined) => {
      const tabId = useEditorStore.getState().activeTabId
      if (value === undefined || !tabId) return
      updateTabContent(tabId, value)
    },
    [updateTabContent]
  )

  const handleMount = useCallback(
    (editor: MonacoEditorNS.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor
      registerVosThemes(monaco)
      monaco.editor.setTheme(resolvedTheme === 'dark' ? 'vos-dark' : 'vos-light')

      editor.addAction({
        id: 'vos-save',
        label: '保存',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => saveRef.current()
      })
      editor.addAction({
        id: 'vos-format',
        label: '格式化文档',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        run: e => e.getAction('editor.action.formatDocument')?.run()
      })
      editor.onDidChangeCursorPosition(e => {
        setCursorPos(e.position.lineNumber, e.position.column)
      })

      onMount?.(editor, monaco)
    },
    [editorRef, resolvedTheme, setCursorPos, onMount]
  )

  // Sync theme when system theme changes
  useEffect(() => {
    const monaco = (window as Record<string, unknown>).monaco as { editor: typeof MonacoEditorNS } | undefined
    if (monaco) {
      registerVosThemes(monaco)
      monaco.editor.setTheme(resolvedTheme === 'dark' ? 'vos-dark' : 'vos-light')
    }
  }, [resolvedTheme])

  if (!activeTab) return null

  return (
    <MonacoEditor
      key={activeTab.id}
      height="100%"
      language={activeTab.language}
      value={activeTab.content}
      theme={resolvedTheme === 'dark' ? 'vos-dark' : 'vos-light'}
      options={{
        readOnly: activeTab?.readOnly ?? false,
        fontSize: 13,
        fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, Menlo, monospace',
        fontLigatures: true,
        minimap: { enabled: true, scale: 1, showSlider: 'mouseover' },
        lineNumbers: 'on',
        wordWrap: 'off',
        scrollBeyondLastLine: true,
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        renderWhitespace: 'boundary',
        bracketPairColorization: { enabled: true },
        guides: { indentation: true, bracketPairs: true },
        padding: { top: 8, bottom: 8 },
        smoothScrolling: true,
        cursorBlinking: 'phase',
        cursorSmoothCaretAnimation: 'on',
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        overviewRulerLanes: 3,
        renderLineHighlight: 'all',
        suggest: { showIcons: true },
        quickSuggestions: { other: true, comments: false, strings: false },
        parameterHints: { enabled: true },
        formatOnPaste: true,
        stickyScroll: { enabled: true },
        linkedEditing: true
      }}
      onMount={handleMount}
      onChange={handleChange}
    />
  )
}
