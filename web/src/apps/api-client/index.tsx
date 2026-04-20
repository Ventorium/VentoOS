import { useEffect } from 'react'
import type { AppComponentProps } from '@/kernel'
import { useApiClientStore } from './store'
import TabBar from './components/TabBar'
import Sidebar from './components/Sidebar'
import RequestEditor from './components/RequestEditor'

export default function ApiClientApp({ windowId }: AppComponentProps) {
  const tabs = useApiClientStore((s) => s.tabs)
  const addTab = useApiClientStore((s) => s.addTab)

  // Add a default tab if none exist
  useEffect(() => {
    if (tabs.length === 0) {
      addTab()
    }
  }, [])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--vos-bg-surface)' }}>
      <TabBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <RequestEditor />
      </div>
    </div>
  )
}
