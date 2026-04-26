import { AlignLeft, Copy, Database, Play, Save, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import { dbApi } from '../api'
import { useDatabaseStore } from '../stores'
import type { QueryResult, SavedQuery } from '../types'

function formatSql(sql: string): string {
  const keywords = [
    'SELECT',
    'FROM',
    'WHERE',
    'AND',
    'OR',
    'INSERT',
    'INTO',
    'VALUES',
    'UPDATE',
    'SET',
    'DELETE',
    'CREATE',
    'TABLE',
    'ALTER',
    'DROP',
    'JOIN',
    'LEFT',
    'RIGHT',
    'INNER',
    'OUTER',
    'ON',
    'GROUP BY',
    'ORDER BY',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'UNION',
    'AS'
  ]
  let result = sql.trim()
  for (const kw of keywords) {
    result = result.replace(new RegExp(`\\b${kw}\\b`, 'gi'), `\n${kw}`)
  }
  return result.replace(/^\n/, '').replace(/\n{2,}/g, '\n')
}

function buildSavedQuery(sql: string, connId: string, connName: string, dbName: string): SavedQuery {
  const now = Date.now()
  const firstLine = sql
    .split('\n')
    .map(line => line.trim())
    .find(Boolean)
  const compact = firstLine ?? '未命名查询'
  const name = compact.length > 48 ? `${compact.slice(0, 48)}...` : compact

  return {
    id: `saved-query-${connId}-${now}`,
    name,
    sql,
    connId,
    database: dbName || connName || undefined,
    updatedAt: now
  }
}

export function SqlEditor() {
  const {
    sqlText,
    sqlResults,
    sqlActiveResultIndex,
    setSqlText,
    setSqlResults,
    setSqlActiveResultIndex,
    upsertSavedQuery,
    selectedNode,
    loading,
    setLoading
  } = useDatabaseStore()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [dividerY, setDividerY] = useState(300)
  const [isDragging, setIsDragging] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const connId = selectedNode?.connId ?? ''
  const connName = selectedNode?.name ?? ''
  const dbName = selectedNode?.database ?? ''

  const executeSql = useCallback(
    async (sql: string) => {
      if (!connId || !sql.trim()) return
      setExecuting(true)
      setError(null)
      setLoading(true)
      try {
        const resp = await dbApi.executeDbSql(connId, sql.trim())
        if (resp.data) {
          const results: QueryResult[] = Array.isArray(resp.data) ? resp.data : [resp.data]
          setSqlResults(results)
          setSqlActiveResultIndex(0)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setSqlResults([])
      } finally {
        setExecuting(false)
        setLoading(false)
      }
    },
    [connId, setLoading, setSqlResults, setSqlActiveResultIndex]
  )

  const handleRunAll = useCallback(() => {
    executeSql(sqlText)
  }, [sqlText, executeSql])

  const handleRunSelected = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd)
    if (selected.trim()) {
      executeSql(selected)
    }
  }, [executeSql])

  const handleStop = useCallback(() => {
    setExecuting(false)
    setLoading(false)
  }, [setLoading])

  const handleSave = useCallback(() => {
    if (!connId || !sqlText.trim()) {
      toast.error('请选择连接并输入要保存的 SQL')
      return
    }

    const savedQuery = buildSavedQuery(sqlText.trim(), connId, connName, dbName)
    upsertSavedQuery(savedQuery)
    toast.success(`已保存查询：${savedQuery.name}`)
  }, [connId, connName, dbName, sqlText, upsertSavedQuery])

  const handleBeautify = useCallback(() => {
    setSqlText(formatSql(sqlText))
  }, [sqlText, setSqlText])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        const ta = textareaRef.current
        if (ta) {
          const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd)
          executeSql(selected.trim() || sqlText)
        }
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const ta = e.currentTarget
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const val = ta.value
        const newVal = `${val.substring(0, start)}  ${val.substring(end)}`
        setSqlText(newVal)
        requestAnimationFrame(() => {
          ta.selectionStart = start + 2
          ta.selectionEnd = start + 2
        })
      }
    },
    [sqlText, executeSql, setSqlText]
  )

  // Dragging divider
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const y = e.clientY - rect.top
      const clamped = Math.max(100, Math.min(y, rect.height - 80))
      setDividerY(clamped)
    }
    const onUp = () => setIsDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [isDragging])

  const activeResult = sqlResults[sqlActiveResultIndex] ?? null

  const lineCount = sqlText.split('\n').length

  return (
    <div ref={containerRef} className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-10 shrink-0 flex items-center gap-1 px-3 border-b border-solid border-(--vos-border)">
        <Button
          variant="toolbar-primary"
          size="sm"
          leadingIcon={<Play size={14} />}
          onClick={handleRunAll}
          disabled={executing || !connId}
        >
          运行
        </Button>
        <Button
          variant="toolbar"
          size="sm"
          leadingIcon={<Play size={14} />}
          onClick={handleRunSelected}
          disabled={executing || !connId}
        >
          选中运行
        </Button>
        <Button variant="toolbar" size="sm" leadingIcon={<Square size={14} />} onClick={handleStop} disabled={!executing}>
          停止
        </Button>

        <div className="w-px h-5 bg-(--vos-border) mx-1" />

        <Button variant="toolbar" size="sm" leadingIcon={<Save size={14} />} onClick={handleSave}>
          保存
        </Button>
        <Button variant="toolbar" size="sm" leadingIcon={<AlignLeft size={14} />} onClick={handleBeautify}>
          美化
        </Button>

        <div className="flex-1" />

        {connId && (
          <div className="flex items-center gap-1 text-xs text-(--vos-text-secondary)">
            <Database size={12} />
            <span>
              {connName}
              {dbName ? ` / ${dbName}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
        {/* SQL textarea with line numbers */}
        <div className="flex overflow-hidden" style={{ height: dividerY }}>
          <div className="w-10 shrink-0 bg-(--vos-bg-elevated) border-r border-solid border-(--vos-border) pt-2 text-right pr-1.5 select-none overflow-hidden">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className="text-[11px] leading-5 text-(--vos-text-secondary)">
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={sqlText}
            onChange={e => setSqlText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 p-2 text-xs font-mono leading-5 bg-(--vos-bg) text-(--vos-text) border-none outline-none resize-none"
            placeholder="输入 SQL 语句... (Ctrl/Cmd+Enter 执行)"
            spellCheck={false}
          />
        </div>

        {/* Draggable divider */}
        <div
          className={`h-1.5 shrink-0 cursor-row-resize flex items-center justify-center bg-(--vos-bg-elevated) border-y border-solid border-(--vos-border) hover:bg-(--vos-bg-hover) ${isDragging ? 'bg-(--vos-bg-hover)' : ''}`}
          onMouseDown={startDrag}
        >
          <div className="w-8 h-0.5 rounded bg-(--vos-border)" />
        </div>

        {/* Results panel */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 60 }}>
          {/* Result tabs */}
          {sqlResults.length > 0 && (
            <div className="h-8 shrink-0 flex items-center gap-0 border-b border-solid border-(--vos-border) bg-(--vos-bg-elevated) px-2 overflow-x-auto">
              {sqlResults.map((_, i) => (
                <button
                  type="button"
                  key={i}
                  className={`h-full px-3 text-xs cursor-pointer border-b-2 border-solid transition-colors ${
                    sqlActiveResultIndex === i
                      ? 'border-(--vos-primary) text-(--vos-primary) bg-transparent'
                      : 'border-transparent text-(--vos-text-secondary) hover:text-(--vos-text) bg-transparent'
                  }`}
                  onClick={() => setSqlActiveResultIndex(i)}
                >
                  结果 {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Result content */}
          <div className="flex-1 overflow-auto">
            {executing && (
              <div className="flex items-center justify-center h-full">
                <Spinner size="md" />
              </div>
            )}
            {!executing && error && <div className="p-4 text-xs text-(--vos-error)">{error}</div>}
            {!executing && !error && activeResult && <ResultTable result={activeResult} />}
            {!executing && !error && sqlResults.length === 0 && (
              <div className="flex items-center justify-center h-full text-xs text-(--vos-text-secondary)">
                运行查询以查看结果
              </div>
            )}
          </div>

          {/* Status bar */}
          {activeResult && !executing && (
            <div className="h-6 shrink-0 flex items-center gap-3 px-3 border-t border-solid border-(--vos-border) bg-(--vos-bg-elevated) text-[11px] text-(--vos-text-secondary)">
              <span>{activeResult.rows.length} 行</span>
              <span>{activeResult.execution_time_ms} ms</span>
              {activeResult.affected_rows > 0 && <span>影响 {activeResult.affected_rows} 行</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultTable({ result }: { result: QueryResult }) {
  const cellRef = useRef<HTMLDivElement>(null)

  const copyCell = useCallback((value: unknown) => {
    navigator.clipboard.writeText(value == null ? 'NULL' : String(value)).then(() => toast.success('已复制'))
  }, [])

  return (
    <div ref={cellRef} className="overflow-auto h-full">
      <table className="w-full text-xs border-collapse min-w-max">
        <thead>
          <tr className="bg-(--vos-bg-elevated) sticky top-0 z-1">
            <th className="text-center px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-10">
              #
            </th>
            {result.columns.map((col, i) => (
              <th
                key={i}
                className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) whitespace-nowrap"
              >
                <div className="flex flex-col">
                  <span>{col}</span>
                  {result.column_types?.[i] && (
                    <span className="text-[10px] font-normal opacity-60">{result.column_types[i]}</span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-(--vos-bg-elevated)">
              <td className="text-center px-2 py-1 border-b border-solid border-(--vos-border) text-(--vos-text-secondary)">
                {ri + 1}
              </td>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-2 py-1 border-b border-solid border-(--vos-border) text-(--vos-text) whitespace-nowrap max-w-60 overflow-hidden text-ellipsis cursor-pointer"
                  title={cell == null ? 'NULL' : String(cell)}
                  onDoubleClick={() => copyCell(cell)}
                >
                  {cell == null ? <span className="text-(--vos-text-secondary) italic">NULL</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
