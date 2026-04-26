/**
 * Database App — Zustand Store
 * Central state management for the database application
 */

import { create } from 'zustand'
import type {
  ConnectionStatus,
  DbConnectionConfig,
  DbEngine,
  FilterCondition,
  InfoPanelData,
  ObjectCategory,
  QueryResult,
  SavedQuery,
  SchemaInfo,
  SortRule,
  TabItem,
  TableStructure,
  TreeNode
} from '../types'

// ── Store interface ────────────────────────────────────────────────────────

export interface DatabaseStore {
  // ── Connections ──
  connections: DbConnectionConfig[]
  connectionStatuses: Record<string, ConnectionStatus>
  schemas: Record<string, SchemaInfo[]>
  setConnections: (conns: DbConnectionConfig[]) => void
  addConnection: (conn: DbConnectionConfig) => void
  removeConnection: (id: string) => void
  setConnectionStatus: (id: string, status: ConnectionStatus) => void
  setSchemas: (connId: string, schemas: SchemaInfo[]) => void

  // ── Tree state ──
  expandedNodes: Set<string>
  selectedNodeId: string | null
  selectedNode: TreeNode | null
  toggleNode: (nodeId: string) => void
  expandNode: (nodeId: string) => void
  setSelectedNode: (nodeId: string | null, node?: TreeNode | null) => void

  // ── Tabs ──
  tabs: TabItem[]
  activeTabId: string
  addTab: (tab: TabItem) => void
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void

  // ── Object browser ──
  activeCategory: ObjectCategory
  objectSearchQuery: string
  setActiveCategory: (cat: ObjectCategory) => void
  setObjectSearchQuery: (q: string) => void

  // ── Data view ──
  tableData: QueryResult | null
  tableStructure: TableStructure | null
  currentPage: number
  pageSize: number
  totalRows: number
  filterConditions: FilterCondition[]
  sortRules: SortRule[]
  editingRows: Map<number, Record<string, unknown>>
  setTableData: (data: QueryResult | null) => void
  setTableStructure: (structure: TableStructure | null) => void
  setCurrentPage: (page: number) => void
  setPageSize: (size: number) => void
  setTotalRows: (total: number) => void
  setFilterConditions: (conditions: FilterCondition[]) => void
  setSortRules: (rules: SortRule[]) => void
  setEditingRow: (rowIndex: number, data: Record<string, unknown>) => void
  clearEditingRows: () => void

  // ── SQL editor ──
  sqlText: string
  sqlResults: QueryResult[]
  sqlActiveResultIndex: number
  savedQueries: SavedQuery[]
  setSqlText: (text: string) => void
  setSqlResults: (results: QueryResult[]) => void
  setSqlActiveResultIndex: (index: number) => void
  setSavedQueries: (queries: SavedQuery[]) => void
  upsertSavedQuery: (query: SavedQuery) => void
  removeSavedQuery: (id: string) => void

  // ── Info panel ──
  infoPanelVisible: boolean
  infoPanelData: InfoPanelData | null
  toggleInfoPanel: () => void
  setInfoPanelData: (data: InfoPanelData | null) => void

  // ── Filter panel ──
  filterPanelVisible: boolean
  toggleFilterPanel: () => void

  // ── Dialogs ──
  showNewConnectionTypeDialog: boolean
  showConnectionConfigDialog: boolean
  editingConnectionId: string | null
  editingConnectionEngine: DbEngine | null
  setShowNewConnectionTypeDialog: (show: boolean) => void
  openConnectionConfig: (engine: DbEngine, connectionId?: string) => void
  closeConnectionConfig: () => void

  // ── Loading ──
  loading: boolean
  setLoading: (loading: boolean) => void
}

// ── Store implementation ───────────────────────────────────────────────────

