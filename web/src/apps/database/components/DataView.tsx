import {
  Check,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Filter,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Square,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FormSelect, Spinner } from '@/components/ui'
import { dbApi } from '../api'
import { useDatabaseStore } from '../stores'
import { DataGrid } from './DataGrid'
import { FilterPanel } from './FilterPanel'

export function DataView() {
  const {
    selectedNode,
    tableData,
    currentPage,
    pageSize,
    totalRows,
    filterPanelVisible,
    editingRows,
    loading,
    setTableData,
    setCurrentPage,
    setPageSize,
    setTotalRows,
    toggleFilterPanel,
    setEditingRow,
    clearEditingRows,
    setLoading
  } = useDatabaseStore()

  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [lastRefreshTime, setLastRefreshTime] = useState<string>('')
  const [currentSql, setCurrentSql] = useState('')

  const connId = selectedNode?.connId ?? ''
  const tableName = selectedNode?.name ?? ''
  const schema = selectedNode?.schema

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalRows / pageSize)), [totalRows, pageSize])

  const loadData = useCallback(async () => {
    if (!connId || !tableName) return
    setLoading(true)
    try {
      const result = await dbApi.getDbTableData(connId, tableName, currentPage, pageSize)
      if (result.data) {
        setTableData(result.data)
        setTotalRows(((result.data as Record<string, unknown>).row_count as number) ?? result.data.rows.length)
      }
      const sql = `SELECT * FROM ${schema ? `${schema}.` : ''}${tableName} LIMIT ${pageSize} OFFSET ${(currentPage - 1) * pageSize}`
      setCurrentSql(sql)
      setLastRefreshTime(new Date().toLocaleTimeString())
    } finally {
      setLoading(false)
    }
  }, [connId, tableName, schema, currentPage, pageSize, setLoading, setTableData, setTotalRows])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCellEdit = useCallback(
    (rowIndex: number, colIndex: number, value: unknown) => {
      if (!tableData) return
      const col = tableData.columns[colIndex]
      if (!col) return
      const existing = editingRows.get(rowIndex) ?? {}
      setEditingRow(rowIndex, { ...existing, [col]: value })
    },
    [tableData, editingRows, setEditingRow]
  )

  const handleSelectRow = useCallback((rowIndex: number, multi?: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(multi ? prev : [])
      if (next.has(rowIndex)) {
        next.delete(rowIndex)
      } else {
        next.add(rowIndex)
      }
      return next
    })
  }, [])

  const handleSave = useCallback(() => {
    clearEditingRows()
  }, [clearEditingRows])

  const handleDiscard = useCallback(() => {
    clearEditingRows()
    loadData()
  }, [clearEditingRows, loadData])

  const goToPage = useCallback(
    (page: number) => {
      const p = Math.max(1, Math.min(page, totalPages))
      setCurrentPage(p)
    },
    [totalPages, setCurrentPage]
  )

  const editedRowSet = useMemo(() => new Set(editingRows.keys()), [editingRows])

  const columns = tableData?.columns ?? []
  const columnTypes = tableData?.column_types
  const rows = tableData?.rows ?? []

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--vos-bg-surface)' }}>
      <div
        className="flex items-center gap-1 px-2 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
      >
        <button
          className="p-1.5 rounded hover:bg-(--vos-bg-hover)"
          title="保存修改"
          onClick={handleSave}
          disabled={editingRows.size === 0}
        >
          <Save
            size={15}
            style={{ color: editingRows.size > 0 ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }}
          />
        </button>
        <button
          className="p-1.5 rounded hover:bg-(--vos-bg-hover)"
          title="撤销修改"
          onClick={handleDiscard}
          disabled={editingRows.size === 0}
        >
          <RotateCcw
            size={15}
            style={{ color: editingRows.size > 0 ? 'var(--vos-warning)' : 'var(--vos-text-tertiary)' }}
          />
        </button>
        <div className="w-px h-4 mx-1" style={{ background: 'var(--vos-border-subtle)' }} />
        <button
          className="p-1.5 rounded hover:bg-(--vos-bg-hover)"
          title="筛选面板"
          onClick={toggleFilterPanel}
          style={{ color: filterPanelVisible ? 'var(--vos-accent-primary)' : 'var(--vos-text-secondary)' }}
        >
          <Filter size={15} />
        </button>
        <div className="flex-1" />
        <button className="p-1.5 rounded hover:bg-(--vos-bg-hover)" title="刷新" onClick={loadData}>
          <RefreshCw size={15} style={{ color: 'var(--vos-text-secondary)' }} />
        </button>
        <button className="p-1.5 rounded hover:bg-(--vos-bg-hover)" title="停止">
          <Square size={15} style={{ color: 'var(--vos-text-secondary)' }} />
        </button>
      </div>

      {filterPanelVisible && <FilterPanel columns={columns} />}

      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center z-20"
            style={{ background: 'var(--vos-bg-overlay)' }}
          >
            <Spinner />
          </div>
        )}
        <DataGrid
          columns={columns}
          columnTypes={columnTypes}
          rows={rows}
          onCellEdit={handleCellEdit}
          selectedRows={selectedRows}
          onSelectRow={handleSelectRow}
          editedRows={editedRowSet}
        />
      </div>

      <div
        className="flex items-center gap-1 px-2 py-1 shrink-0 text-xs"
        style={{
          borderTop: '1px solid var(--vos-border-subtle)',
          background: 'var(--vos-bg-elevated)',
          color: 'var(--vos-text-secondary)'
        }}
      >
        <div className="flex items-center gap-0.5 shrink-0">
          <button className="p-1 rounded hover:bg-(--vos-bg-hover)" title="添加行">
            <Plus size={13} style={{ color: 'var(--vos-text-secondary)' }} />
          </button>
          <button className="p-1 rounded hover:bg-(--vos-bg-hover)" title="删除行">
            <Minus size={13} style={{ color: 'var(--vos-text-secondary)' }} />
          </button>
          <button className="p-1 rounded hover:bg-(--vos-bg-hover)" title="确认">
            <Check size={13} style={{ color: 'var(--vos-text-secondary)' }} />
          </button>
          <button className="p-1 rounded hover:bg-(--vos-bg-hover)" title="取消">
            <X size={13} style={{ color: 'var(--vos-text-secondary)' }} />
          </button>
          <button className="p-1 rounded hover:bg-(--vos-bg-hover)" title="撤销">
            <RotateCcw size={13} style={{ color: 'var(--vos-text-secondary)' }} />
          </button>
          <button className="p-1 rounded hover:bg-(--vos-bg-hover)" title="停止">
            <Square size={13} style={{ color: 'var(--vos-text-secondary)' }} />
          </button>
        </div>

        <div
          className="flex-1 px-2 truncate"
          style={{ color: 'var(--vos-text-tertiary)', fontFamily: 'monospace', fontSize: 11 }}
          title={currentSql}
        >
          {currentSql}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            className="p-1 rounded hover:bg-(--vos-bg-hover)"
            disabled={currentPage <= 1}
            onClick={() => goToPage(1)}
          >
            <ChevronFirst size={13} />
          </button>
          <button
            className="p-1 rounded hover:bg-(--vos-bg-hover)"
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            <ChevronLeft size={13} />
          </button>
          <span className="px-1">
            {currentPage} / {totalPages}
          </span>
          <button
            className="p-1 rounded hover:bg-(--vos-bg-hover)"
            disabled={currentPage >= totalPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            <ChevronRight size={13} />
          </button>
          <button
            className="p-1 rounded hover:bg-(--vos-bg-hover)"
            disabled={currentPage >= totalPages}
            onClick={() => goToPage(totalPages)}
          >
            <ChevronLast size={13} />
          </button>
          <div className="w-px h-3 mx-1" style={{ background: 'var(--vos-border-subtle)' }} />
          <FormSelect
            variant="toolbar"
            className="text-xs"
            wrapperClassName="w-[92px]"
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value))
              setCurrentPage(1)
            }}
          >
            {[50, 100, 500, 1000, 5000].map(s => (
              <option key={s} value={s}>
                {s} 条/页
              </option>
            ))}
          </FormSelect>
          <span className="px-1" style={{ color: 'var(--vos-text-tertiary)' }}>
            共 {totalRows} 条
          </span>
          {lastRefreshTime && <span style={{ color: 'var(--vos-text-tertiary)' }}>{lastRefreshTime}</span>}
        </div>
      </div>
    </div>
  )
}
