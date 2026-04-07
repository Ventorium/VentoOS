import {
  ChevronDown,
  ChevronRight,
  Database,
  FileCode,
  Play,
  Plus,
  RefreshCw,
  Table,
  Trash2,
  Unplug,
  Zap
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { VList } from 'virtua'
import { AppLayout, AppSidebar, EmptyState, FormInput, FormSelect, Modal, SectionHeader, Spinner } from '@/components'
import type { AppComponentProps } from '@/kernel'
import { useAppStorage } from '@/kernel'
import { PathPickerInput } from '@/shell/FilePicker'
import type {
  ColumnInfo,
  CreateDbConnectionReq,
  DbConnectionConfig,
  DbEngine,
  DbTestResult,
  QueryResult,
  SchemaInfo,
  TableStructure
} from './api'
import { dbApi } from './api'

// ─── Connection form dialog ────────────────────────────────────────────────

function ConnForm({ onClose, onCreated }: { onClose: () => void; onCreated: (c: DbConnectionConfig) => void }) {
  const [name, setName] = useState('')
  const [engine, setEngine] = useState<DbEngine>('sqlite')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('5432')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('')
  const [sqlitePath, setSqlitePath] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<DbTestResult | null>(null)

  const buildReqBody = (): CreateDbConnectionReq => ({
    name,
    engine,
    host: engine === 'sqlite' ? undefined : host,
    port: engine === 'sqlite' ? undefined : Number(port),
    username: engine === 'sqlite' ? undefined : username,
    password: engine === 'sqlite' ? undefined : password,
    database: engine === 'sqlite' ? undefined : database,
    sqlite_path: engine === 'sqlite' ? sqlitePath : undefined
  })

  const submit = async () => {
    if (!name) return
    setSaving(true)
    try {
      const res = await dbApi.createDbConnection(buildReqBody())
      onCreated(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const testConn = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await dbApi.testDbConnectionInline(buildReqBody())
      setTestResult(res.data)
    } catch (e) {
      setTestResult({ success: false, message: String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="新建数据库连接"
      width={380}
      footer={
        <>
          <button type="button" className="vos-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="vos-btn vos-btn-primary" onClick={submit} disabled={saving}>
            {saving ? '创建中…' : '创建'}
          </button>
        </>
      }
    >
      <FormInput placeholder="连接名称" value={name} onChange={e => setName(e.target.value)} />
      <FormSelect value={engine} onChange={e => setEngine(e.target.value as DbEngine)}>
        <option value="sqlite">SQLite</option>
        <option value="postgresql">PostgreSQL</option>
        <option value="mysql">MySQL</option>
      </FormSelect>
      {engine === 'sqlite' ? (
        <PathPickerInput
          mode="file"
          value={sqlitePath}
          onChange={setSqlitePath}
          placeholder="数据库文件路径"
          className="vos-input"
        />
      ) : (
        <>
          <div className="flex gap-2">
            <FormInput className="flex-1" placeholder="Host" value={host} onChange={e => setHost(e.target.value)} />
            <FormInput style={{ width: 70 }} placeholder="Port" value={port} onChange={e => setPort(e.target.value)} />
          </div>
          <FormInput placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <FormInput
            placeholder="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <FormInput placeholder="Database" value={database} onChange={e => setDatabase(e.target.value)} />
        </>
      )}
      {/* Test connection */}
      <div className="flex items-center gap-2">
        <button type="button" className="vos-btn vos-btn-sm" onClick={testConn} disabled={testing}>
          {testing ? '测试中…' : '测试连接'}
        </button>
        {testResult && (
          <span
            className="text-xs"
            style={{
              color: testResult.success ? 'var(--vos-accent-success, #52c41a)' : 'var(--vos-accent-danger, #f5222d)'
            }}
          >
            {testResult.success
              ? `✓ ${testResult.server_version ?? '连接成功'}${testResult.latency_ms != null ? ` (${testResult.latency_ms}ms)` : ''}`
              : `✗ ${testResult.message}`}
          </span>
        )}
      </div>
    </Modal>
  )
}

// ─── Main app ──────────────────────────────────────────────────────────────

export default function DatabaseApp(_props: AppComponentProps) {
  const storage = useAppStorage('database')
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
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(100)
  const sqlRef = useRef<HTMLTextAreaElement>(null)

  // Load persisted view preferences
  useEffect(() => {
    storage.getJSON<{ rightTab?: 'structure' | 'data' | 'sql' }>('preferences').then(prefs => {
      if (prefs?.rightTab) setRightTab(prefs.rightTab)
    })
  }, [storage])

  const reload = useCallback(async () => {
    try {
      const res = await dbApi.getDbConnections()
      setConnections(res.data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const connectTo = async (id: string) => {
    try {
      await dbApi.connectDb(id)
      setConnectedIds(s => new Set(s).add(id))
      const res = await dbApi.getDbSchemas(id)
      setSchemas(prev => ({ ...prev, [id]: res.data }))
      setExpandedConns(s => new Set(s).add(id))
    } catch (e) {
      console.error(e)
    }
  }

  const disconnectFrom = async (id: string) => {
    try {
      await dbApi.disconnectDb(id)
      setConnectedIds(s => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
      setSchemas(prev => {
        const n = { ...prev }
        delete n[id]
        return n
      })
    } catch (e) {
      console.error(e)
    }
  }

  const deleteConn = async (id: string) => {
    await dbApi.deleteDbConnection(id)
    reload()
  }

  const selectTable = async (connId: string, table: string) => {
    setSelectedTable({ connId, table })
    setCurrentPage(1)
    setLoading(true)
    try {
      const [structRes, dataRes] = await Promise.all([
        dbApi.getDbTableStructure(connId, table),
        dbApi.getDbTableData(connId, table, 1, pageSize)
      ])
      setTableStructure(structRes.data)
      setTableData(dataRes.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const loadPage = async (page: number) => {
    if (!selectedTable) return
    setCurrentPage(page)
    setLoading(true)
    try {
      const res = await dbApi.getDbTableData(selectedTable.connId, selectedTable.table, page, pageSize)
      setTableData(res.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const executeSql = async () => {
    if (!selectedTable || !sqlText.trim()) return
    setLoading(true)
    try {
      const res = await dbApi.executeDbSql(selectedTable.connId, sqlText)
      setSqlResult(res.data)
      setRightTab('sql')
      storage.setJSON('preferences', { rightTab: 'sql' })
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const toggleConn = (id: string) =>
    setExpandedConns(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const toggleSchema = (key: string) =>
    setExpandedSchemas(s => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })

  // ─── Render data table ───────────────────────────────────────────────────

  const renderDataTable = (result: QueryResult) => (
    <div className="flex flex-col flex-1 overflow-hidden text-xs">
      {/* Sticky header */}
      <div className="flex-shrink-0 overflow-x-auto" style={{ background: 'var(--vos-bg-surface)' }}>
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {result.columns.map(col => (
                <th
                  key={col}
                  className="px-2 py-1.5 text-left font-medium"
                  style={{
                    background: 'var(--vos-bg-surface)',
                    borderBottom: '1px solid var(--vos-border-subtle)',
                    whiteSpace: 'nowrap',
                    minWidth: 80
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>
      {/* Virtualized body */}
      {result.rows.length > 0 ? (
        <VList style={{ flex: 1, overflowX: 'auto' }}>
          {result.rows.map((row, i) => (
            <div key={i} className="flex" style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
              {row.map((cell, j) => (
                <div
                  key={j}
                  className="px-2 py-1 flex-shrink-0"
                  style={{
                    whiteSpace: 'nowrap',
                    minWidth: 80,
                    maxWidth: 300,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {cell === null ? (
                    <span style={{ color: 'var(--vos-text-tertiary)', fontStyle: 'italic' }}>NULL</span>
                  ) : (
                    String(cell)
                  )}
                </div>
              ))}
            </div>
          ))}
        </VList>
      ) : (
        <div className="flex items-center justify-center py-8 text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
          无数据
        </div>
      )}
    </div>
  )

  return (
    <AppLayout
      sidebar={
        <AppSidebar width={220}>
          <SectionHeader
            title="连接"
            actions={
              <>
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
              </>
            }
          />

          {connections.map(conn => {
            const isConnected = connectedIds.has(conn.id)
            const isExpanded = expandedConns.has(conn.id)
            const connSchemas = schemas[conn.id] || []

            return (
              <div key={conn.id}>
                <div
                  className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs group"
                  style={{
                    background: selectedTable?.connId === conn.id ? 'var(--vos-bg-item-hover)' : 'transparent'
                  }}
                >
                  <button
                    type="button"
                    className="vos-btn-reset"
                    style={{ color: 'var(--vos-text-tertiary)' }}
                    onClick={() => toggleConn(conn.id)}
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <Database
                    size={12}
                    style={{ color: isConnected ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }}
                  />
                  <span
                    className="flex-1 truncate"
                    onClick={() => (isConnected ? toggleConn(conn.id) : connectTo(conn.id))}
                    onKeyDown={() => {}}
                  >
                    {conn.name}
                  </span>
                  <span className="hidden group-hover:flex gap-0.5">
                    {isConnected ? (
                      <button
                        type="button"
                        className="vos-btn-reset"
                        style={{ color: 'var(--vos-text-tertiary)' }}
                        title="Disconnect"
                        onClick={() => disconnectFrom(conn.id)}
                      >
                        <Unplug size={10} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="vos-btn-reset"
                        style={{ color: 'var(--vos-accent-primary)' }}
                        title="Connect"
                        onClick={() => connectTo(conn.id)}
                      >
                        <Zap size={10} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="vos-btn-reset"
                      style={{ color: 'var(--vos-text-tertiary)' }}
                      title="Delete"
                      onClick={() => deleteConn(conn.id)}
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                </div>
                {isExpanded &&
                  isConnected &&
                  connSchemas.map(schema => {
                    const schemaKey = `${conn.id}:${schema.name}`
                    const schemaExpanded = expandedSchemas.has(schemaKey)
                    return (
                      <div key={schema.name} className="ml-4">
                        <div
                          className="flex items-center gap-1 px-2 py-0.5 cursor-pointer text-xs"
                          style={{ color: 'var(--vos-text-secondary)' }}
                          onClick={() => toggleSchema(schemaKey)}
                          onKeyDown={() => {}}
                        >
                          {schemaExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          {schema.name}
                          <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                            ({schema.tables.length})
                          </span>
                        </div>
                        {schemaExpanded &&
                          schema.tables.map(t => (
                            <div
                              key={t.name}
                              className="flex items-center gap-1 ml-4 px-2 py-0.5 cursor-pointer text-xs rounded"
                              style={{
                                background:
                                  selectedTable?.table === t.name && selectedTable?.connId === conn.id
                                    ? 'var(--vos-accent-primary)'
                                    : 'transparent',
                                color:
                                  selectedTable?.table === t.name && selectedTable?.connId === conn.id
                                    ? '#fff'
                                    : 'var(--vos-text-primary)'
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
            <div
              className="flex-1 flex items-center justify-center text-xs"
              style={{ color: 'var(--vos-text-tertiary)' }}
            >
              无连接
            </div>
          )}
        </AppSidebar>
      }
      overlay={
        showForm ? (
          <ConnForm
            onClose={() => setShowForm(false)}
            onCreated={c => {
              setConnections(prev => [...prev, c])
              setShowForm(false)
            }}
          />
        ) : undefined
      }
    >
      {selectedTable ? (
        <>
          {/* Tab bar */}
          <div
            className="flex items-center h-9 flex-shrink-0 px-2 gap-1"
            style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
          >
            {(['structure', 'data', 'sql'] as const).map(tab => (
              <button
                type="button"
                key={tab}
                className="text-xs px-3 py-1 rounded cursor-pointer border-none capitalize"
                style={{
                  background: rightTab === tab ? 'var(--vos-accent-primary)' : 'transparent',
                  color: rightTab === tab ? '#fff' : 'var(--vos-text-secondary)'
                }}
                onClick={() => {
                  setRightTab(tab)
                  storage.setJSON('preferences', { rightTab: tab })
                }}
              >
                {tab === 'structure' ? (
                  <>
                    <Table size={10} className="inline mr-1" />
                    结构
                  </>
                ) : tab === 'data' ? (
                  <>
                    <Database size={10} className="inline mr-1" />
                    数据
                  </>
                ) : (
                  <>
                    <FileCode size={10} className="inline mr-1" />
                    SQL
                  </>
                )}
              </button>
            ))}
            <span className="flex-1" />
            <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
              {selectedTable.table}
            </span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner />
            </div>
          ) : rightTab === 'structure' && tableStructure ? (
            <div className="flex-1 overflow-auto text-xs p-3">
              <div className="font-medium mb-2">Columns</div>
              <table className="w-full mb-4" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Name', 'Type', 'Nullable', 'Default', 'PK'].map(h => (
                      <th
                        key={h}
                        className="px-2 py-1 text-left font-medium"
                        style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableStructure.columns.map((col: ColumnInfo) => (
                    <tr key={col.name} style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}>
                      <td className="px-2 py-1 font-mono">{col.name}</td>
                      <td className="px-2 py-1" style={{ color: 'var(--vos-accent-primary)' }}>
                        {col.data_type}
                      </td>
                      <td className="px-2 py-1">{col.nullable ? 'YES' : 'NO'}</td>
                      <td className="px-2 py-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                        {col.default_value ?? '—'}
                      </td>
                      <td className="px-2 py-1">{col.is_primary_key ? '🔑' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tableStructure.indexes.length > 0 && (
                <>
                  <div className="font-medium mb-2">索引</div>
                  <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Name', 'Columns', 'Unique'].map(h => (
                          <th
                            key={h}
                            className="px-2 py-1 text-left font-medium"
                            style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
                          >
                            {h}
                          </th>
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
              <div
                className="flex items-center justify-between px-3 py-1"
                style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
              >
                <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
                  {tableData.rows.length} 行 · {tableData.execution_time_ms}ms
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer border-none"
                    style={{
                      background: currentPage > 1 ? 'var(--vos-bg-item-hover)' : 'transparent',
                      color: currentPage > 1 ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)'
                    }}
                    disabled={currentPage <= 1}
                    onClick={() => loadPage(currentPage - 1)}
                  >
                    上一页
                  </button>
                  <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                    第 {currentPage} 页
                  </span>
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer border-none"
                    style={{
                      background: tableData.rows.length >= pageSize ? 'var(--vos-bg-item-hover)' : 'transparent',
                      color: tableData.rows.length >= pageSize ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)'
                    }}
                    disabled={tableData.rows.length < pageSize}
                    onClick={() => loadPage(currentPage + 1)}
                  >
                    下一页
                  </button>
                </div>
              </div>
              {renderDataTable(tableData)}
            </div>
          ) : rightTab === 'sql' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div
                className="flex-shrink-0"
                style={{ height: 160, borderBottom: '0.5px solid var(--vos-border-subtle)' }}
              >
                <textarea
                  ref={sqlRef}
                  className="vos-textarea w-full h-full p-3 font-mono resize-none"
                  placeholder="输入 SQL 查询..."
                  value={sqlText}
                  onChange={e => setSqlText(e.target.value)}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') executeSql()
                  }}
                />
              </div>
              <div
                className="flex items-center gap-2 px-3 py-1"
                style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
              >
                <button
                  type="button"
                  className="flex items-center gap-1 vos-btn-sm vos-btn-primary"
                  onClick={executeSql}
                >
                  <Play size={10} /> 执行
                </button>
                <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                  ⌘+Enter
                </span>
                {sqlResult && (
                  <span className="text-xs ml-auto" style={{ color: 'var(--vos-text-tertiary)' }}>
                    {sqlResult.affected_rows} affected · {sqlResult.execution_time_ms}ms
                  </span>
                )}
              </div>
              {sqlResult ? (
                renderDataTable(sqlResult)
              ) : (
                <div
                  className="flex-1 flex items-center justify-center text-xs"
                  style={{ color: 'var(--vos-text-tertiary)' }}
                >
                  执行查询以查看结果
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState icon={<Database size={48} />} title="数据库管理" description="选择左侧连接或创建新连接" />
      )}
    </AppLayout>
  )
}