export const useDatabaseStore = create<DatabaseStore>((set, get) => ({
  // Connections
  connections: [],
  connectionStatuses: {},
  schemas: {},
  setConnections: conns => set({ connections: conns }),
  addConnection: conn => set(s => ({ connections: [...s.connections, conn] })),
  removeConnection: id =>
    set(s => ({
      connections: s.connections.filter(c => c.id !== id)
    })),
  setConnectionStatus: (id, status) =>
    set(s => ({
      connectionStatuses: { ...s.connectionStatuses, [id]: status }
    })),
  setSchemas: (connId, schemas) =>
    set(s => ({
      schemas: { ...s.schemas, [connId]: schemas }
    })),

  // Tree
  expandedNodes: new Set<string>(),
  selectedNodeId: null,
  selectedNode: null,
  toggleNode: nodeId =>
    set(s => {
      const next = new Set(s.expandedNodes)
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId)
      return { expandedNodes: next }
    }),
  expandNode: nodeId =>
    set(s => {
      const next = new Set(s.expandedNodes)
      next.add(nodeId)
      return { expandedNodes: next }
    }),
  setSelectedNode: (nodeId, node) =>
    set({
      selectedNodeId: nodeId,
      selectedNode: node ?? null
    }),

  // Tabs
  tabs: [{ id: 'objects', type: 'objects' as const, label: '对象', connId: '', closable: false }],
  activeTabId: 'objects',
  addTab: tab =>
    set(s => {
      const exists = s.tabs.find(t => t.id === tab.id)
      if (exists) return { activeTabId: tab.id }
      return { tabs: [...s.tabs, tab], activeTabId: tab.id }
    }),
  removeTab: tabId =>
    set(s => {
      const tabs = s.tabs.filter(t => t.id !== tabId)
      const activeTabId = s.activeTabId === tabId ? (tabs[tabs.length - 1]?.id ?? 'objects') : s.activeTabId
      return { tabs, activeTabId }
    }),
  setActiveTab: tabId => set({ activeTabId: tabId }),

  // Object browser
  activeCategory: 'tables',
  objectSearchQuery: '',
  setActiveCategory: cat => set({ activeCategory: cat }),
  setObjectSearchQuery: q => set({ objectSearchQuery: q }),

  // Data view
  tableData: null,
  tableStructure: null,
  currentPage: 1,
  pageSize: 1000,
  totalRows: 0,
  filterConditions: [],
  sortRules: [],
  editingRows: new Map(),
  setTableData: data => set({ tableData: data }),
  setTableStructure: structure => set({ tableStructure: structure }),
  setCurrentPage: page => set({ currentPage: page }),
  setPageSize: size => set({ pageSize: size }),
  setTotalRows: total => set({ totalRows: total }),
  setFilterConditions: conditions => set({ filterConditions: conditions }),
  setSortRules: rules => set({ sortRules: rules }),
  setEditingRow: (rowIndex, data) =>
    set(s => {
      const next = new Map(s.editingRows)
      next.set(rowIndex, data)
      return { editingRows: next }
    }),
  clearEditingRows: () => set({ editingRows: new Map() }),

  // SQL editor
  sqlText: '',
  sqlResults: [],
  sqlActiveResultIndex: 0,
  savedQueries: [],
  setSqlText: text => set({ sqlText: text }),
  setSqlResults: results => set({ sqlResults: results }),
  setSqlActiveResultIndex: index => set({ sqlActiveResultIndex: index }),
  setSavedQueries: queries => set({ savedQueries: queries }),
  upsertSavedQuery: query =>
    set(s => {
      const existingIndex = s.savedQueries.findIndex(item => item.id === query.id)
      if (existingIndex === -1) {
        return { savedQueries: [query, ...s.savedQueries] }
      }

      const next = [...s.savedQueries]
      next[existingIndex] = query
      return { savedQueries: next.sort((left, right) => right.updatedAt - left.updatedAt) }
    }),
  removeSavedQuery: id =>
    set(s => ({
      savedQueries: s.savedQueries.filter(query => query.id !== id)
    })),

  // Info panel
  infoPanelVisible: false,
  infoPanelData: null,
  toggleInfoPanel: () => set(s => ({ infoPanelVisible: !s.infoPanelVisible })),
  setInfoPanelData: data => set({ infoPanelData: data }),

  // Filter panel
  filterPanelVisible: false,
  toggleFilterPanel: () => set(s => ({ filterPanelVisible: !s.filterPanelVisible })),

  // Dialogs
  showNewConnectionTypeDialog: false,
  showConnectionConfigDialog: false,
  editingConnectionId: null,
  editingConnectionEngine: null,
  setShowNewConnectionTypeDialog: show => set({ showNewConnectionTypeDialog: show }),
  openConnectionConfig: (engine, connectionId) =>
    set({
      showConnectionConfigDialog: true,
      editingConnectionEngine: engine,
      editingConnectionId: connectionId ?? null,
      showNewConnectionTypeDialog: false
    }),
  closeConnectionConfig: () =>
    set({
      showConnectionConfigDialog: false,
      editingConnectionEngine: null,
      editingConnectionId: null
    }),

  // Loading
  loading: false,
  setLoading: loading => set({ loading })
}))
