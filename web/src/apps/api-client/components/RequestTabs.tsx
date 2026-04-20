import { useState } from 'react'
import { useApiClientStore } from '../store'
import type { AuthConfig, BodyConfig, KeyValueItem } from '../types'
import KeyValueEditor from './KeyValueEditor'
import BodyEditor from './BodyEditor'

type TabKey = 'params' | 'headers' | 'body' | 'auth' | 'scripts'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'params', label: 'Params' },
  { key: 'headers', label: 'Headers' },
  { key: 'body', label: 'Body' },
  { key: 'auth', label: 'Auth' },
  { key: 'scripts', label: 'Scripts' },
]

function AuthEditor({ auth, onChange }: { auth: AuthConfig; onChange: (a: AuthConfig) => void }) {
  const authTypes = [
    { value: 'none', label: 'None' },
    { value: 'inherit', label: 'Inherit' },
    { value: 'basic', label: 'Basic Auth' },
    { value: 'bearer', label: 'Bearer Token' },
    { value: 'api-key', label: 'API Key' },
  ] as const

  return (
    <div className="p-3 text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--vos-text-tertiary)' }}>
          Type:
        </span>
        {authTypes.map((t) => (
          <button
            key={t.value}
            className="px-2.5 py-1 rounded"
            style={{
              background: auth.type === t.value ? 'var(--vos-bg-tertiary)' : 'transparent',
              color: auth.type === t.value ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
            }}
            onClick={() => onChange({ ...auth, type: t.value })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {auth.type === 'basic' && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Username</span>
            <input
              className="px-2 py-1.5 rounded bg-transparent outline-none"
              style={{ border: '1px solid var(--vos-border-subtle)', color: 'var(--vos-text-primary)' }}
              value={auth.username ?? ''}
              onChange={(e) => onChange({ ...auth, username: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Password</span>
            <input
              type="password"
              className="px-2 py-1.5 rounded bg-transparent outline-none"
              style={{ border: '1px solid var(--vos-border-subtle)', color: 'var(--vos-text-primary)' }}
              value={auth.password ?? ''}
              onChange={(e) => onChange({ ...auth, password: e.target.value })}
            />
          </label>
        </div>
      )}

      {auth.type === 'bearer' && (
        <label className="flex flex-col gap-1">
          <span style={{ color: 'var(--vos-text-tertiary)' }}>Token</span>
          <input
            className="px-2 py-1.5 rounded bg-transparent outline-none"
            style={{ border: '1px solid var(--vos-border-subtle)', color: 'var(--vos-text-primary)' }}
            value={auth.token ?? ''}
            placeholder="Enter bearer token..."
            onChange={(e) => onChange({ ...auth, token: e.target.value })}
          />
        </label>
      )}

      {auth.type === 'api-key' && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Key</span>
            <input
              className="px-2 py-1.5 rounded bg-transparent outline-none"
              style={{ border: '1px solid var(--vos-border-subtle)', color: 'var(--vos-text-primary)' }}
              value={auth.key ?? ''}
              onChange={(e) => onChange({ ...auth, key: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Value</span>
            <input
              className="px-2 py-1.5 rounded bg-transparent outline-none"
              style={{ border: '1px solid var(--vos-border-subtle)', color: 'var(--vos-text-primary)' }}
              value={auth.value ?? ''}
              onChange={(e) => onChange({ ...auth, value: e.target.value })}
            />
          </label>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Add to:</span>
            <button
              className="px-2 py-1 rounded"
              style={{
                background: auth.addTo === 'header' ? 'var(--vos-bg-tertiary)' : 'transparent',
                color: auth.addTo === 'header' ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
              }}
              onClick={() => onChange({ ...auth, addTo: 'header' })}
            >
              Header
            </button>
            <button
              className="px-2 py-1 rounded"
              style={{
                background: auth.addTo === 'query' ? 'var(--vos-bg-tertiary)' : 'transparent',
                color: auth.addTo === 'query' ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
              }}
              onClick={() => onChange({ ...auth, addTo: 'query' })}
            >
              Query Param
            </button>
          </div>
        </div>
      )}

      {(auth.type === 'none' || auth.type === 'inherit') && (
        <div className="py-4 text-center" style={{ color: 'var(--vos-text-tertiary)' }}>
          {auth.type === 'none' ? 'No authentication' : 'Inheriting auth from parent collection/folder'}
        </div>
      )}
    </div>
  )
}

function ScriptsEditor({
  preRequestScript,
  testScript,
  onChangePreRequest,
  onChangeTest,
}: {
  preRequestScript: string
  testScript: string
  onChangePreRequest: (v: string) => void
  onChangeTest: (v: string) => void
}) {
  const [scriptTab, setScriptTab] = useState<'pre' | 'test'>('pre')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}>
        <button
          className="px-2.5 py-1 rounded text-xs"
          style={{
            background: scriptTab === 'pre' ? 'var(--vos-bg-tertiary)' : 'transparent',
            color: scriptTab === 'pre' ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
          }}
          onClick={() => setScriptTab('pre')}
        >
          Pre-request
        </button>
        <button
          className="px-2.5 py-1 rounded text-xs"
          style={{
            background: scriptTab === 'test' ? 'var(--vos-bg-tertiary)' : 'transparent',
            color: scriptTab === 'test' ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
          }}
          onClick={() => setScriptTab('test')}
        >
          Tests
        </button>
      </div>
      <textarea
        className="flex-1 p-3 bg-transparent outline-none resize-none text-xs font-mono"
        style={{ color: 'var(--vos-text-primary)' }}
        value={scriptTab === 'pre' ? preRequestScript : testScript}
        placeholder={scriptTab === 'pre' ? '// Pre-request script...' : '// Test script...'}
        onChange={(e) => (scriptTab === 'pre' ? onChangePreRequest(e.target.value) : onChangeTest(e.target.value))}
        spellCheck={false}
      />
    </div>
  )
}

export default function RequestTabs() {
  const [activeKey, setActiveKey] = useState<TabKey>('params')
  const tabs = useApiClientStore((s) => s.tabs)
  const activeTabId = useApiClientStore((s) => s.activeTabId)
  const updateTabRequest = useApiClientStore((s) => s.updateTabRequest)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
        Open a request to get started
      </div>
    )
  }

  const req = activeTab.request

  const updateReq = (updates: Record<string, unknown>) => {
    updateTabRequest(activeTab.id, {
      request: { ...req, ...updates },
    })
  }

  const paramsCount = (req.params ?? []).filter((p: KeyValueItem) => p.key).length
  const headersCount = (req.headers ?? []).filter((h: KeyValueItem) => h.key).length

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Tab headers */}
      <div
        className="flex items-center gap-0.5 px-3 shrink-0"
        style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
      >
        {TABS.map((tab) => {
          const count = tab.key === 'params' ? paramsCount : tab.key === 'headers' ? headersCount : 0
          return (
            <button
              key={tab.key}
              className="px-3 py-2 text-xs relative"
              style={{
                color: activeKey === tab.key ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
              }}
              onClick={() => setActiveKey(tab.key)}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className="ml-1 px-1.5 py-0 rounded-full text-[10px]"
                  style={{ background: 'var(--vos-bg-tertiary)', color: 'var(--vos-text-secondary)' }}
                >
                  {count}
                </span>
              )}
              {activeKey === tab.key && (
                <div
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                  style={{ background: 'var(--vos-accent-primary)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeKey === 'params' && (
          <KeyValueEditor
            items={req.params ?? []}
            onChange={(params: KeyValueItem[]) => updateReq({ params })}
            showDescription
            placeholder={{ key: 'Parameter', value: 'Value' }}
          />
        )}

        {activeKey === 'headers' && (
          <KeyValueEditor
            items={req.headers ?? []}
            onChange={(headers: KeyValueItem[]) => updateReq({ headers })}
            showDescription
            placeholder={{ key: 'Header', value: 'Value' }}
          />
        )}

        {activeKey === 'body' && (
          <BodyEditor
            body={req.body ?? { type: 'none' }}
            onChange={(body: BodyConfig) => updateReq({ body })}
          />
        )}

        {activeKey === 'auth' && (
          <AuthEditor
            auth={req.auth ?? { type: 'none' }}
            onChange={(auth: AuthConfig) => updateReq({ auth })}
          />
        )}

        {activeKey === 'scripts' && (
          <ScriptsEditor
            preRequestScript={(req.preRequestScript as string) ?? ''}
            testScript={(req.testScript as string) ?? ''}
            onChangePreRequest={(v: string) => updateReq({ preRequestScript: v })}
            onChangeTest={(v: string) => updateReq({ testScript: v })}
          />
        )}
      </div>
    </div>
  )
}
