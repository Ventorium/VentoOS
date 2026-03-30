import {
  ChevronDown,
  ChevronRight,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Terminal,
  Trash2,
  Unplug,
  Zap
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CreateRedisConnectionReq, RedisConnectionConfig, RedisKeyInfo, RedisKeyValue } from '@/infra/api'
import { apiClient } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'

// ─── Connection form ───────────────────────────────────────────────────────

function ConnForm({ onClose, onCreated }: { onClose: () => void; onCreated: (c: RedisConnectionConfig) => void }) {
  const [name, setName] = useState('')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('6379')
  const [password, setPassword] = useState('')
  const [db, setDb] = useState('0')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name) return
    setSaving(true)
    try {
      const body: CreateRedisConnectionReq = {
        name,
        host,
        port: Number(port),
        password: password || undefined,
        db: Number(db)
      }
      const res = await apiClient.createRedisConnection(body)
      onCreated(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const fc = 'w-full text-xs px-2 py-1.5 rounded border-none outline-none'
  const fs = {
    background: 'var(--vos-bg-input)',
    color: 'var(--vos-text-primary)',
    border: '0.5px solid var(--vos-border-subtle)'
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div
        className="rounded-lg p-4 flex flex-col gap-3"
        style={{ width: 360, background: 'var(--vos-bg-card)', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}
      >
        <div className="text-sm font-medium">New Redis Connection</div>
        <input
          className={fc}
          style={fs}
          placeholder="Connection name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className={`${fc} flex-1`}
            style={fs}
            placeholder="Host"
            value={host}
            onChange={e => setHost(e.target.value)}
          />
          <input
            className={fc}
            style={{ ...fs, width: 70 }}
            placeholder="Port"
            value={port}
            onChange={e => setPort(e.target.value)}
          />
        </div>
        <input
          className={fc}
          style={fs}
          placeholder="Password (optional)"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <input className={fc} style={fs} placeholder="Database (0)" value={db} onChange={e => setDb(e.target.value)} />
        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
            style={{ background: 'var(--vos-bg-hover)', color: 'var(--vos-text-primary)' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
            style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
            onClick={submit}
            disabled={saving}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main app ──────────────────────────────────────────────────────────────

export default function RedisApp(_props: AppComponentProps) {
  const [connections, setConnections] = useState<RedisConnectionConfig[]>([])
  const [showForm, setShowForm] = useState(false)
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set())
  const [expandedConns, setExpandedConns] = useState<Set<string>>(new Set())
  const [selectedConn, setSelectedConn] = useState<string | null>(null)
  const [pattern, setPattern] = useState('*')
  const [keys, setKeys] = useState<RedisKeyInfo[]>([])
  const [selectedKey, setSelectedKey] = useState<RedisKeyValue | null>(null)
  const [loading, setLoading] = useState(false)
  // CLI state
  const [cliMode, setCliMode] = useState(false)
  const [cliInput, setCliInput] = useState('')
  const [cliHistory, setCliHistory] = useState<{ cmd: string; result: string }[]>([])
  const cliRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    try {
      const r = await apiClient.getRedisConnections()
      setConnections(r.data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const connectTo = async (id: string) => {
    try {
      await apiClient.connectRedis(id)
      setConnectedIds(s => new Set(s).add(id))
      setExpandedConns(s => new Set(s).add(id))
      setSelectedConn(id)
      scanKeys(id, '*')
    } catch (e) {
      console.error(e)
    }
  }

  const disconnectFrom = async (id: string) => {
    await apiClient.disconnectRedis(id)
    setConnectedIds(s => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
    if (selectedConn === id) {
      setSelectedConn(null)
      setKeys([])
      setSelectedKey(null)
    }
  }

  const deleteConn = async (id: string) => {
    await apiClient.deleteRedisConnection(id)
    reload()
  }

  const scanKeys = async (connId: string, pat: string) => {
    setLoading(true)
    try {
      const r = await apiClient.scanRedisKeys(connId, '0', pat, 200)
      setKeys(r.data.keys)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const selectKey = async (connId: string, key: string) => {
    setLoading(true)
    try {
      const r = await apiClient.getRedisKey(connId, key)
      setSelectedKey(r.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const deleteKey = async (connId: string, key: string) => {
    await apiClient.deleteRedisKey(connId, key)
    setSelectedKey(null)
    if (selectedConn) scanKeys(selectedConn, pattern)
  }

  const runCmd = async () => {
    if (!selectedConn || !cliInput.trim()) return
    try {
      const r = await apiClient.executeRedisCommand(selectedConn, cliInput)
      setCliHistory(h => [...h, { cmd: cliInput, result: r.data.result }])
      setCliInput('')
      setTimeout(() => cliRef.current?.scrollTo(0, cliRef.current.scrollHeight), 50)
    } catch (e) {
      console.error(e)
    }
  }

  const toggleConn = (id: string) =>
    setExpandedConns(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <div className="flex h-full relative">
      {showForm && (
        <ConnForm
          onClose={() => setShowForm(false)}
          onCreated={c => {
            setConnections(p => [...p, c])
            setShowForm(false)
          }}
        />
      )}

      {/* Sidebar */}
      <div
        className="flex flex-col flex-shrink-0 overflow-auto"
        style={{ width: 220, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
      >
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--vos-text-tertiary)' }}>
            CONNECTIONS
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={reload}
            >
              <RefreshCw size={12} />
            </button>
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-accent-primary)' }}
              onClick={() => setShowForm(true)}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {connections.map(conn => {
          const connected = connectedIds.has(conn.id)
          const expanded = expandedConns.has(conn.id)
          return (
            <div key={conn.id}>
              <div
                className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs group"
                style={{ background: selectedConn === conn.id ? 'var(--vos-bg-hover)' : 'transparent' }}
              >
                <button
                  type="button"
                  className="bg-transparent border-none p-0 cursor-pointer"
                  style={{ color: 'var(--vos-text-tertiary)' }}
                  onClick={() => toggleConn(conn.id)}
                >
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <Key
                  size={12}
                  style={{ color: connected ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }}
                />
                <span
                  className="flex-1 truncate"
                  onClick={() =>
                    connected ? (setSelectedConn(conn.id), scanKeys(conn.id, pattern)) : connectTo(conn.id)
                  }
                  onKeyDown={() => {}}
                >
                  {conn.name}
                </span>
                <span className="hidden group-hover:flex gap-0.5">
                  {connected ? (
                    <button
                      type="button"
                      className="bg-transparent border-none p-0 cursor-pointer"
                      style={{ color: 'var(--vos-text-tertiary)' }}
                      onClick={() => disconnectFrom(conn.id)}
                    >
                      <Unplug size={10} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="bg-transparent border-none p-0 cursor-pointer"
                      style={{ color: 'var(--vos-accent-primary)' }}
                      onClick={() => connectTo(conn.id)}
                    >
                      <Zap size={10} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="bg-transparent border-none p-0 cursor-pointer"
                    style={{ color: 'var(--vos-text-tertiary)' }}
                    onClick={() => deleteConn(conn.id)}
                  >
                    <Trash2 size={10} />
                  </button>
                </span>
              </div>
              {expanded && connected && (
                <div className="ml-5 text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
                  <div className="px-2 py-0.5">
                    {conn.host}:{conn.port} db{conn.db}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {connections.length === 0 && (
          <div
            className="flex-1 flex items-center justify-center text-xs"
            style={{ color: 'var(--vos-text-tertiary)' }}
          >
            No connections
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedConn && connectedIds.has(selectedConn) ? (
          <>
            {/* Key filter + mode toggle */}
            <div
              className="flex items-center gap-2 h-9 px-3 flex-shrink-0"
              style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
            >
              <Search size={12} style={{ color: 'var(--vos-text-tertiary)' }} />
              <input
                className="flex-1 bg-transparent border-none outline-none text-xs"
                style={{ color: 'var(--vos-text-primary)' }}
                placeholder="Filter pattern (e.g. user:*)"
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && selectedConn) scanKeys(selectedConn, pattern)
                }}
              />
              <button
                type="button"
                className="text-xs px-2 py-0.5 rounded cursor-pointer border-none"
                style={{
                  background: cliMode ? 'var(--vos-accent-primary)' : 'var(--vos-bg-hover)',
                  color: cliMode ? '#fff' : 'var(--vos-text-secondary)'
                }}
                onClick={() => setCliMode(!cliMode)}
              >
                <Terminal size={12} />
              </button>
            </div>

            {cliMode ? (
              /* CLI */
              <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#1a1a2e' }}>
                <div ref={cliRef} className="flex-1 overflow-auto p-3 font-mono text-xs" style={{ color: '#e0e0e0' }}>
                  {cliHistory.map((h, i) => (
                    <div key={i} className="mb-2">
                      <div style={{ color: '#6ee7b7' }}>&gt; {h.cmd}</div>
                      <div className="whitespace-pre-wrap" style={{ color: '#d1d5db' }}>
                        {h.result}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 p-2" style={{ borderTop: '1px solid #333' }}>
                  <span style={{ color: '#6ee7b7' }}>&gt;</span>
                  <input
                    className="flex-1 bg-transparent border-none outline-none text-xs font-mono"
                    style={{ color: '#e0e0e0' }}
                    value={cliInput}
                    onChange={e => setCliInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') runCmd()
                    }}
                    placeholder="Enter Redis command..."
                  />
                  <button
                    type="button"
                    className="bg-transparent border-none p-0 cursor-pointer"
                    style={{ color: '#6ee7b7' }}
                    onClick={runCmd}
                  >
                    <Send size={12} />
                  </button>
                </div>
              </div>
            ) : (
              /* Key browser */
              <div className="flex-1 flex overflow-hidden">
                {/* Key list */}
                <div
                  className="flex flex-col overflow-auto"
                  style={{ width: 240, borderRight: '0.5px solid var(--vos-border-subtle)' }}
                >
                  {loading && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
                    </div>
                  )}
                  {keys.map(k => (
                    <div
                      key={k.key}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs cursor-pointer"
                      style={{ background: selectedKey?.key === k.key ? 'var(--vos-bg-hover)' : 'transparent' }}
                      onClick={() => selectKey(selectedConn, k.key)}
                      onKeyDown={() => {}}
                    >
                      <span
                        className="text-[9px] font-mono px-1 rounded"
                        style={{ background: 'var(--vos-bg-hover)', color: 'var(--vos-text-tertiary)' }}
                      >
                        {k.key_type}
                      </span>
                      <span className="flex-1 truncate font-mono">{k.key}</span>
                      {k.ttl >= 0 && <span style={{ color: 'var(--vos-text-tertiary)', fontSize: 10 }}>{k.ttl}s</span>}
                    </div>
                  ))}
                  {!loading && keys.length === 0 && (
                    <div
                      className="flex items-center justify-center py-8 text-xs"
                      style={{ color: 'var(--vos-text-tertiary)' }}
                    >
                      No keys found
                    </div>
                  )}
                </div>

                {/* Value viewer */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {selectedKey ? (
                    <>
                      <div
                        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                        style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
                      >
                        <span className="text-xs font-mono font-medium flex-1 truncate">{selectedKey.key}</span>
                        <span
                          className="text-[9px] px-1 rounded"
                          style={{ background: 'var(--vos-bg-hover)', color: 'var(--vos-text-tertiary)' }}
                        >
                          {selectedKey.key_type}
                        </span>
                        {selectedKey.ttl >= 0 && (
                          <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                            TTL: {selectedKey.ttl}s
                          </span>
                        )}
                        <button
                          type="button"
                          className="bg-transparent border-none p-0 cursor-pointer"
                          style={{ color: 'var(--vos-text-tertiary)' }}
                          onClick={() => deleteKey(selectedConn, selectedKey.key)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div
                        className="flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap"
                        style={{ color: 'var(--vos-text-primary)' }}
                      >
                        {selectedKey.value}
                      </div>
                    </>
                  ) : (
                    <div
                      className="flex-1 flex items-center justify-center text-xs"
                      style={{ color: 'var(--vos-text-tertiary)' }}
                    >
                      Select a key to view its value
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Key size={48} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
              <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
                Connect to a Redis instance
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                Select a connection from the sidebar or create a new one
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
