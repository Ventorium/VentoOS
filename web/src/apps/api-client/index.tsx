import { BookOpen, Radio, Send, Wifi } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AppSidebar } from '@/components/AppSidebar'
import type { AppComponentProps } from '@/kernel'
import { useAppStateSync } from '@/kernel/window/useAppStateSync'
import type { ContextMenuItems } from '@/shell/ContextMenu/store'
import ApiClientGuide from './components/ApiClientGuide'
import MqttWorkbench from './components/MqttWorkbench'
import RequestEditor from './components/RequestEditor'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import WebSocketWorkbench from './components/WebSocketWorkbench'
import { useApiClientStore } from './store'
import type { ApiClientPersistedState, ProtocolView } from './types'

const PROTOCOL_ITEMS: Array<{ id: Exclude<ProtocolView, 'guide'>; label: string; icon: typeof Send }> = [
  { id: 'http', label: 'HTTP', icon: Send },
  { id: 'websocket', label: 'WebSocket', icon: Wifi },
  { id: 'mqtt', label: 'MQTT', icon: Radio }
]

export default function ApiClientApp({ windowId, initialAppState }: AppComponentProps) {
  const tabs = useApiClientStore(s => s.tabs)
  const activeTabId = useApiClientStore(s => s.activeTabId)
  const sidebarTab = useApiClientStore(s => s.sidebarTab)
  const activeEnvironmentId = useApiClientStore(s => s.activeEnvironmentId)
  const responses = useApiClientStore(s => s.responses)
  const activeView = useApiClientStore(s => s.activeView)
  const hiddenProtocols = useApiClientStore(s => s.hiddenProtocols)
  const websocket = useApiClientStore(s => s.websocket)
  const mqtt = useApiClientStore(s => s.mqtt)
  const addTab = useApiClientStore(s => s.addTab)
  const setActiveView = useApiClientStore(s => s.setActiveView)
  const setHiddenProtocols = useApiClientStore(s => s.setHiddenProtocols)
  const hydrateAppState = useApiClientStore(s => s.hydrateAppState)
  const [hasRestoredState, setHasRestoredState] = useState(false)

  const persistedAppState = useMemo<ApiClientPersistedState>(
    () => ({
      tabs,
      activeTabId,
      sidebarTab,
      activeEnvironmentId,
      responses,
      activeView,
      hiddenProtocols,
      websocket,
      mqtt
    }),
    [tabs, activeTabId, sidebarTab, activeEnvironmentId, responses, activeView, hiddenProtocols, websocket, mqtt]
  )

  useEffect(() => {
    hydrateAppState(initialAppState)
    setHasRestoredState(true)
  }, [hydrateAppState, initialAppState])

  useAppStateSync(windowId, persistedAppState, [persistedAppState])

  // Add a default tab if none exist
  useEffect(() => {
    if (hasRestoredState && tabs.length === 0) {
      addTab()
    }
  }, [addTab, hasRestoredState, tabs.length])

  const visibleProtocolItems = useMemo(
    () => PROTOCOL_ITEMS.filter(item => !hiddenProtocols.includes(item.id)),
    [hiddenProtocols]
  )

  useEffect(() => {
    if (activeView === 'guide') {
      return
    }

    if (visibleProtocolItems.some(item => item.id === activeView)) {
      return
    }

    setActiveView(visibleProtocolItems[0]?.id ?? 'guide')
  }, [activeView, visibleProtocolItems])

  const makeVisibilityMenu = (currentId: string): ContextMenuItems => [
    {
      id: `open-${currentId}`,
      label: `Open ${PROTOCOL_ITEMS.find(item => item.id === currentId)?.label ?? currentId}`,
      action: () => setActiveView(currentId as ProtocolView)
    },
    {
      id: `hide-${currentId}`,
      label: `Hide ${PROTOCOL_ITEMS.find(item => item.id === currentId)?.label ?? currentId}`,
      disabled: visibleProtocolItems.length <= 1,
      action: () => {
        setHiddenProtocols([...new Set([...hiddenProtocols, currentId as Exclude<ProtocolView, 'guide'>])])
      }
    },
    { type: 'separator' },
    {
      id: 'toggle-views',
      label: 'Configure views',
      submenu: PROTOCOL_ITEMS.map(item => ({
        id: `toggle-${item.id}`,
        label: hiddenProtocols.includes(item.id) ? `Show ${item.label}` : `Hide ${item.label}`,
        disabled: !hiddenProtocols.includes(item.id) && visibleProtocolItems.length <= 1,
        action: () => {
          setHiddenProtocols(
            hiddenProtocols.includes(item.id)
              ? hiddenProtocols.filter(id => id !== item.id)
              : [...hiddenProtocols, item.id]
          )
        }
      }))
    }
  ]

  const activities = visibleProtocolItems.map(item => {
    const Icon = item.icon
    return {
      id: item.id,
      label: item.label,
      icon: <Icon size={18} />,
      contextMenu: makeVisibilityMenu(item.id)
    }
  })

  const bottomActivities = [
    {
      id: 'guide',
      label: 'Guide',
      icon: <BookOpen size={18} />,
      contextMenu: [
        {
          id: 'show-hidden-views',
          label: hiddenProtocols.length === 0 ? 'All protocol views are visible' : 'Show all protocol views',
          disabled: hiddenProtocols.length === 0,
          action: () => setHiddenProtocols([])
        }
      ]
    }
  ]

  return (
    <div className="flex h-full" style={{ background: 'var(--vos-bg-surface)' }}>
      <AppSidebar
        activities={activities}
        bottomActivities={bottomActivities}
        activeId={activeView}
        onSelect={id => setActiveView(id as ProtocolView)}
        panelWidth={260}
        panelContent={activeView === 'http' ? <Sidebar /> : null}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden" style={{ display: activeView === 'http' ? 'flex' : 'none' }}>
          <TabBar />
          <RequestEditor />
        </div>

        <div className="flex-1 min-h-0" style={{ display: activeView === 'websocket' ? 'flex' : 'none' }}>
          <WebSocketWorkbench />
        </div>

        <div className="flex-1 min-h-0" style={{ display: activeView === 'mqtt' ? 'flex' : 'none' }}>
          <MqttWorkbench />
        </div>

        <div className="flex-1 min-h-0" style={{ display: activeView === 'guide' ? 'block' : 'none' }}>
          <ApiClientGuide />
        </div>
      </div>
    </div>
  )
}
