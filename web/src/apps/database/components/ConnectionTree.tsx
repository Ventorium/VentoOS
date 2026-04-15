import {
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FolderClosed,
  FunctionSquare,
  Link,
  Link2Off,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  Zap,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Spinner } from '@/components/ui'
import {
  OBJECT_CATEGORIES,
  type ConnectionStatus,
  type DbConnectionConfig,
  type SchemaInfo,
  type TreeNode,
  type TreeNodeType,
} from '../types'
import { dbApi } from '../api'
import { useDatabaseStore } from '../stores'

const CATEGORY_ICONS: Record<string, typeof Table2> = {
  tables: Table2,
  views: Eye,
  materialized_views: Eye,
  functions: FunctionSquare,
  events: Zap,
  triggers: Zap,
  queries: FunctionSquare,
}

function statusColor(status: ConnectionStatus | undefined): string {
  switch (status) {
    case 'connected':
      return 'var(--vos-success)'
    case 'connecting':
      return 'var(--vos-warning)'
    case 'error':
      return 'var(--vos-error)'
    default:
      return 'var(--vos-text-tertiary)'
  }
}

export function ConnectionTree() {
  const {
    connections,
    connectionStatuses,
    schemas,
    expandedNodes,
    selectedNodeId,
    toggleNode,
    setSelectedNode,
    setShowNewConnectionTypeDialog,
    setConnectionStatus,
    setSchemas,
    addTab,
    setActiveTab,
    setInfoPanelData,
  } = useDatabaseStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set())

  const filteredConnections = useMemo(() => {
    if (!searchQuery) return connections
    const q = searchQuery.toLowerCase()
    return connections.filter(
      (c) => c.name.toLowerCase().includes(q) || c.engine.toLowerCase().includes(q),
    )
  }, [connections, searchQuery])

  const handleConnect = useCallback(async (conn: DbConnectionConfig) => {
    setConnectionStatus(conn.id, 'connecting')
    try {
      await dbApi.connectDb(conn.id)
      setConnectionStatus(conn.id, 'connected')
      const res = await dbApi.getDbSchemas(conn.id)
      if (res.data) {
        setSchemas(conn.id, res.data)
      }
    } catch {
      setConnectionStatus(conn.id, 'error')
    }
  }, [setConnectionStatus, setSchemas])

  const handleDisconnect = useCallback(async (conn: DbConnectionConfig) => {
    try {
      await dbApi.disconnectDb(conn.id)
    } finally {
      setConnectionStatus(conn.id, 'disconnected')
    }
  }, [setConnectionStatus])

  const handleDelete = useCallback(async (conn: DbConnectionConfig) => {
    try {
      await dbApi.deleteDbConnection(conn.id)
      useDatabaseStore.getState().removeConnection(conn.id)
    } catch {
      // handled by api layer
    }
  }, [])

  const handleExpandConnection = useCallback(async (conn: DbConnectionConfig) => {
    const nodeId = `conn-${conn.id}`
    const status = connectionStatuses[conn.id]
    if (status !== 'connected') {
      setLoadingNodes((prev) => new Set(prev).add(nodeId))
      await handleConnect(conn)
      setLoadingNodes((prev) => {
        const next = new Set(prev)
        next.delete(nodeId)
        return next
      })
    }
    toggleNode(nodeId)
  }, [connectionStatuses, handleConnect, toggleNode])

  const handleNodeClick = useCallback((nodeId: string, node: TreeNode) => {
    setSelectedNode(nodeId, node)
    setInfoPanelData({
      type: node.type,
      name: node.name,
      engine: node.engine,
      meta: {},
    })
  }, [setSelectedNode, setInfoPanelData])

  const handleTableDoubleClick = useCallback((conn: DbConnectionConfig, schema: string, table: string) => {
    const tabId = `data-${conn.id}-${schema}-${table}`
    addTab({
      id: tabId,
      type: 'data',
      label: table,
      connId: conn.id,
      database: conn.database,
      schema,
      table,
      closable: true,
    })
    setActiveTab(tabId)
  }, [addTab, setActiveTab])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--vos-bg-surface)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--vos-border-subtle)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--vos-text-primary)' }}>连接</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="vos-icon-btn"
            title="刷新"
            onClick={() => {
              /* refresh handled per-connection */
            }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="vos-icon-btn"
            title="新建连接"
            onClick={() => setShowNewConnectionTypeDialog(true)}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto py-1">
        {filteredConnections.map((conn) => (
          <ConnectionNode
            key={conn.id}
            conn={conn}
            status={connectionStatuses[conn.id]}
            schemas={schemas[conn.id]}
            expandedNodes={expandedNodes}
            selectedNodeId={selectedNodeId}
            loadingNodes={loadingNodes}
            onExpand={() => handleExpandConnection(conn)}
            onConnect={() => handleConnect(conn)}
            onDisconnect={() => handleDisconnect(conn)}
            onDelete={() => handleDelete(conn)}
            onNodeClick={handleNodeClick}
            onTableDoubleClick={(schema, table) => handleTableDoubleClick(conn, schema, table)}
            onToggleNode={toggleNode}
          />
        ))}
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-t" style={{ borderColor: 'var(--vos-border-subtle)' }}>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--vos-text-tertiary)' }} />
          <input
            className="vos-input vos-input-sm w-full pl-6 text-xs"
            placeholder="搜索连接..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

// ── Connection Node ────────────────────────────────────────────────────────

function ConnectionNode({
  conn,
  status,
  schemas: schemaList,
  expandedNodes,
  selectedNodeId,
  loadingNodes,
  onExpand,
  onConnect,
  onDisconnect,
  onDelete,
  onNodeClick,
  onTableDoubleClick,
  onToggleNode,
}: {
  conn: DbConnectionConfig
  status: ConnectionStatus | undefined
  schemas: SchemaInfo[] | undefined
  expandedNodes: Set<string>
  selectedNodeId: string | null
  loadingNodes: Set<string>
  onExpand: () => void
  onConnect: () => void
  onDisconnect: () => void
  onDelete: () => void
  onNodeClick: (nodeId: string, node: TreeNode) => void
  onTableDoubleClick: (schema: string, table: string) => void
  onToggleNode: (nodeId: string) => void
}) {
  const nodeId = `conn-${conn.id}`
  const isExpanded = expandedNodes.has(nodeId)
  const isSelected = selectedNodeId === nodeId
  const isLoading = loadingNodes.has(nodeId)
  const isConnected = status === 'connected'
  const [hovered, setHovered] = useState(false)

  return (
    <div>
      <TreeItem
        depth={0}
        isExpanded={isExpanded}
        isSelected={isSelected}
        isLoading={isLoading}
        icon={<Database size={14} style={{ color: 'var(--vos-accent-primary)' }} />}
        label={conn.name}
        suffix={
          <div className="flex items-center gap-0.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mr-1"
              style={{ background: statusColor(status) }}
            />
            {hovered && (
              <>
                {isConnected ? (
                  <button type="button" className="vos-icon-btn" title="断开" onClick={(e) => { e.stopPropagation(); onDisconnect() }}>
                    <Link2Off size={12} />
                  </button>
                ) : (
                  <button type="button" className="vos-icon-btn" title="连接" onClick={(e) => { e.stopPropagation(); onConnect() }}>
                    <Link size={12} />
                  </button>
                )}
                <button type="button" className="vos-icon-btn" title="删除" onClick={(e) => { e.stopPropagation(); onDelete() }}>
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        }
        onClick={() => {
          onNodeClick(nodeId, { id: nodeId, type: 'connection', name: conn.name, engine: conn.engine, connId: conn.id })
          onExpand()
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      {isExpanded && isConnected && schemaList && (
        <SchemaNodes
          conn={conn}
          schemas={schemaList}
          expandedNodes={expandedNodes}
          selectedNodeId={selectedNodeId}
          onNodeClick={onNodeClick}
          onTableDoubleClick={onTableDoubleClick}
          onToggleNode={onToggleNode}
        />
      )}
    </div>
  )
}

// ── Schema Nodes ───────────────────────────────────────────────────────────

function SchemaNodes({
  conn,
  schemas: schemaList,
  expandedNodes,
  selectedNodeId,
  onNodeClick,
  onTableDoubleClick,
  onToggleNode,
}: {
  conn: DbConnectionConfig
  schemas: SchemaInfo[]
  expandedNodes: Set<string>
  selectedNodeId: string | null
  onNodeClick: (nodeId: string, node: TreeNode) => void
  onTableDoubleClick: (schema: string, table: string) => void
  onToggleNode: (nodeId: string) => void
}) {
  const hasMultipleSchemas = schemaList.length > 1

  if (!hasMultipleSchemas && schemaList.length === 1) {
    const schema = schemaList[0]
    return (
      <CategoryNodes
        conn={conn}
        schema={schema}
        depth={1}
        expandedNodes={expandedNodes}
        selectedNodeId={selectedNodeId}
        onNodeClick={onNodeClick}
        onTableDoubleClick={onTableDoubleClick}
        onToggleNode={onToggleNode}
      />
    )
  }

  return (
    <>
      {schemaList.map((schema) => {
        const schemaNodeId = `schema-${conn.id}-${schema.name}`
        const isExpanded = expandedNodes.has(schemaNodeId)
        return (
          <div key={schema.name}>
            <TreeItem
              depth={1}
              isExpanded={isExpanded}
              isSelected={selectedNodeId === schemaNodeId}
              icon={<FolderClosed size={14} style={{ color: 'var(--vos-text-secondary)' }} />}
              label={schema.name}
              onClick={() => {
                onNodeClick(schemaNodeId, {
                  id: schemaNodeId,
                  type: 'schema',
                  name: schema.name,
                  engine: conn.engine,
                  connId: conn.id,
                })
                onToggleNode(schemaNodeId)
              }}
            />
            {isExpanded && (
              <CategoryNodes
                conn={conn}
                schema={schema}
                depth={2}
                expandedNodes={expandedNodes}
                selectedNodeId={selectedNodeId}
                onNodeClick={onNodeClick}
                onTableDoubleClick={onTableDoubleClick}
                onToggleNode={onToggleNode}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

// ── Category Nodes (Tables / Views / Functions) ────────────────────────────

function CategoryNodes({
  conn,
  schema,
  depth,
  expandedNodes,
  selectedNodeId,
  onNodeClick,
  onTableDoubleClick,
  onToggleNode,
}: {
  conn: DbConnectionConfig
  schema: SchemaInfo
  depth: number
  expandedNodes: Set<string>
  selectedNodeId: string | null
  onNodeClick: (nodeId: string, node: TreeNode) => void
  onTableDoubleClick: (schema: string, table: string) => void
  onToggleNode: (nodeId: string) => void
}) {
  const categories = useMemo(() => {
    return OBJECT_CATEGORIES[conn.engine] ?? []
  }, [conn.engine])

  return (
    <>
      {categories.map((cat) => {
        const catNodeId = `cat-${conn.id}-${schema.name}-${cat.key}`
        const isExpanded = expandedNodes.has(catNodeId)
        const Icon = CATEGORY_ICONS[cat.key] ?? FolderClosed

        const items = cat.key === 'tables'
          ? schema.tables.filter((t) => t.table_type === 'BASE TABLE' || t.table_type === 'table')
          : cat.key === 'views'
            ? schema.tables.filter((t) => t.table_type === 'VIEW' || t.table_type === 'view')
            : []

        return (
          <div key={cat.key}>
            <TreeItem
              depth={depth}
              isExpanded={isExpanded}
              isSelected={selectedNodeId === catNodeId}
              icon={<Icon size={14} style={{ color: 'var(--vos-text-secondary)' }} />}
              label={`${cat.label} (${items.length})`}
              onClick={() => {
                onNodeClick(catNodeId, {
                  id: catNodeId,
                  type: 'category',
                  name: cat.label,
                  engine: conn.engine,
                  connId: conn.id,
                  database: conn.database,
                  schema: schema.name,
                })
                onToggleNode(catNodeId)
              }}
            />
            {isExpanded && items.map((item) => {
              const itemNodeId = `obj-${conn.id}-${schema.name}-${item.name}`
              const nodeType: TreeNodeType = item.table_type === 'VIEW' || item.table_type === 'view' ? 'view' : 'table'
              return (
                <TreeItem
                  key={item.name}
                  depth={depth + 1}
                  isSelected={selectedNodeId === itemNodeId}
                  icon={<Table2 size={13} style={{ color: 'var(--vos-text-tertiary)' }} />}
                  label={item.name}
                  onClick={() => {
                    onNodeClick(itemNodeId, {
                      id: itemNodeId,
                      type: nodeType,
                      name: item.name,
                      engine: conn.engine,
                      connId: conn.id,
                      database: conn.database,
                      schema: schema.name,
                    })
                  }}
                  onDoubleClick={() => onTableDoubleClick(schema.name, item.name)}
                />
              )
            })}
          </div>
        )
      })}
    </>
  )
}

// ── Generic Tree Item ──────────────────────────────────────────────────────

function TreeItem({
  depth,
  isExpanded,
  isSelected,
  isLoading,
  icon,
  label,
  suffix,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
}: {
  depth: number
  isExpanded?: boolean
  isSelected?: boolean
  isLoading?: boolean
  icon: React.ReactNode
  label: string
  suffix?: React.ReactNode
  onClick?: () => void
  onDoubleClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const hasChevron = isExpanded !== undefined

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 cursor-pointer text-xs select-none"
      style={{
        paddingLeft: `${depth * 16 + 8}px`,
        background: isSelected ? 'var(--vos-bg-active)' : 'transparent',
        color: 'var(--vos-text-primary)',
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {hasChevron && (
        <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
          {isLoading ? (
            <Spinner size={12} />
          ) : isExpanded ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
        </span>
      )}
      {!hasChevron && <span className="w-3.5 shrink-0" />}
      <span className="shrink-0">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {suffix}
    </div>
  )
}
