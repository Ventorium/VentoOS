import {
  ChevronDown,
  ChevronRight,
  Database,
  Folder,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Terminal,
  Trash2,
  Unplug,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppComponentProps } from '@/kernel'
import { apiClient } from '@/infra/api'
import type {
  CreateRedisConnectionReq,
  RedisConnectionConfig,
  RedisKeyInfo,
  RedisKeyValue,
} from '@/infra/api'

// ─── Trie Tree for key grouping ────────────────────────────────────────────

interface TrieNode {
  name: string       // segment name (e.g. "user")
  fullKey: string    // full path joined by delimiter (e.g. "auth:user")
  children: Map<string, TrieNode>
  isLeaf: boolean    // true if this is an actual key
  leafCount: number  // total key count under this node
  keyInfo?: RedisKeyInfo
}

function buildTrie(keys: RedisKeyInfo[], delimiter = ':'): TrieNode {
  const root: TrieNode = { name: '', fullKey: '', children: new Map(), isLeaf: false, leafCount: 0 }

  for (const ki of keys) {
    const parts = ki.key.split(delimiter)
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const fullKey = parts.slice(0, i + 1).join(delimiter)
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullKey,
          children: new Map(),
          isLeaf: false,
          leafCount: 0,
        })
      }
      current = current.children.get(part)!
    }
    current.isLeaf = true
    current.keyInfo = ki
  }

  // Count leaves
  function countLeaves(node: TrieNode): number {
    if (node.isLeaf && node.children.size === 0) {
      node.leafCount = 1
      return 1
    }
    let count = node.isLeaf ? 1 : 0
    for (const child of node.children.values()) {
      count += countLeaves(child)
    }
    node.leafCount = count
    return count
  }
  countLeaves(root)

  return root
}

// ─── Trie Tree Renderer ───────────────────────────────────────────────────

