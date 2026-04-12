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
  error: 'var(--vos-accent-danger)'
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR'
}

const ALL_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

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
      if (
        lowerFilter &&
        !e.module.toLowerCase().includes(lowerFilter) &&
        !e.message.toLowerCase().includes(lowerFilter)
      )
        return false
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
    <div className="flex flex-col h-full bg-[var(--vos-bg-primary)] text-[var(--vos-text-primary)] text-[12px] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-[6px] [border-bottom:1px_solid_var(--vos-border-primary)] shrink-0">
        <ScrollText size={14} color="var(--vos-text-secondary)" />
        <input
          type="text"
          placeholder="搜索模块或消息…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="flex-1 px-2 py-1 text-[12px] border border-[var(--vos-border-primary)] rounded bg-[var(--vos-bg-secondary)] text-[var(--vos-text-primary)] outline-none"
        />
        {ALL_LEVELS.map(level => (
          <button
            key={level}
            type="button"
            className={`px-2 py-[2px] text-[11px] rounded cursor-pointer ${
              activeLevels.has(level)
                ? 'border border-[var(--vos-accent-primary)] bg-[var(--vos-accent-primary)] text-white'
                : 'border border-[var(--vos-border-primary)] bg-transparent text-[var(--vos-text-secondary)]'
            }`}
            onClick={() => toggleLevel(level)}
          >
            {LEVEL_LABELS[level]}
          </button>
        ))}
        <button
          type="button"
          title={autoScroll ? '自动滚动: 开' : '自动滚动: 关'}
          className="inline-flex items-center justify-center w-[26px] h-[26px] border border-[var(--vos-border-primary)] rounded bg-transparent cursor-pointer"
          style={{ color: autoScroll ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }}
          onClick={() => setAutoScroll(v => !v)}
        >
          <ChevronDown size={14} />
        </button>
        <button type="button" title="清空日志" className="inline-flex items-center justify-center w-[26px] h-[26px] border border-[var(--vos-border-primary)] rounded bg-transparent text-[var(--vos-text-secondary)] cursor-pointer" onClick={clearEntries}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Log list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-[var(--vos-text-tertiary)]">
          <Ban size={28} />
          <span>{entries.length === 0 ? '暂无日志' : '无匹配日志'}</span>
        </div>
      ) : (
        <div ref={listRef} className="flex-1 overflow-auto font-mono text-[11px] leading-[20px]">
          {filtered.map(entry => (
            <div
              key={entry.id}
              className="flex gap-2 px-3 [border-bottom:0.5px_solid_var(--vos-border-subtle)]"
              style={{
                background: entry.level === 'error' ? 'rgba(239,68,68,0.06)' : entry.level === 'warn' ? 'rgba(245,158,11,0.04)' : undefined
              }}
            >
              <span className="shrink-0 overflow-hidden text-ellipsis whitespace-nowrap w-[90px] text-[var(--vos-text-tertiary)]">
                {formatTime(entry.timestamp)}
              </span>
              <span
                className="shrink-0 overflow-hidden text-ellipsis whitespace-nowrap w-[44px] font-semibold"
                style={{ color: LEVEL_COLORS[entry.level] }}
              >
                {LEVEL_LABELS[entry.level]}
              </span>
              <span
                className="shrink-0 overflow-hidden text-ellipsis whitespace-nowrap w-[140px]"
                style={{ color: 'var(--vos-accent-secondary, #a78bfa)' }}
              >
                {entry.module}
              </span>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 [border-top:1px_solid_var(--vos-border-primary)] text-[11px] text-[var(--vos-text-tertiary)] shrink-0">
        <span>
          共 {filtered.length} / {entries.length} 条
        </span>
        <span>最大 2000 条</span>
      </div>
    </div>
  )
}
