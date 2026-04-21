import { Search } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Spinner } from '@/components'
import { getFileIconByName } from '@/kernel/apps/file-icons'
import type { QuickOpenItem } from '../types'

interface Props {
  items: QuickOpenItem[]
  isIndexing: boolean
  onSelect: (item: QuickOpenItem) => void
  onClose: () => void
}

export default function CommandPalette({ items, isIndexing, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 100)
    return items.filter(i => i.name.toLowerCase().includes(q) || i.relativePath.toLowerCase().includes(q)).slice(0, 100)
  }, [items, query])

  // biome-ignore lint/correctness/useExhaustiveDependencies: setFocused is stable React setter
  useEffect(() => {
    setFocused(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.children[focused] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [focused])

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocused(f => Math.min(f + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocused(f => Math.max(f - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[focused]) onSelect(filtered[focused])
      }
    },
    [onClose, onSelect, filtered, focused]
  )

  return (
    <div className="absolute inset-0 flex flex-col items-center pt-10 z-50 bg-[rgba(0,0,0,0.45)]" onMouseDown={onClose}>
      <div
        className="w-full max-w-xl flex flex-col rounded-lg overflow-hidden shadow-2xl max-h-[65%] bg-[var(--vos-bg-overlay)] border border-[var(--vos-border-subtle)]"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-b-[var(--vos-border-subtle)]">
          <Search size={14} className="text-[var(--vos-text-tertiary)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="输入文件名以快速打开..."
            className="flex-1 py-3 text-sm outline-none bg-transparent text-[var(--vos-text-primary)]"
          />
          {isIndexing && <Spinner size={12} />}
        </div>
        <div ref={listRef} className="overflow-y-auto max-h-[380px]">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[var(--vos-text-tertiary)]">
              {query ? '无匹配文件' : isIndexing ? '正在建立文件索引...' : '请先打开文件夹'}
            </div>
          ) : (
            filtered.map((item, i) => {
              const iconInfo = getFileIconByName(item.name)
              const IconComp = iconInfo.icon
              return (
                <button
                  key={item.path}
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left border-none cursor-pointer"
                  style={{
                    background: i === focused ? 'var(--vos-accent-primary)' : 'transparent',
                    color: i === focused ? '#fff' : 'var(--vos-text-primary)'
                  }}
                  onMouseEnter={() => setFocused(i)}
                  onClick={() => onSelect(item)}
                >
                  <IconComp size={13} className="shrink-0" style={{ color: i === focused ? '#fff' : iconInfo.color }} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate font-medium">{item.name}</span>
                    {item.relativePath !== item.name && (
                      <span className="text-xs truncate opacity-[0.6]">{item.relativePath}</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
