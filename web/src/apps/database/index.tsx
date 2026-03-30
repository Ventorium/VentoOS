import {
  ChevronDown,
  ChevronRight,
  Database,
  FileCode,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Table,
  Trash2,
  Unplug,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppComponentProps } from '@/kernel'
import { apiClient } from '@/infra/api'
import type {
  ColumnInfo,
  CreateDbConnectionReq,
  DbConnectionConfig,
  DbEngine,
  QueryResult,
  SchemaInfo,
  TableStructure,
} from '@/infra/api'

// ─── Connection form dialog ────────────────────────────────────────────────

function ConnForm({
  onClose,
  onCreated,
}: { onClose: () => void; onCreated: (c: DbConnectionConfig) => void }) {
  const [name, setName] = useState('')
  const [engine, setEngine] = useState<DbEngine>('sqlite')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('5432')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('')
  const [sqlitePath, setSqlitePath] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name) return
    setSaving(true)
    try {
      const body: CreateDbConnectionReq = {
        name,
        engine,
        host: engine === 'sqlite' ? undefined : host,
        port: engine === 'sqlite' ? undefined : Number(port),
        username: engine === 'sqlite' ? undefined : username,
        password: engine === 'sqlite' ? undefined : password,
        database: engine === 'sqlite' ? undefined : database,
        sqlite_path: engine === 'sqlite' ? sqlitePath : undefined,
      }
      const res = await apiClient.createDbConnection(body)
      onCreated(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = 'w-full text-xs px-2 py-1.5 rounded border-none outline-none'
  const fieldStyle = {
    background: 'var(--vos-bg-input)',
    color: 'var(--vos-text-primary)',
    border: '0.5px solid var(--vos-border-subtle)',
  }

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className="rounded-lg p-4 flex flex-col gap-3"
        style={{ width: 380, background: 'var(--vos-bg-card)', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}
      >
        <div className="text-sm font-medium">New Database Connection</div>
        <input className={fieldClass} style={fieldStyle} placeholder="Connection name" value={name} onChange={e => setName(e.target.value)} />
        <select className={fieldClass} style={fieldStyle} value={engine} onChange={e => setEngine(e.target.value as DbEngine)}>
          <option value="sqlite">SQLite</option>
          <option value="postgresql">PostgreSQL</option>
          <option value="mysql">MySQL</option>
        </select>
        {engine === 'sqlite' ? (
          <input className={fieldClass} style={fieldStyle} placeholder="Database file path" value={sqlitePath} onChange={e => setSqlitePath(e.target.value)} />
        ) : (
          <>
            <div className="flex gap-2">
              <input className={`${fieldClass} flex-1`} style={fieldStyle} placeholder="Host" value={host} onChange={e => setHost(e.target.value)} />
              <input className={fieldClass} style={{ ...fieldStyle, width: 70 }} placeholder="Port" value={port} onChange={e => setPort(e.target.value)} />
            </div>
            <input className={fieldClass} style={fieldStyle} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
            <input className={fieldClass} style={fieldStyle} placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            <input className={fieldClass} style={fieldStyle} placeholder="Database" value={database} onChange={e => setDatabase(e.target.value)} />
          </>
        )}
        <div className="flex justify-end gap-2 mt-1">
          <button type="button" className="text-xs px-3 py-1.5 rounded cursor-pointer border-none" style={{ background: 'var(--vos-bg-hover)', color: 'var(--vos-text-primary)' }} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="text-xs px-3 py-1.5 rounded cursor-pointer border-none" style={{ background: 'var(--vos-accent-primary)', color: '#fff' }} onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main app ──────────────────────────────────────────────────────────────

export default function DatabaseApp(_props: AppComponentProps) {
  const [connections, setConnections] = useState<DbConnectionConfig[]>([])
  const [showForm, setShowForm] = useState(false)
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set())
  const [schemas, setSchemas] = useState<Record<string, SchemaInfo[]>>({})
  const [expandedConns, setExpandedConns] = useState<Set<string>>(new Set())
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())
  const [selectedTable, setSelectedTable] = useState<{ connId: string; table: string } | null>(null)
  const [tableStructure, setTableStructure] = useState<TableStructure | null>(null)
  const [tableData, setTableData] = useState<QueryResult | null>(null)
  const [rightTab, setRightTab] = useState<'structure' | 'data' | 'sql'>('data')
  const [sqlText, setSqlText] = useState('')
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const sqlRef = useRef<HTMLTextAreaElement>(null)

  const reload = useCallback(async () => {
    try {
      const res = await apiClient.getDbConnections()
      setConnections(res.data)
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { reload() }, [reload])

  const connectTo = async (id: string) => {
    try {
      await apiClient.connectDb(id)
      setConnectedIds(s => new Set(s).add(id))
      const res = await apiClient.getDbSchemas(id)
      setSchemas(prev => ({ ...prev, [id]: res.data }))
      setExpandedConns(s => new Set(s).add(id))
    } catch (e) { console.error(e) }
  }

  const disconnectFrom = async (id: string) => {
    try {
      await apiClient.disconnectDb(id)
      setConnectedIds(s => { const n = new Set(s); n.delete(id); return n })
      setSchemas(prev => { const n = { ...prev }; delete n[id]; return n })
    } catch (e) { console.error(e) }
  }

  const deleteConn = async (id: string) => {
    await apiClient.deleteDbConnection(id)
    reload()
  }

  const selectTable = async (connId: string, table: string) => {
    setSelectedTable({ connId, table })
    setLoading(true)
    try {
      const [structRes, dataRes] = await Promise.all([
        apiClient.getDbTableStructure(connId, table),
        apiClient.getDbTableData(connId, table, 1, 50),
      ])
      setTableStructure(structRes.data)
      setTableData(dataRes.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const executeSql = async () => {
    if (!selectedTable || !sqlText.trim()) return
    setLoading(true)
    try {
      const res = await apiClient.executeDbSql(selectedTable.connId, sqlText)
      setSqlResult(res.data)
      setRightTab('sql')
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const toggleConn = (id: string) =>
    setExpandedConns(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleSchema = (key: string) =>
    setExpandedSchemas(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  // ─── Render data table ───────────────────────────────────────────────────

  const renderDataTable = (result: QueryResult) => (
    <div className="overflow-auto flex-1 text-xs">
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {result.columns.map(col => (
              <th key={col} className="px-2 py-1.5 text-left font-medium sticky top-0" style={{ background: 'var(--vos-bg-surface)', borderBottom: '1px solid var(--vos-border-subtle)', whiteSpace: 'nowrap' }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1" style={{ whiteSpace: 'nowrap', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {cell === null ? <span style={{ color: 'var(--vos-text-tertiary)', fontStyle: 'italic' }}>NULL</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 && (
        <div className="flex items-center justify-center py-8 text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>No rows</div>
      )}
    </div>
  )

  return (
    <div className="flex h-full relative">
      {showForm && <ConnForm onClose={() => setShowForm(false)} onCreated={(c) => { setConnections(prev => [...prev, c]); setShowForm(false) }} />}

      {/* Left sidebar — connection tree */}
      <div
        className="flex flex-col flex-shrink-0 overflow-auto"
        style={{ width: 220, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
      >
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--vos-text-tertiary)' }}>CONNECTIONS</span>
          <div className="flex gap-1">
            <button type="button" className="bg-transparent border-none cursor-pointer p-0" style={{ color: 'var(--vos-text-tertiary)' }} onClick={reload}><RefreshCw size={12} /></button>
            <button type="button" className="bg-transparent border-none cursor-pointer p-0" style={{ color: 'var(--vos-accent-primary)' }} onClick={() => setShowForm(true)}><Plus size={14} /></button>
          </div>
        </div>

        {connections.map(conn => {
          const isConnected = connectedIds.has(conn.id)
          const isExpanded = expandedConns.has(conn.id)
          const connSchemas = schemas[conn.id] || []

          return (
            <div key={conn.id}>
              <div
                className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs group"
                style={{
                  background: selectedTable?.connId === conn.id ? 'var(--vos-bg-hover)' : 'transparent',
                }}
              >
                <button type="button" className="bg-transparent border-none p-0 cursor-pointer" style={{ color: 'var(--vos-text-tertiary)' }} onClick={() => toggleConn(conn.id)}>
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <Database size={12} style={{ color: isConnected ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }} />
                <span className="flex-1 truncate" onClick={() => isConnected ? toggleConn(conn.id) : connectTo(conn.id)} onKeyDown={() => {}}>{conn.name}</span>
                <span className="hidden group-hover:flex gap-0.5">
                  {isConnected ? (
                    <button type="button" className="bg-transparent border-none p-0 cursor-pointer" style={{ color: 'var(--vos-text-tertiary)' }} title="Disconnect" onClick={() => disconnectFrom(conn.id)}><Unplug size={10} /></button>
                  ) : (
                    <button type="button" className="bg-transparent border-none p-0 cursor-pointer" style={{ color: 'var(--vos-accent-primary)' }} title="Connect" onClick={() => connectTo(conn.id)}><Zap size={10} /></button>
                  )}
                  <button type="button" className="bg-transparent border-none p-0 cursor-pointer" style={{ color: 'var(--vos-text-tertiary)' }} title="Delete" onClick={() => deleteConn(conn.id)}><Trash2 size={10} /></button>
                </span>
              </div>
              {isExpanded && isConnected && connSchemas.map(schema => {
                const schemaKey = `${conn.id}:${schema.name}`
                const schemaExpanded = expandedSchemas.has(schemaKey)
                return (
                  <div key={schema.name} className="ml-4">
                    <div className="flex items-center gap-1 px-2 py-0.5 cursor-pointer text-xs" style={{ color: 'var(--vos-text-secondary)' }} onClick={() => toggleSchema(schemaKey)} onKeyDown={() => {}}>
                      {schemaExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      {schema.name}
                      <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>({schema.tables.length})</span>
                    </div>
                    {schemaExpanded && schema.tables.map(t => (
                      <div
                        key={t.name}
                        className="flex items-center gap-1 ml-4 px-2 py-0.5 cursor-pointer text-xs rounded"
                        style={{
                          background: selectedTable?.table === t.name && selectedTable?.connId === conn.id ? 'var(--vos-accent-primary)' : 'transparent',
                          color: selectedTable?.table === t.name && selectedTable?.connId === conn.id ? '#fff' : 'var(--vos-text-primary)',
                        }}
                        onClick={() => selectTable(conn.id, t.name)}
                        onKeyDown={() => {}}
                      >
                        <Table size={10} />
                        {t.name}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })}

        {connections.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
            No connections
          </div>
        )}
      </div>

      {/* Right content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTable ? (
          <>
            {/* Tab bar */}
            <div className="flex items-center h-9 flex-shrink-0 px-2 gap-1" style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}>
              {(['structure', 'data', 'sql'] as const).map(tab => (
                <button
                  type="button"
                  key={tab}
                  className="text-xs px-3 py-1 rounded cursor-pointer border-none capitalize"
                  style={{
                    background: rightTab === tab ? 'var(--vos-accent-primary)' : 'transparent',
                    color: rightTab === tab ? '#fff' : 'var(--vos-text-secondary)',
                  }}
                  onClick={() => setRightTab(tab)}
                >
                  {tab === 'structure' ? <><Table size={10} className="inline mr-1" />Structure</> : tab === 'data' ? <><Database size={10} className="inline mr-1" />Data</> : <><FileCode size={10} className="inline mr-1" />SQL</>}
                </button>
              ))}
              <span className="flex-1" />
              <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>{selectedTable.table}</span>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} /></div>
            ) : rightTab === 'structure' && tableStructure ? (
              <div className="flex-1 overflow-auto text-xs p-3">
                <div className="font-medium mb-2">Columns</div>
                <table className="w-full mb-4" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Name', 'Type', 'Nullable', 'Default', 'PK'].map(h => (
                        <th key={h} className="px-2 py-1 text-left font-medium" style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableStructure.columns.map((col: ColumnInfo) => (
                      <tr key={col.name} style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                        <td className="px-2 py-1 font-mono">{col.name}</td>
                        <td className="px-2 py-1" style={{ color: 'var(--vos-accent-primary)' }}>{col.data_type}</td>
                        <td className="px-2 py-1">{col.nullable ? 'YES' : 'NO'}</td>
                        <td className="px-2 py-1" style={{ color: 'var(--vos-text-tertiary)' }}>{col.default_value ?? '—'}</td>
                        <td className="px-2 py-1">{col.is_primary_key ? '🔑' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tableStructure.indexes.length > 0 && (
                  <>
                    <div className="font-medium mb-2">Indexes</div>
                    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Name', 'Columns', 'Unique'].map(h => (
                            <th key={h} className="px-2 py-1 text-left font-medium" style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableStructure.indexes.map(idx => (
                          <tr key={idx.name} style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                            <td className="px-2 py-1 font-mono">{idx.name}</td>
                            <td className="px-2 py-1">{idx.columns.join(', ')}</td>
                            <td className="px-2 py-1">{idx.unique ? 'YES' : 'NO'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            ) : rightTab === 'data' && tableData ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1" style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                  <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
                    {tableData.rows.length} rows · {tableData.execution_time_ms}ms
                  </span>
                </div>
                {renderDataTable(tableData)}
              </div>
            ) : rightTab === 'sql' ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-shrink-0" style={{ height: 160, borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                  <textarea
                    ref={sqlRef}
                    className="w-full h-full p-3 text-xs font-mono resize-none border-none outline-none"
                    style={{ background: 'var(--vos-bg-input)', color: 'var(--vos-text-primary)' }}
                    placeholder="Enter SQL query..."
                    value={sqlText}
                    onChange={e => setSqlText(e.target.value)}
                    onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') executeSql() }}
                  />
                </div>
                <div className="flex items-center gap-2 px-3 py-1" style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                  <button type="button" className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer border-none" style={{ background: 'var(--vos-accent-primary)', color: '#fff' }} onClick={executeSql}>
                    <Play size={10} /> Execute
                  </button>
                  <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>⌘+Enter</span>
                  {sqlResult && (
                    <span className="text-xs ml-auto" style={{ color: 'var(--vos-text-tertiary)' }}>
                      {sqlResult.affected_rows} affected · {sqlResult.execution_time_ms}ms
                    </span>
                  )}
                </div>
                {sqlResult ? renderDataTable(sqlResult) : (
                  <div className="flex-1 flex items-center justify-center text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>Run a query to see results</div>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Database size={48} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
              <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>Connect to a database</div>
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