function TrieTreeView({ node, depth, selectedKey, onSelect, expandedPaths, onToggle }: {
  node: TrieNode
  depth: number
  selectedKey: string | null
  onSelect: (key: string) => void
  expandedPaths: Set<string>
  onToggle: (path: string) => void
}) {
  const sorted = useMemo(
    () => Array.from(node.children.values()).sort((a, b) => {
      // Folders first
      if (a.children.size > 0 && b.children.size === 0) return -1
      if (a.children.size === 0 && b.children.size > 0) return 1
      return a.name.localeCompare(b.name)
    }),
    [node.children],
  )

  return (
    <>
      {sorted.map(child => {
        const isFolder = child.children.size > 0 && !child.isLeaf
        const isFolderWithLeaf = child.children.size > 0 && child.isLeaf
        const isExpanded = expandedPaths.has(child.fullKey)
        const isSelected = selectedKey === child.fullKey

        return (
          <div key={child.fullKey}>
            <div
              className="flex items-center gap-1 px-2 cursor-pointer"
              style={{
                paddingLeft: 8 + depth * 14,
                paddingTop: 2,
                paddingBottom: 2,
                background: isSelected ? 'var(--vos-accent-primary)' : 'transparent',
                color: isSelected ? '#fff' : 'var(--vos-text-primary)',
                borderRadius: 3,
                margin: '0 4px',
                fontSize: 12,
              }}
              onClick={() => {
                if (isFolder || isFolderWithLeaf) {
                  onToggle(child.fullKey)
                }
                if (child.isLeaf) {
                  onSelect(child.fullKey)
                } else if (isFolder) {
                  // If folder, don't select — just expand/collapse
                }
              }}
            >
              {(isFolder || isFolderWithLeaf) ? (
                <>
                  {isExpanded ? <ChevronDown size={11} style={{ flexShrink: 0 }} /> : <ChevronRight size={11} style={{ flexShrink: 0 }} />}
                  <Folder size={12} style={{ color: isSelected ? '#fff' : 'var(--vos-accent-warning)', flexShrink: 0 }} />
                </>
              ) : (
                <>
                  <span style={{ width: 11, flexShrink: 0 }} />
                  <Key size={12} style={{ color: isSelected ? '#fff' : 'var(--vos-text-tertiary)', flexShrink: 0 }} />
                </>
              )}
              <span className="flex-1 truncate font-mono">{child.name}</span>
              {(isFolder || isFolderWithLeaf) && (
                <span style={{ fontSize: 9, opacity: 0.6 }}>{child.leafCount}</span>
              )}
              {child.keyInfo && (
                <span className="font-mono" style={{ fontSize: 9, opacity: 0.5, flexShrink: 0 }}>{child.keyInfo.key_type}</span>
              )}
            </div>
            {isExpanded && (isFolder || isFolderWithLeaf) && (
              <TrieTreeView
                node={child}
                depth={depth + 1}
                selectedKey={selectedKey}
                onSelect={onSelect}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

// ─── Connection form ───────────────────────────────────────────────────────

function ConnForm({
  onClose,
  onCreated,
}: { onClose: () => void; onCreated: (c: RedisConnectionConfig) => void }) {
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
      const body: CreateRedisConnectionReq = { name, host, port: Number(port), password: password || undefined, db: Number(db) }
      const res = await apiClient.createRedisConnection(body)
      onCreated(res.data)
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const fc = 'w-full text-xs px-2 py-1.5 rounded border-none outline-none'
  const fs = { background: 'var(--vos-bg-input)', color: 'var(--vos-text-primary)', border: '0.5px solid var(--vos-border-subtle)' }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="rounded-lg p-4 flex flex-col gap-3" style={{ width: 360, background: 'var(--vos-bg-surface)', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}>
        <div className="text-sm font-medium">新建 Redis 连接</div>
        <input className={fc} style={fs} placeholder="连接名称" value={name} onChange={e => setName(e.target.value)} />
        <div className="flex gap-2">
          <input className={`${fc} flex-1`} style={fs} placeholder="Host" value={host} onChange={e => setHost(e.target.value)} />
          <input className={fc} style={{ ...fs, width: 70 }} placeholder="Port" value={port} onChange={e => setPort(e.target.value)} />
        </div>
        <input className={fc} style={fs} placeholder="密码（可选）" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <input className={fc} style={fs} placeholder="数据库 (0)" value={db} onChange={e => setDb(e.target.value)} />
        <div className="flex justify-end gap-2 mt-1">
          <button type="button" className="text-xs px-3 py-1.5 rounded cursor-pointer border-none" style={{ background: 'var(--vos-bg-item-hover)', color: 'var(--vos-text-primary)' }} onClick={onClose}>取消</button>
          <button type="button" className="text-xs px-3 py-1.5 rounded cursor-pointer border-none" style={{ background: 'var(--vos-accent-primary)', color: '#fff' }} onClick={submit} disabled={saving}>{saving ? '创建中…' : '创建'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Value Viewer ──────────────────────────────────────────────────────────

function ValueViewer({ kv, connId, onDeleted }: { kv: RedisKeyValue; connId: string; onDeleted: () => void }) {
  const handleDelete = async () => {
    await apiClient.deleteRedisKey(connId, kv.key)
    onDeleted()
  }

  // Format value for display
  const displayValue = useMemo(() => {
    if (typeof kv.value === 'string') return kv.value
    return JSON.stringify(kv.value, null, 2)
  }, [kv.value])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}>
        <span className="text-xs font-mono font-medium flex-1 truncate">{kv.key}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--vos-bg-item-hover)', color: 'var(--vos-accent-primary)' }}>{kv.key_type}</span>
        {kv.encoding && <span className="text-[9px]" style={{ color: 'var(--vos-text-tertiary)' }}>{kv.encoding}</span>}
        {kv.ttl >= 0 && <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>TTL: {kv.ttl}s</span>}
        {kv.ttl === -1 && <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>永不过期</span>}
        <button type="button" className="bg-transparent border-none p-0 cursor-pointer" style={{ color: 'var(--vos-text-tertiary)' }} onClick={handleDelete} title="删除"><Trash2 size={12} /></button>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap" style={{ color: 'var(--vos-text-primary)' }}>
        {displayValue}
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
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  // CLI state
  const [cliMode, setCliMode] = useState(false)
  const [cliInput, setCliInput] = useState('')
  const [cliHistory, setCliHistory] = useState<{ cmd: string; result: string }[]>([])
  const cliRef = useRef<HTMLDivElement>(null)

  // Build trie from flat key list
  const trie = useMemo(() => buildTrie(keys, ':'), [keys])

  const reload = useCallback(async () => {
    try { const r = await apiClient.getRedisConnections(); setConnections(r.data) } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { reload() }, [reload])

  const connectTo = async (id: string) => {
    try {
      await apiClient.connectRedis(id)
      setConnectedIds(s => new Set(s).add(id))
      setExpandedConns(s => new Set(s).add(id))
      setSelectedConn(id)
      scanKeys(id, '*')
    } catch (e) { console.error(e) }
  }

  const disconnectFrom = async (id: string) => {
    await apiClient.disconnectRedis(id)
    setConnectedIds(s => { const n = new Set(s); n.delete(id); return n })
    if (selectedConn === id) { setSelectedConn(null); setKeys([]); setSelectedKey(null) }
  }

  const deleteConn = async (id: string) => { await apiClient.deleteRedisConnection(id); reload() }

  const scanKeys = async (connId: string, pat: string) => {
    setLoading(true)
    setExpandedPaths(new Set())
    try {
      // Use SCAN with cursor-based iteration to load up to 1000 keys
      let cursor = '0'
      let allKeys: RedisKeyInfo[] = []
      let finished = false
      while (!finished && allKeys.length < 1000) {
        const r = await apiClient.scanRedisKeys(connId, cursor, pat, 200)
        allKeys = [...allKeys, ...r.data.keys]
        cursor = r.data.cursor
        finished = r.data.finished || cursor === '0'
      }
      setKeys(allKeys)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const selectKey = async (connId: string, key: string) => {
    setLoading(true)
    try {
      const r = await apiClient.getRedisKey(connId, key)
      setSelectedKey(r.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const toggleTriePath = (path: string) => {
    setExpandedPaths(s => {
      const n = new Set(s)
      n.has(path) ? n.delete(path) : n.add(path)
      return n
    })
  }

  const runCmd = async () => {
    if (!selectedConn || !cliInput.trim()) return
    try {
      const r = await apiClient.executeRedisCommand(selectedConn, cliInput)
      const result = typeof r.data.result === 'string' ? r.data.result : JSON.stringify(r.data.result, null, 2)
      setCliHistory(h => [...h, { cmd: cliInput, result }])
      setCliInput('')
      setTimeout(() => cliRef.current?.scrollTo(0, cliRef.current.scrollHeight), 50)
    } catch (e) { console.error(e) }
  }

  const toggleConn = (id: string) =>
    setExpandedConns(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="flex h-full relative">
      {showForm && <ConnForm onClose={() => setShowForm(false)} onCreated={c => { setConnections(p => [...p, c]); setShowForm(false) }} />}

      {/* Sidebar — connections */}
      <div className="flex flex-col flex-shrink-0 overflow-auto" style={{ width: 180, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}>
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-wider" style={{ color: 'var(--vos-text-tertiary)' }}>连接</span>
          <div className="flex gap-1">
            <button type="button" className="bg-transparent border-none cursor-pointer p-0" style={{ color: 'var(--vos-text-tertiary)' }} onClick={reload}><RefreshCw size={11} /></button>
            <button type="button" className="bg-transparent border-none cursor-pointer p-0" style={{ color: 'var(--vos-accent-primary)' }} onClick={() => setShowForm(true)}><Plus size={13} /></button>
          </div>
        </div>

        {connections.map(conn => {
          const connected = connectedIds.has(conn.id)
          const expanded = expandedConns.has(conn.id)
          const isActive = selectedConn === conn.id
          return (
            <div key={conn.id}>
              <div className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs group"
                style={{
                  background: isActive ? 'var(--vos-accent-primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--vos-text-primary)',
                  borderRadius: 4,
                  margin: '1px 4px',
                }}>
                <button type="button" className="bg-transparent border-none p-0 cursor-pointer text-inherit" onClick={() => toggleConn(conn.id)}>
                  {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>
                <Database size={12} style={{ color: isActive ? '#fff' : connected ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)', flexShrink: 0 }} />
                <span className="flex-1 truncate" onClick={() => connected ? (setSelectedConn(conn.id), scanKeys(conn.id, pattern)) : connectTo(conn.id)}>{conn.name}</span>
                <span className="hidden group-hover:flex gap-0.5">
                  {connected ? (
                    <button type="button" className="bg-transparent border-none p-0 cursor-pointer text-inherit" onClick={() => disconnectFrom(conn.id)}><Unplug size={10} /></button>
                  ) : (
                    <button type="button" className="bg-transparent border-none p-0 cursor-pointer text-inherit" onClick={() => connectTo(conn.id)}><Zap size={10} /></button>
                  )}
                  <button type="button" className="bg-transparent border-none p-0 cursor-pointer text-inherit" onClick={() => deleteConn(conn.id)}><Trash2 size={10} /></button>
                </span>
              </div>
              {expanded && connected && (
                <div className="text-[10px] px-2 py-0.5 ml-6" style={{ color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--vos-text-tertiary)' }}>
                  {conn.host}:{conn.port} db{conn.db}
                </div>
              )}
            </div>
          )
        })}

        {connections.length === 0 && <div className="flex-1 flex items-center justify-center text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>无连接</div>}
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedConn && connectedIds.has(selectedConn) ? (
          <>
            {/* Key filter + mode toggle */}
            <div className="flex items-center gap-2 h-8 px-3 flex-shrink-0" style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}>
              <Search size={12} style={{ color: 'var(--vos-text-tertiary)' }} />
              <input className="flex-1 bg-transparent border-none outline-none text-xs" style={{ color: 'var(--vos-text-primary)' }} placeholder="过滤模式 (如 user:*)" value={pattern} onChange={e => setPattern(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && selectedConn) scanKeys(selectedConn, pattern) }} />
              <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>{keys.length} keys</span>
              <button type="button" className="bg-transparent border-none p-0 cursor-pointer" style={{ color: 'var(--vos-text-tertiary)' }} onClick={() => selectedConn && scanKeys(selectedConn, pattern)}>
                <RefreshCw size={11} />
              </button>
              <button type="button" className="text-xs px-2 py-0.5 rounded cursor-pointer border-none" style={{ background: cliMode ? 'var(--vos-accent-primary)' : 'var(--vos-bg-item-hover)', color: cliMode ? '#fff' : 'var(--vos-text-secondary)' }} onClick={() => setCliMode(!cliMode)}>
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
                      <div className="whitespace-pre-wrap" style={{ color: '#d1d5db' }}>{h.result}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 p-2" style={{ borderTop: '1px solid #333' }}>
                  <span style={{ color: '#6ee7b7' }}>&gt;</span>
                  <input className="flex-1 bg-transparent border-none outline-none text-xs font-mono" style={{ color: '#e0e0e0' }} value={cliInput} onChange={e => setCliInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runCmd() }} placeholder="输入 Redis 命令..." />
                  <button type="button" className="bg-transparent border-none p-0 cursor-pointer" style={{ color: '#6ee7b7' }} onClick={runCmd}><Send size={12} /></button>
                </div>
              </div>
            ) : (
              /* Key browser with trie tree */
              <div className="flex-1 flex overflow-hidden">
                {/* Key tree */}
                <div className="flex flex-col overflow-auto" style={{ width: 260, borderRight: '0.5px solid var(--vos-border-subtle)' }}>
                  {loading && keys.length === 0 && <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} /></div>}
                  <div className="flex-1 overflow-auto py-1">
                    <TrieTreeView
                      node={trie}
                      depth={0}
                      selectedKey={selectedKey?.key ?? null}
                      onSelect={key => selectKey(selectedConn, key)}
                      expandedPaths={expandedPaths}
                      onToggle={toggleTriePath}
                    />
                  </div>
                  {!loading && keys.length === 0 && <div className="flex items-center justify-center py-8 text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>无 Key</div>}
                </div>

                {/* Value viewer */}
                {selectedKey ? (
                  <ValueViewer
                    kv={selectedKey}
                    connId={selectedConn}
                    onDeleted={() => { setSelectedKey(null); scanKeys(selectedConn, pattern) }}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>选择一个 Key 查看值</div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Database size={48} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
              <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>Redis 管理</div>
              <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>选择左侧连接或创建新连接</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
