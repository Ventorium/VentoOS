import { Pencil } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { VList } from 'virtua'

interface DataGridProps {
  columns: string[]
  columnTypes?: string[]
  rows: unknown[][]
  readOnly?: boolean
  onCellEdit?: (rowIndex: number, colIndex: number, value: unknown) => void
  selectedRows?: Set<number>
  onSelectRow?: (rowIndex: number, multi?: boolean) => void
  editedRows?: Set<number>
}

interface EditingCell {
  row: number
  col: number
}

const ROW_HEIGHT = 30

function typeIcon(colType: string | undefined): string {
  if (!colType) return '?'
  const t = colType.toLowerCase()
  if (t.includes('int') || t.includes('float') || t.includes('double') || t.includes('numeric') || t.includes('decimal') || t.includes('real') || t.includes('serial'))
    return '#'
  if (t.includes('bool'))
    return '☑'
  if (t.includes('date') || t.includes('time') || t.includes('timestamp'))
    return '⏱'
  if (t.includes('json'))
    return '{}'
  if (t.includes('text') || t.includes('char') || t.includes('varchar') || t.includes('string'))
    return 'ᴬᴮ'
  return '?'
}

function formatCellValue(value: unknown): { text: string; isNull: boolean } {
  if (value === null || value === undefined) return { text: '(NULL)', isNull: true }
  if (typeof value === 'object') return { text: JSON.stringify(value), isNull: false }
  return { text: String(value), isNull: false }
}

