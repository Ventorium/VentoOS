import type { editor as MonacoEditorNS } from 'monaco-editor'
import { useRef } from 'react'
import { Spinner } from '@/components'
import { useEditorStore } from '../../stores/editor-store'
import Breadcrumbs from './Breadcrumbs'
import EditorTabs from './EditorTabs'
import MonacoWrapper from './MonacoWrapper'
import WelcomePage from './WelcomePage'

export default function EditorArea() {
  const activeTab = useEditorStore(s => s.getActiveTab())
  const loadingFile = useEditorStore(s => s.loadingFile)
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null)

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Tab Bar */}
      <EditorTabs />

      {/* Breadcrumb */}
      <Breadcrumbs />

      {/* Monaco / Welcome / Loading */}
      <div className="flex-1 relative overflow-hidden">
        {loadingFile ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : !activeTab ? (
          <WelcomePage />
        ) : (
          <MonacoWrapper editorRef={editorRef} />
        )}
      </div>
    </div>
  )
}
