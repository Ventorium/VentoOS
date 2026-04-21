import {
  ArrowDown,
  ArrowUp,
  Eye,
  FunctionSquare,
  Grid3x3,
  List,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  Zap
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useDatabaseStore } from '../stores'
import { type DbEngine, type DbObject, OBJECT_CATEGORIES, type ObjectCategory, type SchemaInfo } from '../types'

type ViewMode = 'list' | 'grid'
type SortField = string
type SortDir = 'asc' | 'desc'

const CATEGORY_ICONS: Record<string, typeof Table2> = {
  tables: Table2,
  views: Eye,
  materialized_views: Eye,
  functions: FunctionSquare,
  events: Zap,
  triggers: Zap,
  queries: FunctionSquare
}

function getObjectsFromSchemas(schemas: SchemaInfo[], category: ObjectCategory): DbObject[] {
  if (category !== 'tables') return []
  const objects: DbObject[] = []
  for (const schema of schemas) {
    for (const t of schema.tables) {
      objects.push({
        name: t.name,
        type: 'table',
        schema: schema.name,
        rowCount: t.row_count ?? undefined,
        tableType: t.table_type
      })
    }
  }
  return objects
}

function getColumnsForEngine(engine: DbEngine): { key: string; label: string; width?: string }[] {
  switch (engine) {
    case 'postgresql':
      return [
        { key: 'name', label: '名称', width: '30%' },
        { key: 'oid', label: 'OID', width: '8%' },
        { key: 'owner', label: '所有者', width: '12%' },
        { key: 'acl', label: 'ACL', width: '12%' },
        { key: 'tableType', label: '表类型', width: '10%' },
        { key: 'rowCount', label: '行', width: '10%' },
        { key: 'primaryKeyCount', label: '主键', width: '8%' }
      ]
    case 'mysql':
      return [
        { key: 'name', label: '名称', width: '24%' },
        { key: 'engine', label: '引擎', width: '10%' },
        { key: 'rowCount', label: '行', width: '10%' },
        { key: 'dataSize', label: '数据大小', width: '12%' },
        { key: 'indexSize', label: '索引大小', width: '12%' },
        { key: 'charset', label: '字符集', width: '12%' },
        { key: 'comment', label: '注释', width: '20%' }
      ]
    case 'sqlite':
      return [
        { key: 'name', label: '名称', width: '50%' },
        { key: 'rowCount', label: '行', width: '25%' },
        { key: 'tableType', label: '类型', width: '25%' }
      ]
  }
}

