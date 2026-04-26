import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectBrowser } from '../components/ObjectBrowser'
import { SqlEditor } from '../components/SqlEditor'
import { TableDesigner } from '../components/TableDesigner'
import { dbApi } from '../api'
import { useDatabaseStore } from '../stores'

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../api', () => ({
  dbApi: {
    executeDbSql: vi.fn()
  }
}))

vi.mock('@/components/Toast', () => ({
  toast: toastMock
}))

function resetStore() {
  useDatabaseStore.setState({
    connections: [],
    connectionStatuses: {},
    schemas: {},
    expandedNodes: new Set(),
    selectedNodeId: 'conn-1',
    selectedNode: {
      id: 'conn-1',
      type: 'connection',
      name: 'Local MySQL',
      connId: 'conn-1',
      database: 'testdb',
      engine: 'mysql'
    },
    tabs: [{ id: 'objects', type: 'objects', label: '对象', connId: '', closable: false }],
    activeTabId: 'objects',
    activeCategory: 'tables',
    objectSearchQuery: '',
    tableData: null,
    tableStructure: {
      table_name: 'users',
      columns: [
        {
          name: 'id',
          data_type: 'int',
          nullable: false,
          default_value: null,
          is_primary_key: true
        }
      ],
      indexes: []
    },
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

describe('Database behaviors', () => {
  beforeEach(() => {
    resetStore()
    toastMock.success.mockReset()
    toastMock.error.mockReset()
    vi.mocked(dbApi.executeDbSql).mockReset()
  })

  it('saves the current SQL into saved queries', async () => {
    useDatabaseStore.getState().setSqlText('SELECT * FROM users')

    render(<SqlEditor />)

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(useDatabaseStore.getState().savedQueries).toHaveLength(1))
    expect(useDatabaseStore.getState().savedQueries[0].sql).toBe('SELECT * FROM users')
    expect(toastMock.success).toHaveBeenCalled()
  })

  it('submits generated DDL through executeDbSql', async () => {
    useDatabaseStore.getState().setSelectedNode('table-users', {
      id: 'table-users',
      type: 'table',
      name: 'users',
      connId: 'conn-1',
      database: 'testdb',
      schema: 'public',
      engine: 'mysql'
    })
    vi.mocked(dbApi.executeDbSql).mockResolvedValue({
      data: { columns: [], rows: [], affected_rows: 0, execution_time_ms: 5 }
    } as never)

    render(<TableDesigner />)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(dbApi.executeDbSql).toHaveBeenCalledWith('conn-1', expect.stringContaining('CREATE TABLE "users"')))
  })

  it('opens a saved query from the queries category', async () => {
    useDatabaseStore.getState().setSavedQueries([
      {
        id: 'saved-query-1',
        name: 'Recent users',
        sql: 'SELECT * FROM users ORDER BY created_at DESC',
        connId: 'conn-1',
        database: 'testdb',
        updatedAt: 1
      }
    ])
    useDatabaseStore.getState().setActiveCategory('queries')

    render(<ObjectBrowser />)

    fireEvent.doubleClick(screen.getByText('Recent users'))

    await waitFor(() => expect(useDatabaseStore.getState().activeTabId).toContain('query-conn-1'))
    expect(useDatabaseStore.getState().sqlText).toBe('SELECT * FROM users ORDER BY created_at DESC')
  })
})
