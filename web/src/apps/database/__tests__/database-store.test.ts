/**
 * Database App — Store Tests
 * Tests for the Zustand database store
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useDatabaseStore } from '../stores'
import type { DbConnectionConfig, FilterCondition, QueryResult, SavedQuery, SortRule, TabItem } from '../types'

const mockMysqlConn: DbConnectionConfig = {
  id: 'conn-1',
  name: 'Local MySQL',
  engine: 'mysql',
  host: '127.0.0.1',
  port: 3306,
  username: 'root',
  database: 'testdb',
  ssl_enabled: false
}

const mockPgConn: DbConnectionConfig = {
  id: 'conn-2',
  name: 'Remote PG',
  engine: 'postgresql',
  host: '10.0.0.1',
  port: 5432,
  username: 'postgres',
  ssl_enabled: true
}

function resetStore() {
  useDatabaseStore.setState({
    connections: [],
    connectionStatuses: {},
    schemas: {},
    expandedNodes: new Set(),
    selectedNodeId: null,
    selectedNode: null,
    tabs: [{ id: 'objects', type: 'objects', label: '对象', connId: '', closable: false }],
    activeTabId: 'objects',
    activeCategory: 'tables',
    objectSearchQuery: '',
    tableData: null,
    tableStructure: null,
    currentPage: 1,
    pageSize: 1000,
    totalRows: 0,
    filterConditions: [],
    sortRules: [],
    editingRows: new Map(),
    sqlText: '',
    sqlResults: [],
    sqlActiveResultIndex: 0,
    savedQueries: [],
    infoPanelVisible: false,
    infoPanelData: null,
    filterPanelVisible: false,
    showNewConnectionTypeDialog: false,
    showConnectionConfigDialog: false,
    editingConnectionId: null,
    editingConnectionEngine: null,
    loading: false
  })
}

// ── Connections ─────────────────────────────────────────────────────────────

describe('DatabaseStore – Connections', () => {
  beforeEach(resetStore)

  it('adds a connection', () => {
    useDatabaseStore.getState().addConnection(mockMysqlConn)
    expect(useDatabaseStore.getState().connections).toHaveLength(1)
    expect(useDatabaseStore.getState().connections[0]).toEqual(mockMysqlConn)
  })

  it('setConnections replaces all connections', () => {
    useDatabaseStore.getState().addConnection(mockMysqlConn)
    useDatabaseStore.getState().setConnections([mockPgConn])
    const { connections } = useDatabaseStore.getState()
    expect(connections).toHaveLength(1)
    expect(connections[0].id).toBe('conn-2')
  })

  it('removes a connection by id', () => {
    useDatabaseStore.getState().setConnections([mockMysqlConn, mockPgConn])
    useDatabaseStore.getState().removeConnection('conn-1')
    const { connections } = useDatabaseStore.getState()
    expect(connections).toHaveLength(1)
    expect(connections[0].id).toBe('conn-2')
  })

  it('sets connection status', () => {
    useDatabaseStore.getState().setConnectionStatus('conn-1', 'connected')
    expect(useDatabaseStore.getState().connectionStatuses['conn-1']).toBe('connected')
    useDatabaseStore.getState().setConnectionStatus('conn-1', 'error')
    expect(useDatabaseStore.getState().connectionStatuses['conn-1']).toBe('error')
  })

  it('stores schema info per connection', () => {
    const schemas = [{ name: 'public', tables: [{ name: 'users', row_count: 100, table_type: 'BASE TABLE' }] }]
    useDatabaseStore.getState().setSchemas('conn-2', schemas)
    expect(useDatabaseStore.getState().schemas['conn-2']).toEqual(schemas)
    expect(useDatabaseStore.getState().schemas['conn-1']).toBeUndefined()
  })
})

// ── Tree state ───────────────────────────────────────────────────────────────

describe('DatabaseStore – Tree State', () => {
  beforeEach(resetStore)

  it('toggles node expansion', () => {
    const { toggleNode } = useDatabaseStore.getState()
    toggleNode('conn-1')
    expect(useDatabaseStore.getState().expandedNodes.has('conn-1')).toBe(true)
    toggleNode('conn-1')
    expect(useDatabaseStore.getState().expandedNodes.has('conn-1')).toBe(false)
  })

  it('expands node without collapsing', () => {
    useDatabaseStore.getState().expandNode('conn-2')
    expect(useDatabaseStore.getState().expandedNodes.has('conn-2')).toBe(true)
    useDatabaseStore.getState().expandNode('conn-2')
    expect(useDatabaseStore.getState().expandedNodes.has('conn-2')).toBe(true)
  })

  it('sets selected node', () => {
    const node = {
      id: 'conn-1',
      type: 'connection' as const,
      label: 'Local MySQL',
      connId: 'conn-1',
      engine: 'mysql' as const
    }
    useDatabaseStore.getState().setSelectedNode('conn-1', node as never)
    expect(useDatabaseStore.getState().selectedNodeId).toBe('conn-1')
    expect(useDatabaseStore.getState().selectedNode).not.toBeNull()
  })

  it('clears selected node when null passed', () => {
    useDatabaseStore.getState().setSelectedNode(null)
    expect(useDatabaseStore.getState().selectedNodeId).toBeNull()
    expect(useDatabaseStore.getState().selectedNode).toBeNull()
  })
})

// ── Tabs ───────────────────────────────────────────────────────────────────

describe('DatabaseStore – Tabs', () => {
  beforeEach(resetStore)

  it('has default objects tab on init', () => {
    expect(useDatabaseStore.getState().tabs).toHaveLength(1)
    expect(useDatabaseStore.getState().activeTabId).toBe('objects')
  })

  it('adds a new tab and sets it active', () => {
    const tab: TabItem = { id: 'sql-1', type: 'sql', label: 'Query 1', connId: 'conn-1', closable: true }
    useDatabaseStore.getState().addTab(tab)
    expect(useDatabaseStore.getState().tabs).toHaveLength(2)
    expect(useDatabaseStore.getState().activeTabId).toBe('sql-1')
  })

  it('does not duplicate tabs with same id', () => {
    const tab: TabItem = { id: 'sql-1', type: 'sql', label: 'Query 1', connId: 'conn-1', closable: true }
    useDatabaseStore.getState().addTab(tab)
    useDatabaseStore.getState().addTab(tab)
    expect(useDatabaseStore.getState().tabs).toHaveLength(2)
  })

  it('removes a tab and falls back to last tab', () => {
    const tab1: TabItem = { id: 'sql-1', type: 'sql', label: 'Q1', connId: 'conn-1', closable: true }
    const tab2: TabItem = { id: 'sql-2', type: 'sql', label: 'Q2', connId: 'conn-1', closable: true }
    useDatabaseStore.getState().addTab(tab1)
    useDatabaseStore.getState().addTab(tab2)
    useDatabaseStore.getState().removeTab('sql-2')
    const { tabs, activeTabId } = useDatabaseStore.getState()
    expect(tabs).toHaveLength(2)
    expect(activeTabId).toBe('sql-1')
  })

  it('switches active tab', () => {
    const tab: TabItem = {
      id: 'data-1',
      type: 'data',
      label: 'users',
      connId: 'conn-1',
      table: 'users',
      closable: true
    }
    useDatabaseStore.getState().addTab(tab)
    useDatabaseStore.getState().setActiveTab('objects')
    expect(useDatabaseStore.getState().activeTabId).toBe('objects')
  })
})

// ── Object browser ───────────────────────────────────────────────────────────

describe('DatabaseStore – Object Browser', () => {
  beforeEach(resetStore)

  it('changes active category', () => {
    useDatabaseStore.getState().setActiveCategory('views')
    expect(useDatabaseStore.getState().activeCategory).toBe('views')
  })

  it('sets object search query', () => {
    useDatabaseStore.getState().setObjectSearchQuery('user')
    expect(useDatabaseStore.getState().objectSearchQuery).toBe('user')
  })
})

// ── Data view ────────────────────────────────────────────────────────────────

describe('DatabaseStore – Data View', () => {
  beforeEach(resetStore)

  const mockData: QueryResult = {
    columns: ['id', 'name', 'email'],
    rows: [
      [1, 'Alice', 'alice@example.com'],
      [2, 'Bob', 'bob@example.com']
    ],
    rowCount: 2,
    executionTime: 12
  }

  it('sets table data', () => {
    useDatabaseStore.getState().setTableData(mockData)
    expect(useDatabaseStore.getState().tableData?.rowCount).toBe(2)
  })

  it('sets pagination state', () => {
    useDatabaseStore.getState().setCurrentPage(3)
    useDatabaseStore.getState().setPageSize(100)
    useDatabaseStore.getState().setTotalRows(500)
    const s = useDatabaseStore.getState()
    expect(s.currentPage).toBe(3)
    expect(s.pageSize).toBe(100)
    expect(s.totalRows).toBe(500)
  })

  it('sets filter conditions', () => {
    const conditions: FilterCondition[] = [{ column: 'name', operator: 'contains', value: 'Alice' }]
    useDatabaseStore.getState().setFilterConditions(conditions)
    expect(useDatabaseStore.getState().filterConditions).toHaveLength(1)
    expect(useDatabaseStore.getState().filterConditions[0].column).toBe('name')
  })

  it('sets sort rules', () => {
    const rules: SortRule[] = [{ column: 'id', direction: 'asc' }]
    useDatabaseStore.getState().setSortRules(rules)
    expect(useDatabaseStore.getState().sortRules).toHaveLength(1)
  })

  it('tracks editing rows', () => {
    useDatabaseStore.getState().setEditingRow(0, { name: 'Alice Updated' })
    expect(useDatabaseStore.getState().editingRows.get(0)).toEqual({ name: 'Alice Updated' })
    useDatabaseStore.getState().clearEditingRows()
    expect(useDatabaseStore.getState().editingRows.size).toBe(0)
  })
})

// ── SQL Editor ───────────────────────────────────────────────────────────────

describe('DatabaseStore – SQL Editor', () => {
  beforeEach(resetStore)

  const savedQuery: SavedQuery = {
    id: 'saved-query-1',
    name: 'Recent users',
    sql: 'SELECT * FROM users ORDER BY created_at DESC',
    connId: 'conn-1',
    database: 'testdb',
    updatedAt: 1
  }

  it('sets SQL text', () => {
    useDatabaseStore.getState().setSqlText('SELECT * FROM users')
    expect(useDatabaseStore.getState().sqlText).toBe('SELECT * FROM users')
  })

  it('sets SQL results', () => {
    const result: QueryResult = { columns: ['id'], rows: [[1]], rowCount: 1, executionTime: 5 }
    useDatabaseStore.getState().setSqlResults([result])
    expect(useDatabaseStore.getState().sqlResults).toHaveLength(1)
  })

  it('sets active result index', () => {
    useDatabaseStore.getState().setSqlActiveResultIndex(2)
    expect(useDatabaseStore.getState().sqlActiveResultIndex).toBe(2)
  })

  it('upserts saved queries and keeps newest first', () => {
    useDatabaseStore.getState().upsertSavedQuery(savedQuery)
    useDatabaseStore.getState().upsertSavedQuery({
      ...savedQuery,
      id: 'saved-query-2',
      name: 'Audit log',
      updatedAt: 2
    })

    expect(useDatabaseStore.getState().savedQueries.map(query => query.id)).toEqual(['saved-query-2', 'saved-query-1'])
  })

  it('replaces an existing saved query by id', () => {
    useDatabaseStore.getState().upsertSavedQuery(savedQuery)
    useDatabaseStore.getState().upsertSavedQuery({
      ...savedQuery,
      sql: 'SELECT id FROM users',
      updatedAt: 3
    })

    const [query] = useDatabaseStore.getState().savedQueries
    expect(query.sql).toBe('SELECT id FROM users')
    expect(useDatabaseStore.getState().savedQueries).toHaveLength(1)
  })
})

// ── Info panel ──────────────────────────────────────────────────────────────

describe('DatabaseStore – Info Panel', () => {
  beforeEach(resetStore)

  it('toggles info panel visibility', () => {
    expect(useDatabaseStore.getState().infoPanelVisible).toBe(false)
    useDatabaseStore.getState().toggleInfoPanel()
    expect(useDatabaseStore.getState().infoPanelVisible).toBe(true)
    useDatabaseStore.getState().toggleInfoPanel()
    expect(useDatabaseStore.getState().infoPanelVisible).toBe(false)
  })

  it('sets info panel data', () => {
    const data = { type: 'table' as const, name: 'users', rowCount: 42, columns: 5 }
    useDatabaseStore.getState().setInfoPanelData(data)
    expect(useDatabaseStore.getState().infoPanelData).toEqual(data)
    useDatabaseStore.getState().setInfoPanelData(null)
    expect(useDatabaseStore.getState().infoPanelData).toBeNull()
  })
})

// ── Filter panel ───────────────────────────────────────────────────────────

describe('DatabaseStore – Filter Panel', () => {
  beforeEach(resetStore)

  it('toggles filter panel', () => {
    expect(useDatabaseStore.getState().filterPanelVisible).toBe(false)
    useDatabaseStore.getState().toggleFilterPanel()
    expect(useDatabaseStore.getState().filterPanelVisible).toBe(true)
  })
})

// ── Dialogs ─────────────────────────────────────────────────────────────────

describe('DatabaseStore – Dialogs', () => {
  beforeEach(resetStore)

  it('shows/hides new connection type dialog', () => {
    useDatabaseStore.getState().setShowNewConnectionTypeDialog(true)
    expect(useDatabaseStore.getState().showNewConnectionTypeDialog).toBe(true)
    useDatabaseStore.getState().setShowNewConnectionTypeDialog(false)
    expect(useDatabaseStore.getState().showNewConnectionTypeDialog).toBe(false)
  })

  it('opens connection config dialog with engine and optional conn id', () => {
    useDatabaseStore.getState().openConnectionConfig('postgresql', 'conn-2')
    const s = useDatabaseStore.getState()
    expect(s.showConnectionConfigDialog).toBe(true)
    expect(s.editingConnectionEngine).toBe('postgresql')
    expect(s.editingConnectionId).toBe('conn-2')
    expect(s.showNewConnectionTypeDialog).toBe(false)
  })

  it('opens connection config without conn id for new connections', () => {
    useDatabaseStore.getState().openConnectionConfig('mysql')
    expect(useDatabaseStore.getState().editingConnectionId).toBeNull()
    expect(useDatabaseStore.getState().editingConnectionEngine).toBe('mysql')
  })

  it('closes connection config dialog and clears state', () => {
    useDatabaseStore.getState().openConnectionConfig('sqlite')
    useDatabaseStore.getState().closeConnectionConfig()
    const s = useDatabaseStore.getState()
    expect(s.showConnectionConfigDialog).toBe(false)
    expect(s.editingConnectionEngine).toBeNull()
    expect(s.editingConnectionId).toBeNull()
  })
})