export function DataGrid({
  columns,
  columnTypes,
  rows,
  readOnly = false,
  onCellEdit,
  selectedRows,
  onSelectRow,
  editedRows,
}: DataGridProps) {
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Sort columns alphabetically; keep row data and types aligned.
  const sortedIndices = useMemo(() => {
    const indices = columns.map((_, i) => i)
    indices.sort((a, b) => columns[a].localeCompare(columns[b]))
    return indices
  }, [columns])

  const sortedColumns = useMemo(
    () => sortedIndices.map((i) => columns[i]),
    [sortedIndices, columns],
  )
  const sortedColumnTypes = useMemo(
    () => (columnTypes ? sortedIndices.map((i) => columnTypes[i]) : undefined),
    [sortedIndices, columnTypes],
  )
  const sortedRows = useMemo(
    () => rows.map((row) => sortedIndices.map((i) => row[i])),
    [rows, sortedIndices],
  )

  // Translate a sorted column index back to the original index for callbacks.
  const originalColIndex = useCallback(
    (sortedCol: number) => sortedIndices[sortedCol] ?? sortedCol,
    [sortedIndices],
  )

  const startEdit = useCallback(
    (row: number, col: number) => {
      if (readOnly) return
      const val = sortedRows[row]?.[col]
      setEditValue(val == null ? '' : String(val))
      setEditing({ row, col })
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [readOnly, sortedRows],
  )

  const commitEdit = useCallback(() => {
    if (!editing || !onCellEdit) return
    const original = sortedRows[editing.row]?.[editing.col]
    const newVal = editValue === '' && original === null ? null : editValue
    if (String(newVal) !== String(original)) {
      onCellEdit(editing.row, originalColIndex(editing.col), newVal)
    }
    setEditing(null)
  }, [editing, editValue, onCellEdit, sortedRows, originalColIndex])

  const cancelEdit = useCallback(() => {
    setEditing(null)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editing) return
      if (e.key === 'Escape') {
        cancelEdit()
      } else if (e.key === 'Enter') {
        commitEdit()
        if (editing.row + 1 < sortedRows.length) {
          startEdit(editing.row + 1, editing.col)
        }
      } else if (e.key === 'Tab') {
        e.preventDefault()
        commitEdit()
        const nextCol = editing.col + 1 < sortedColumns.length ? editing.col + 1 : 0
        const nextRow = nextCol === 0 ? Math.min(editing.row + 1, sortedRows.length - 1) : editing.row
        startEdit(nextRow, nextCol)
      }
    },
    [editing, cancelEdit, commitEdit, startEdit, sortedRows.length, sortedColumns.length],
  )

  const handleRowClick = useCallback(
    (rowIndex: number, e: React.MouseEvent) => {
      onSelectRow?.(rowIndex, e.shiftKey)
    },
    [onSelectRow],
  )

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--vos-bg-surface)' }}>
      <div
        className="flex shrink-0 sticky top-0 z-10"
        style={{
          background: 'var(--vos-bg-elevated)',
          borderBottom: '1px solid var(--vos-border-subtle)',
        }}
      >
        <div
          className="shrink-0 flex items-center justify-center text-xs font-medium px-2"
          style={{
            width: 52,
            minWidth: 52,
            color: 'var(--vos-text-tertiary)',
            borderRight: '1px solid var(--vos-border-subtle)',
            height: ROW_HEIGHT,
          }}
        >
          #
        </div>
        {sortedColumns.map((col, ci) => (
          <div
            key={col}
            className="flex items-center gap-1 px-2 text-xs font-medium truncate"
            style={{
              minWidth: 120,
              flex: '1 0 120px',
              color: 'var(--vos-text-secondary)',
              borderRight: '1px solid var(--vos-border-subtle)',
              height: ROW_HEIGHT,
            }}
          >
            <span
              className="shrink-0 text-[10px]"
              style={{ color: 'var(--vos-text-tertiary)' }}
            >
              {typeIcon(sortedColumnTypes?.[ci])}
            </span>
            <span className="truncate">{col}</span>
          </div>
        ))}
      </div>

      <VList style={{ flex: 1 }}>
        {sortedRows.map((row, ri) => {
          const isSelected = selectedRows?.has(ri) ?? false
          const isEdited = editedRows?.has(ri) ?? false
          return (
            <div
              key={ri}
              className="flex"
              style={{
                background: isSelected ? 'var(--vos-bg-selected)' : ri % 2 === 0 ? 'transparent' : 'var(--vos-bg-elevated)',
                borderBottom: '1px solid var(--vos-border-subtle)',
                minHeight: ROW_HEIGHT,
              }}
              onClick={(e) => handleRowClick(ri, e)}
            >
              <div
                className="shrink-0 flex items-center justify-center text-xs px-2"
                style={{
                  width: 52,
                  minWidth: 52,
                  color: 'var(--vos-text-tertiary)',
                  borderRight: '1px solid var(--vos-border-subtle)',
                }}
              >
                {isEdited ? (
                  <Pencil size={12} style={{ color: 'var(--vos-warning)' }} />
                ) : (
                  ri + 1
                )}
              </div>
              {row.map((cell, ci) => {
                const isEditingThis = editing?.row === ri && editing?.col === ci
                const { text, isNull } = formatCellValue(cell)
                return (
                  <div
                    key={ci}
                    className="flex items-center px-2 text-xs truncate"
                    style={{
                      minWidth: 120,
                      flex: '1 0 120px',
                      borderRight: '1px solid var(--vos-border-subtle)',
                      minHeight: ROW_HEIGHT,
                    }}
                    onDoubleClick={() => startEdit(ri, ci)}
                  >
                    {isEditingThis ? (
                      <input
                        ref={inputRef}
                        className="w-full h-full px-1 outline-none text-xs"
                        style={{
                          background: 'var(--vos-bg-input)',
                          color: 'var(--vos-text-primary)',
                          border: '1px solid var(--vos-accent-primary)',
                          borderRadius: 2,
                        }}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={handleKeyDown}
                      />
                    ) : (
                      <span
                        className={isNull ? 'italic' : ''}
                        style={{
                          color: isNull ? 'var(--vos-text-tertiary)' : 'var(--vos-text-primary)',
                        }}
                      >
                        {text}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </VList>
    </div>
  )
}
