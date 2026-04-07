/**
 * Log Center App — displays all in-memory log entries.
 *
 * Features:
 * - Level filter (debug / info / warn / error)
 * - Module text filter
 * - Auto-scroll to latest
 * - Clear all
 */

import { Ban, ChevronDown, ScrollText, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LogLevel } from '@/infra/logger'
import { useLogStore } from '@/infra/logger'
import type { AppComponentProps } from '@/kernel'

// ─── Constants ─────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'var(--vos-text-tertiary)',
  info: 'var(--vos-accent-primary)',
  warn: 'var(--vos-accent-warning)',
  error: 'var(--vos-accent-danger)',
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
}

const ALL_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

// ─── Styles ────────────────────────────────────────────────────────────────

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--vos-bg-primary)',
    color: 'var(--vos-text-primary)',
    fontSize: 12,
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderBottom: '1px solid var(--vos-border-primary)',
    flexShrink: 0,
  },
  filterInput: {
    flex: 1,
    padding: '4px 8px',
    fontSize: 12,
    border: '1px solid var(--vos-border-primary)',
    borderRadius: 4,
    background: 'var(--vos-bg-secondary)',
    color: 'var(--vos-text-primary)',
    outline: 'none',
  },
  levelBtn: (active: boolean) => ({
    padding: '2px 8px',
    fontSize: 11,
    border: `1px solid ${active ? 'var(--vos-accent-primary)' : 'var(--vos-border-primary)'}`,
    borderRadius: 4,
    background: active ? 'var(--vos-accent-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--vos-text-secondary)',
    cursor: 'pointer',
  }),
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    border: '1px solid var(--vos-border-primary)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--vos-text-secondary)',
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    fontSize: 11,
    lineHeight: '20px',
  },
  row: (level: LogLevel) => ({
    display: 'flex',
    gap: 8,
    padding: '0 12px',
    borderBottom: '0.5px solid var(--vos-border-subtle, var(--vos-border-secondary))',
    background: level === 'error'
      ? 'rgba(239,68,68,0.06)'
      : level === 'warn'
        ? 'rgba(245,158,11,0.04)'
        : 'transparent',
  }),
  cell: {
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 8,
    color: 'var(--vos-text-tertiary)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px',
    borderTop: '1px solid var(--vos-border-primary)',
    fontSize: 11,
    color: 'var(--vos-text-tertiary)',
    flexShrink: 0,
  },
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function LogCenterApp(_props: AppComponentProps) {
  const entries = useLogStore(s => s.entries)
  const clearEntries = useLogStore(s => s.clear)

  const [filter, setFilter] = useState('')
  const [activeLevels, setActiveLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS))
  const [autoScroll, setAutoScroll] = useState(true)

  const listRef = useRef<HTMLDivElement>(null)

  // Filter entries
  const filtered = useMemo(() => {
    const lowerFilter = filter.toLowerCase()
    return entries.filter(e => {
      if (!activeLevels.has(e.level)) return false
      if (lowerFilter && !e.module.toLowerCase().includes(lowerFilter) && !e.message.toLowerCase().includes(lowerFilter)) return false
      return true
    })
  }, [entries, activeLevels, filter])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [filtered, autoScroll])

  const toggleLevel = useCallback((level: LogLevel) => {
    setActiveLevels(prev => {
      const next = new Set(prev)
      if (next.has(level)) {
        next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }, [])

  return (
    <div style={s.root}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <ScrollText size={14} color="var(--vos-text-secondary)" />
        <input
          type="text"
          placeholder="搜索模块或消息…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={s.filterInput}
        />
        {ALL_LEVELS.map(level => (
          <button
            key={level}
            type="button"
            style={s.levelBtn(activeLevels.has(level))}
            onClick={() => toggleLevel(level)}
          >
            {LEVEL_LABELS[level]}
          </button>
        ))}
        <button
          type="button"
          title={autoScroll ? '自动滚动: 开' : '自动滚动: 关'}
          style={{ ...s.iconBtn, color: autoScroll ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }}
          onClick={() => setAutoScroll(v => !v)}
        >
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          title="清空日志"
          style={s.iconBtn}
          onClick={clearEntries}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Log list */}
      {filtered.length === 0 ? (
        <div style={s.empty}>
          <Ban size={28} />
          <span>{entries.length === 0 ? '暂无日志' : '无匹配日志'}</span>
        </div>
      ) : (
        <div ref={listRef} style={s.list}>
          {filtered.map(entry => (
            <div key={entry.id} style={s.row(entry.level)}>
              <span style={{ ...s.cell, width: 90, color: 'var(--vos-text-tertiary)' }}>
                {formatTime(entry.timestamp)}
              </span>
              <span
                style={{
                  ...s.cell,
                  width: 44,
                  fontWeight: 600,
                  color: LEVEL_COLORS[entry.level],
                }}
              >
                {LEVEL_LABELS[entry.level]}
              </span>
              <span style={{ ...s.cell, width: 140, color: 'var(--vos-accent-secondary, #a78bfa)' }}>
                {entry.module}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={s.footer}>
        <span>共 {filtered.length} / {entries.length} 条</span>
        <span>最大 2000 条</span>
      </div>
    </div>
  )
}