export function ObjectBrowser() {
  const {
    activeCategory,
    objectSearchQuery,
    setActiveCategory,
    setObjectSearchQuery,
    selectedNode,
    schemas,
    addTab,
    setActiveTab
  } = useDatabaseStore()

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [searchVisible, setSearchVisible] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const engine: DbEngine = selectedNode?.engine ?? 'postgresql'
  const connId = selectedNode?.connId ?? ''

  const categories = useMemo(() => OBJECT_CATEGORIES[engine] ?? [], [engine])
  const columns = useMemo(() => getColumnsForEngine(engine), [engine])

  const connSchemas = useMemo(() => schemas[connId] ?? [], [schemas, connId])
  const objects = useMemo(() => getObjectsFromSchemas(connSchemas, activeCategory), [connSchemas, activeCategory])

  const filtered = useMemo(() => {
    const q = objectSearchQuery.toLowerCase().trim()
    if (!q) return objects
    return objects.filter(o => o.name.toLowerCase().includes(q))
  }, [objects, objectSearchQuery])

  const sorted = useMemo(() => {
    if (!sortField) return filtered
    return [...filtered].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortField]
      const bv = (b as unknown as Record<string, unknown>)[sortField]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortField, sortDir])

  const handleSort = useCallback((field: string) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
        return field
      }
      setSortDir('asc')
      return field
    })
  }, [])

  const handleDoubleClick = useCallback(
    (obj: DbObject) => {
      if (!connId) return
      const tabId = `data-${connId}-${obj.schema ?? ''}-${obj.name}`
      addTab({
        id: tabId,
        type: 'data',
        label: obj.name,
        connId,
        schema: obj.schema,
        table: obj.name,
        closable: true
      })
      setActiveTab(tabId)
    },
    [connId, addTab, setActiveTab]
  )

  const CatIcon = CATEGORY_ICONS[activeCategory] ?? Table2

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--vos-bg-surface)' }}>
      <div
        className="flex items-center gap-1 px-2 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
      >
        <button className="p-1.5 rounded hover:bg-(--vos-bg-hover)" title="新建">
          <Plus size={15} style={{ color: 'var(--vos-text-secondary)' }} />
        </button>
        <button className="p-1.5 rounded hover:bg-(--vos-bg-hover)" title="编辑">
          <Pencil size={15} style={{ color: 'var(--vos-text-secondary)' }} />
        </button>
        <button className="p-1.5 rounded hover:bg-(--vos-bg-hover)" title="删除">
          <Trash2 size={15} style={{ color: 'var(--vos-text-secondary)' }} />
        </button>
        <button className="p-1.5 rounded hover:bg-(--vos-bg-hover)" title="刷新">
          <RefreshCw size={15} style={{ color: 'var(--vos-text-secondary)' }} />
        </button>
        <div className="flex-1" />
        <button
          className="p-1.5 rounded hover:bg-(--vos-bg-hover)"
          title="列表视图"
          onClick={() => setViewMode('list')}
          style={{ color: viewMode === 'list' ? 'var(--vos-accent-primary)' : 'var(--vos-text-secondary)' }}
        >
          <List size={15} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-(--vos-bg-hover)"
          title="网格视图"
          onClick={() => setViewMode('grid')}
          style={{ color: viewMode === 'grid' ? 'var(--vos-accent-primary)' : 'var(--vos-text-secondary)' }}
        >
          <Grid3x3 size={15} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-(--vos-bg-hover)"
          title="搜索"
          onClick={() => setSearchVisible(v => !v)}
          style={{ color: searchVisible ? 'var(--vos-accent-primary)' : 'var(--vos-text-secondary)' }}
        >
          <Search size={15} />
        </button>
      </div>

      {searchVisible && (
        <div className="px-2 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}>
          <input
            className="w-full px-2 py-1 rounded text-xs outline-none"
            style={{
              background: 'var(--vos-bg-input)',
              color: 'var(--vos-text-primary)',
              border: '1px solid var(--vos-border-subtle)'
            }}
            placeholder="搜索对象..."
            value={objectSearchQuery}
            onChange={e => setObjectSearchQuery(e.target.value)}
            autoFocus
          />
        </div>
      )}

      <div
        className="flex gap-0 shrink-0 overflow-x-auto px-2"
        style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
      >
        {categories.map(cat => (
          <button
            key={cat.key}
            className="px-3 py-2 text-xs whitespace-nowrap relative"
            style={{
              color: activeCategory === cat.key ? 'var(--vos-accent-primary)' : 'var(--vos-text-secondary)',
              fontWeight: activeCategory === cat.key ? 600 : 400
            }}
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.label}
            {activeCategory === cat.key && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: 'var(--vos-accent-primary)' }}
              />
            )}
          </button>
        ))}
      </div>

      {viewMode === 'list' ? (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr
                className="sticky top-0 z-10"
                style={{
                  background: 'var(--vos-bg-elevated)',
                  borderBottom: '1px solid var(--vos-border-subtle)'
                }}
              >
                {columns.map(col => (
                  <th
                    key={col.key}
                    className="px-2 py-1.5 text-left font-medium cursor-pointer select-none"
                    style={{
                      color: 'var(--vos-text-secondary)',
                      width: col.width
                    }}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortField === col.key && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((obj, idx) => (
                <tr
                  key={`${obj.schema}-${obj.name}`}
                  className="cursor-pointer"
                  style={{
                    background: selectedIndex === idx ? 'var(--vos-bg-selected)' : 'transparent',
                    color: 'var(--vos-text-primary)',
                    borderBottom: '1px solid var(--vos-border-subtle)'
                  }}
                  onClick={() => setSelectedIndex(idx)}
                  onDoubleClick={() => handleDoubleClick(obj)}
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-2 py-1.5">
                      {col.key === 'name' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CatIcon size={14} style={{ color: 'var(--vos-accent-primary)' }} />
                          {obj.name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--vos-text-secondary)' }}>
                          {(obj as unknown as Record<string, unknown>)[col.key] != null
                            ? String((obj as unknown as Record<string, unknown>)[col.key])
                            : '—'}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center"
                    style={{ color: 'var(--vos-text-tertiary)' }}
                  >
                    暂无对象
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-2">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {sorted.map((obj, idx) => (
              <div
                key={`${obj.schema}-${obj.name}`}
                className="flex flex-col items-center gap-1 p-3 rounded cursor-pointer"
                style={{
                  background: selectedIndex === idx ? 'var(--vos-bg-selected)' : 'var(--vos-bg-elevated)',
                  border: '1px solid var(--vos-border-subtle)'
                }}
                onClick={() => setSelectedIndex(idx)}
                onDoubleClick={() => handleDoubleClick(obj)}
              >
                <CatIcon size={28} style={{ color: 'var(--vos-accent-primary)' }} />
                <span className="text-xs truncate max-w-full" style={{ color: 'var(--vos-text-primary)' }}>
                  {obj.name}
                </span>
                {obj.rowCount != null && (
                  <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
                    {obj.rowCount} 行
                  </span>
                )}
              </div>
            ))}
            {sorted.length === 0 && (
              <div className="col-span-full py-8 text-center text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
                暂无对象
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
